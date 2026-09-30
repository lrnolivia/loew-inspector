import { createSign } from "node:crypto";

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const TOKEN_CACHE = new Map();

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function normalizePrivateKey(value) {
  return String(value || "").replace(/\\n/g, "\n").trim();
}

function appConfigured(env) {
  return Boolean(env?.RELAY_GITHUB_APP_ID && env?.RELAY_GITHUB_APP_PRIVATE_KEY);
}

function legacyTokenConfigured(env) {
  return Boolean(env?.RELAY_GITHUB_TOKEN);
}

export function sourceAuthStatus(env) {
  const app = appConfigured(env);
  const legacy = legacyTokenConfigured(env);
  return {
    ok: true,
    namespace: "relay.SOURCE",
    auth_mode: app ? "github_app" : legacy ? "legacy_token" : "public_read",
    app_configured: app,
    legacy_token_configured: legacy,
    write_enabled: app || legacy,
    required_app_bindings: app ? [] : ["RELAY_GITHUB_APP_ID", "RELAY_GITHUB_APP_PRIVATE_KEY"]
  };
}

function createAppJwt(env) {
  if (!appConfigured(env)) throw new Error("relay.SOURCE GitHub App credentials are not configured");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iat: now - 60,
    exp: now + 540,
    iss: String(env.RELAY_GITHUB_APP_ID)
  }));
  const input = header + "." + payload;
  const signer = createSign("RSA-SHA256");
  signer.update(input);
  signer.end();
  const signature = signer.sign(normalizePrivateKey(env.RELAY_GITHUB_APP_PRIVATE_KEY)).toString("base64url");
  return input + "." + signature;
}

async function requestGitHub(path, token, options = {}) {
  if (typeof path !== "string" || !path.startsWith("/") || path.includes("://")) throw new Error("Invalid GitHub API path");
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    "User-Agent": "relay-by-loew-fi"
  };
  if (token) headers.Authorization = "Bearer " + token;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(GITHUB_API + path, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(10000)
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); }
    catch { body = { message: text.slice(0, 1000) }; }
  }
  if (!response.ok) {
    const error = new Error(body?.message || ("GitHub request failed with " + response.status));
    error.status = response.status;
    throw error;
  }
  return body;
}

function repositoryFromPath(path) {
  const match = String(path).match(/^\/repos\/([^/]+)\/([^/?]+)/);
  if (!match) return null;
  return { owner: decodeURIComponent(match[1]), repo: decodeURIComponent(match[2]) };
}

async function installationToken(env, owner, repo) {
  const cacheKey = owner.toLowerCase() + "/" + repo.toLowerCase();
  const cached = TOKEN_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;

  const jwt = createAppJwt(env);
  const installation = await requestGitHub(
    "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/installation",
    jwt
  );
  if (!installation?.id) throw new Error("Relay GitHub App is not installed on " + owner + "/" + repo);
  const created = await requestGitHub(
    "/app/installations/" + installation.id + "/access_tokens",
    jwt,
    { method: "POST", body: {} }
  );
  if (!created?.token) throw new Error("GitHub App installation token was not returned");
  const expiresAt = created.expires_at ? Date.parse(created.expires_at) : Date.now() + 50 * 60 * 1000;
  TOKEN_CACHE.set(cacheKey, { token: created.token, expiresAt });
  return created.token;
}

export async function githubApiRequest(env, path, options = {}) {
  const method = options.method || "GET";
  const write = !["GET", "HEAD"].includes(method);
  const repo = repositoryFromPath(path);

  if (appConfigured(env) && repo) {
    try {
      const token = await installationToken(env, repo.owner, repo.repo);
      return await requestGitHub(path, token, options);
    } catch (error) {
      if (write || error?.status !== 404) throw error;
    }
  }

  if (legacyTokenConfigured(env)) return requestGitHub(path, env.RELAY_GITHUB_TOKEN, options);
  if (write) throw new Error("relay.SOURCE writes require a Relay GitHub App installation");
  return requestGitHub(path, null, options);
}

export async function commitSourceFiles(env, { owner, repo, branch, files, message, expectedHeadSha }) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 20) {
    throw new Error("relay.SOURCE commits require 1-20 files");
  }
  if (typeof message !== "string" || message.length < 1 || message.length > 500) throw new Error("Invalid commit message");

  let aggregate = 0;
  const normalized = files.map((file) => {
    if (!file || typeof file.path !== "string" || !file.path || file.path.includes("..") || file.path.startsWith("/")) {
      throw new Error("Invalid repository path");
    }
    if (typeof file.content !== "string") throw new Error("File content must be UTF-8 text");
    aggregate += file.content.length;
    if (file.content.length > 500000 || aggregate > 1000000) throw new Error("relay.SOURCE commit payload is too large");
    return { path: file.path, content: file.content };
  });

  const repoBase = "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo);
  const repository = await githubApiRequest(env, repoBase);
  if (branch === repository?.default_branch) throw new Error("relay.SOURCE refuses direct default-branch commits");

  const encodedBranch = branch.split("/").map(encodeURIComponent).join("/");
  const ref = await githubApiRequest(env, repoBase + "/git/ref/heads/" + encodedBranch);
  const headSha = ref?.object?.sha;
  if (!headSha) throw new Error("Unable to resolve branch head");
  if (expectedHeadSha && expectedHeadSha !== headSha) throw new Error("Branch head changed; refresh before committing");

  const parent = await githubApiRequest(env, repoBase + "/git/commits/" + headSha);
  const blobs = [];
  for (const file of normalized) {
    const blob = await githubApiRequest(env, repoBase + "/git/blobs", {
      method: "POST",
      body: { content: file.content, encoding: "utf-8" }
    });
    blobs.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  const tree = await githubApiRequest(env, repoBase + "/git/trees", {
    method: "POST",
    body: { base_tree: parent?.tree?.sha, tree: blobs }
  });
  const commit = await githubApiRequest(env, repoBase + "/git/commits", {
    method: "POST",
    body: { message, tree: tree.sha, parents: [headSha] }
  });
  await githubApiRequest(env, repoBase + "/git/refs/heads/" + encodedBranch, {
    method: "PATCH",
    body: { sha: commit.sha, force: false }
  });

  return {
    ok: true,
    repository: owner + "/" + repo,
    branch,
    previous_head_sha: headSha,
    commit_sha: commit.sha,
    files: normalized.map((file) => file.path)
  };
}
