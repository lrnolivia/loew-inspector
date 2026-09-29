import { chromium } from "playwright";

const target = new URL(process.env.TARGET_URL || "");
const requestId = process.env.REQUEST_ID || "";
const projectId = process.env.PROJECT_ID || "";
const suiteId = process.env.SUITE || "field.stage0";
const environment = process.env.ENVIRONMENT || "qa";
const clientId = process.env.CF_ACCESS_CLIENT_ID || "";
const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET || "";
const commitSha = process.env.COMMIT_SHA || "";
const prNumber = process.env.PR_NUMBER ? Number(process.env.PR_NUMBER) : null;
const deploymentId = process.env.DEPLOYMENT_ID || "";
const ingestBase = process.env.INSPECTOR_BRIDGE || "https://loew-inspector-gateway.lrnoliv.workers.dev";

if (!/^[a-zA-Z0-9._-]{1,80}$/.test(requestId)) throw new Error("Safe request id required");
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(projectId)) throw new Error("Valid project id required");
if (!clientId || !clientSecret) throw new Error("Inspector bridge credentials required");
if (target.protocol !== "https:" || !(target.hostname === "field.loew.fi" || target.hostname.endsWith(".field-preview.loew.fi")) ||
    target.username || target.password || target.port || target.search || target.hash ||
    target.pathname !== "/qa/work/" + encodeURIComponent(projectId)) {
  throw new Error("TARGET_URL must be the canonical field /qa/work/{projectId} route");
}

const SUITES = Object.freeze({
  "field.canvas-first-paint": [
    { id: "canvas-first-paint", label: "Canvas first paint", action: "first-paint" }
  ],
  "field.full": [
    { id: "full", label: "Full", action: "layout", value: "Full" }
  ],
  "field.focus": [
    { id: "focus", label: "Focus", action: "layout", value: "Focus" }
  ],
  "field.float": [
    { id: "float", label: "Float", action: "layout", value: "Float" }
  ],
  "field.stage0": [
    { id: "canvas-first-paint", label: "Canvas first paint", action: "first-paint" },
    { id: "full", label: "Full", action: "layout", value: "Full" },
    { id: "focus", label: "Focus", action: "layout", value: "Focus" },
    { id: "float", label: "Float", action: "layout", value: "Float" }
  ]
});

const steps = SUITES[suiteId];
if (!steps) throw new Error("Unknown evidence suite");
const runId = "run_" + crypto.randomUUID();
const startedAt = new Date().toISOString();
const accessHeader = JSON.stringify({
  "cf-access-client-id": clientId,
  "cf-access-client-secret": clientSecret
});
const authHeaders = {
  "Authorization": accessHeader,
  "CF-Access-Client-Id": clientId,
  "CF-Access-Client-Secret": clientSecret
};

