import { applyWorkerSettings, publicWorkerSettings } from "./settings.mjs";
import { listVisualEvidence, getVisualEvidence, getVisualImage } from "./visual-evidence.mjs";
const GITHUB_API = "https://api.github.com";
const OWNER = "lrnolivia";
const REPOSITORY = "loew-runner";
const BRANCH = "main";
const API_VERSION = "2022-11-28";

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function accessGuard(request, env) {
  if (String(env.REQUIRE_ACCESS ?? "true") === "false") return null;
  const assertion = request.headers.get("Cf-Access-Jwt-Assertion");
  if (assertion) return null;
  return json({
    error: "Cloudflare Access is not protecting this request. Controls remain locked until Access is active on this hostname."
  }, 403);
}

function tokenGuard(env) {
  if (env.RUNNER_GITHUB_TOKEN) return null;
  return json({
    error: "RUNNER_GITHUB_TOKEN is not configured as a Cloudflare Worker runtime secret."
  }, 503);
}

function githubHeaders(env, extra = {}) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${env.RUNNER_GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "loew-runner-cloudflare",
    ...extra
  };
}

async function githubRequest(env, path, options = {}) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: githubHeaders(env, options.headers)
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); }
    catch { body = { message: text.slice(0, 500) }; }
  }

  if (!response.ok) {
    const message = body?.message ?? `GitHub request failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return body;
}

function decodeBase64Utf8(value) {
  const binary = atob(String(value).replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function safeWorkerId(value) {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(value ?? "");
}

async function readJsonFile(env, path) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const data = await githubRequest(
    env,
    `/repos/${OWNER}/${REPOSITORY}/contents/${encoded}?ref=${encodeURIComponent(BRANCH)}`
  );
  if (data?.type !== "file" || !data.content) throw new Error(`${path} is not a readable repository file.`);
  return {
    sha: data.sha,
    value: JSON.parse(decodeBase64Utf8(data.content))
  };
}

async function writeJsonFile(env, path, value, sha, message) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return githubRequest(env, `/repos/${OWNER}/${REPOSITORY}/contents/${encoded}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: encodeBase64Utf8(`${JSON.stringify(value, null, 2)}\n`),
      sha,
      branch: BRANCH
    })
  });
}

async function listWorkerIds(env) {
  const data = await githubRequest(
    env,
    `/repos/${OWNER}/${REPOSITORY}/contents/workers?ref=${encodeURIComponent(BRANCH)}`
  );
  if (!Array.isArray(data)) throw new Error("workers/ is not a repository directory.");
  return data
    .filter((entry) => entry.type === "file" && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -5))
    .filter(safeWorkerId)
    .sort();
}

async function workerView(env, id) {
  const [{ value: config }, { value: runtime }] = await Promise.all([
    readJsonFile(env, `workers/${id}.json`),
    readJsonFile(env, `state/${id}.json`)
  ]);
  return { ...config, runtime };
}

async function workersView(env) {
  const ids = await listWorkerIds(env);
  return Promise.all(ids.map((id) => workerView(env, id)));
}

async function readBody(request) {
  if (!request.body) return {};
  const text = await request.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 }); }
}

async function dispatchWorkflow(env, workflow, inputs = {}) {
  await githubRequest(
    env,
    `/repos/${OWNER}/${REPOSITORY}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: BRANCH, inputs })
    }
  );
  return { ok: true, workflow };
}

async function handleApi(request, env) {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/api/health") {
    return json({ ok: true, service: "loew-runner", version: "0.4" });
  }

  const accessError = accessGuard(request, env);
  if (accessError) return accessError;

  if (request.method === "GET" && url.pathname === "/api/visual") {
    return json(await listVisualEvidence(env.EVIDENCE, 60));
  }

  const visualMatch = url.pathname.match(/^\/api\/visual\/(vis_[a-zA-Z0-9-]+)(?:\/(image))?$/);
  if (request.method === "GET" && visualMatch) {
    const [, evidenceId, resource] = visualMatch;
    if (resource === "image") {
      const image = await getVisualImage(env.EVIDENCE, evidenceId);
      if (!image) return json({ error: "Evidence image not found." }, 404);
      return new Response(image.body, {
        headers: {
          "Content-Type": image.contentType || "image/png",
          "Cache-Control": "private, no-store",
          "Content-Length": String(image.size)
        }
      });
    }
    const evidence = await getVisualEvidence(env.EVIDENCE, evidenceId);
    return evidence ? json(evidence) : json({ error: "Evidence not found." }, 404);
  }

  const tokenError = tokenGuard(env);
  if (tokenError) return tokenError;

  if (request.method === "GET" && url.pathname === "/api/workers") {
    return json(await workersView(env));
  }

  const match = url.pathname.match(/^\/api\/workers\/([^/]+)\/(toggle|settings|run|doctor|repair)$/);
  if (!match || request.method !== "POST") return json({ error: "Not found" }, 404);

  const [, id, action] = match;
  if (!safeWorkerId(id)) return json({ error: "Invalid worker id." }, 400);

  if (action === "toggle") {
    const path = `workers/${id}.json`;
    const { value: config, sha } = await readJsonFile(env, path);
    const body = await readBody(request);
    config.enabled = typeof body.enabled === "boolean" ? body.enabled : !config.enabled;
    await writeJsonFile(
      env,
      path,
      config,
      sha,
      `dashboard: ${config.enabled ? "enable" : "pause"} ${id}`
    );
    return json({ ok: true, enabled: config.enabled });
  }

  if (action === "settings") {
    const path = `workers/${id}.json`;
    const { value: config, sha } = await readJsonFile(env, path);
    const body = await readBody(request);
    const next = applyWorkerSettings(config, body);
    await writeJsonFile(env, path, next, sha, `dashboard: update ${id} runner settings`);
    return json({ ok: true, settings: publicWorkerSettings(next) });
  }

  if (action === "run") {
    const { value: config } = await readJsonFile(env, `workers/${id}.json`);
    if (!config.enabled) return json({ error: "Enable this worker before running it." }, 409);
    return json(await dispatchWorkflow(env, "runner.yml", { worker_id: id }), 202);
  }

  if (id !== "field") {
    return json({ error: `No ${action} workflow is configured for this worker yet.` }, 404);
  }

  if (action === "doctor") {
    return json(await dispatchWorkflow(env, "field-dependency-doctor.yml"), 202);
  }

  const { value: state } = await readJsonFile(env, `state/${id}.json`);
  if (state.dependency_health !== "repairable" || state.dependency?.repair_verified !== true) {
    return json({
      error: "Repair unlocks only after Dependency Doctor verifies the package-lock repair through clean install and build."
    }, 409);
  }
  return json(await dispatchWorkflow(env, "field-dependency-repair.yml"), 202);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      const status = Number(error?.status) || 500;
      return json({ error: error?.message ?? "Unexpected runner error." }, status);
    }
  }
};