async function postRun(status, completed, extra = {}) {
  const body = {
    run_id: runId,
    request_id: requestId,
    label: suiteId,
    project: "field",
    project_id: projectId,
    environment,
    suite: suiteId,
    engine: "github-chromium",
    engine_reason: "deterministic_recipe",
    status,
    step_total: steps.length,
    step_completed: completed,
    created_at: startedAt,
    ...extra
  };
  const response = await fetch(ingestBase + "/evidence/run", {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error("Unable to update evidence run: " + response.status + " " + (await response.text()).slice(0, 240));
  return response.json();
}

async function uploadCapture({ step, index, screenshot, title, dom, accessibility, errors, stepStatus }) {
  const context = {
    project: "field",
    project_id: projectId,
    environment,
    surface: "editor",
    route_kind: "qa-work",
    commit_sha: commitSha || null,
    pr_number: Number.isInteger(prNumber) && prNumber > 0 ? prNumber : null,
    deployment_id: deploymentId || null
  };
  const metadata = {
    request_id: requestId,
    target_url: target.toString(),
    kind: "qa_capture",
    context,
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    engine: "github-chromium",
    engine_reason: "deterministic_recipe",
    run_id: runId,
    run_label: suiteId,
    suite: suiteId,
    step_id: step.id,
    step_label: step.label,
    step_index: index + 1,
    step_total: steps.length,
    title,
    dom,
    accessibility,
    trace: [{ action: step.action, value: step.value || null, status: stepStatus }],
    errors
  };
  const form = new FormData();
  form.set("metadata", JSON.stringify(metadata));
  form.set("screenshot", new Blob([screenshot], { type: "image/png" }), step.id + ".png");
  const response = await fetch(ingestBase + "/evidence/ingest", {
    method: "POST",
    headers: authHeaders,
    body: form
  });
  if (!response.ok) throw new Error("Unable to ingest evidence: " + response.status + " " + (await response.text()).slice(0, 240));
  return response.json();
}

async function waitForFirstPaint(page) {
  try {
    await page.getByText("Starting canvas", { exact: true }).waitFor({ state: "hidden", timeout: 15000 });
  } catch {}
  const iframe = page.locator("iframe[data-canvas-iframe]").first();
  const src = await iframe.getAttribute("src").catch(() => null);
  if (!src) throw new Error("Canvas iframe missing");
  const sandbox = page.frameLocator("iframe[data-canvas-iframe]");
  await sandbox.locator("[data-content-root]").first().waitFor({ state: "attached", timeout: 20000 });
  await sandbox.locator("[data-viewport]").first().waitFor({ state: "attached", timeout: 20000 });
}

async function clickLayout(page, value) {
  const exact = page.getByRole("button", { name: value, exact: true }).first();
  if (await exact.count()) {
    await exact.click({ timeout: 7000 });
  } else {
    await page.getByText(value, { exact: true }).first().click({ timeout: 7000 });
  }
  await page.waitForTimeout(350);
}

async function snapshotSummaries(page) {
  const html = await page.content();
  const elementCount = await page.locator("*").count();
  let aria = null;
  try {
    const text = await page.locator("body").ariaSnapshot({ timeout: 5000 });
    aria = {
      available: true,
      line_count: String(text || "").split("\n").filter(Boolean).length,
      bytes: Buffer.byteLength(String(text || ""))
    };
  } catch {
    aria = { available: false, line_count: 0, bytes: 0 };
  }
  return {
    dom: { html_bytes: Buffer.byteLength(html), element_tag_count: elementCount },
    accessibility: aria
  };
}

let browser;
let completed = 0;
let failed = 0;
const captures = [];
try {
  await postRun("running", 0);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push("page: " + error.message.slice(0, 260)));
  page.on("requestfailed", request => runtimeErrors.push("request: " + request.url() + " " + (request.failure()?.errorText || "")).slice(0, 300));

  const response = await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 25000 });
  if ((response?.status() || 0) !== 200) throw new Error("Editor QA route returned " + (response?.status() || 0));
  await page.waitForTimeout(1200);

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const beforeErrors = runtimeErrors.length;
    let stepStatus = "pass";
    let stepError = null;
    try {
      if (step.action === "first-paint") await waitForFirstPaint(page);
      if (step.action === "layout") await clickLayout(page, step.value);
    } catch (error) {
      stepStatus = "failed";
      stepError = error instanceof Error ? error.message : String(error);
      failed += 1;
    }

    const summaries = await snapshotSummaries(page);
    const screenshot = await page.screenshot({ fullPage: true });
    const errors = runtimeErrors.slice(beforeErrors, beforeErrors + 20);
    if (stepError) errors.unshift(stepError);
    const stored = await uploadCapture({
      step,
      index,
      screenshot,
      title: await page.title(),
      dom: summaries.dom,
      accessibility: summaries.accessibility,
      errors,
      stepStatus
    });
    completed += 1;
    captures.push({
      evidence_id: stored.evidence_id,
      step_id: step.id,
      status: stepStatus
    });
    await postRun("running", completed, failed ? { error: failed + " step(s) failed" } : {});
  }

  const status = failed ? "failed" : "complete";
  await postRun(status, completed, failed ? { error: failed + " step(s) failed" } : {});
  console.log("LOEW_EVIDENCE_RESULT=" + JSON.stringify({
    ok: !failed,
    run_id: runId,
    request_id: requestId,
    suite: suiteId,
    engine: "github-chromium",
    status,
    captures
  }));
  if (failed) process.exitCode = 1;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  try { await postRun("failed", completed, { error: message.slice(0, 500) }); } catch {}
  console.log("LOEW_EVIDENCE_RESULT=" + JSON.stringify({
    ok: false,
    run_id: runId,
    request_id: requestId,
    suite: suiteId,
    engine: "github-chromium",
    status: "failed",
    error: message
  }));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
