// Exact-source live smoke; credentials stay in the GitHub Actions environment.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const headers = {
  "Content-Type": "application/json",
  Authorization: JSON.stringify({ "cf-access-client-id": process.env.CF_ACCESS_CLIENT_ID, "cf-access-client-secret": process.env.CF_ACCESS_CLIENT_SECRET }),
  "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID,
  "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET
};
const results = [];
async function rpc(method, params = {}) {
  const response = await fetch("https://relay.loew.fi/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: results.length + 1, method, params }), signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error("MCP HTTP " + response.status);
  const payload = await response.json();
  if (payload.error || payload.result?.isError) throw new Error("MCP failed: " + method + "/" + (params.name || ""));
  return payload.result;
}
async function call(name, args = {}) {
  const result = await rpc("tools/call", { name, arguments: args });
  results.push({ tool: name, result: result.structuredContent });
  return result.structuredContent;
}
try {
  const initialized = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "relay-production-smoke", version: "1" } });
  if (initialized.serverInfo.name !== "relay") throw new Error("Unexpected MCP identity");
  const tools = await rpc("tools/list");
  for (const name of ["relay_ui_control_center", "relay_ui_request", "relay_source_pull_request_action", "relay_runner_coordinate", "relay_cloud_upload_version", "relay_verify_fetch_url"]) {
    if (!tools.tools.some(tool => tool.name === name)) throw new Error("Missing tool " + name);
  }
  const resources = await rpc("resources/list");
  const skills = await rpc("skills/list");
  if (skills.skills.length < 6) throw new Error("Skill surface incomplete");
  const app = await rpc("resources/read", { uri: "ui://relay/control-center/v1.html" });
  if (!app.contents[0].text.includes('data-page="night-shift"')) throw new Error("Shared app missing");
  await call("relay_source_status");
  await call("relay_source_repo", { repo: "relay" });
  await call("relay_runner_project", { project: "relay" });
  await call("relay_runner_workers");
  for (const path of ["/api/projects", "/api/projects/relay", "/api/projects/relay/icon", "/api/workers", "/api/visual"]) {
    const result = await call("relay_ui_request", { path });
    if (result.status !== 200) throw new Error("UI API failed " + path);
    if (path === "/api/projects/relay/icon") {
      if (result.body.status !== "found" || result.body.icon.repository !== "lrnolivia/relay" || result.body.icon.path !== "apps/web/public/brand/relay-loop.png" || !/^[a-f0-9]{40}$/.test(result.body.icon.blob_sha)) throw new Error("Genuine Relay icon provenance failed");
    }
    if (path === "/api/visual" && result.body.evidence?.length) {
      const id = result.body.evidence[0].evidence_id;
      const qa = await call("relay_ui_request", { path: "/api/visual/" + id + "/qa" });
      if (qa.status !== 200 || qa.body.evidence.evidence_id !== id) throw new Error("QA identity readback failed");
    }
  }
  const worker = await call("relay_cloud_worker", { script: "relay" });
  const active = worker.deployments.deployments[0].versions[0].version_id;
  const version = worker.versions.items.find(version => version.id === active);
  if (version?.annotations?.["workers/commit_sha"] !== process.env.EXPECTED_SOURCE_SHA) throw new Error("Deployed source does not match expected SHA");
  for (const path of ["/", "/relay-app.js", "/api/projects", "/api/projects/relay/icon", "/api/workers", "/api/visual"]) {
    const response = await fetch("https://relay.loew.fi" + path, { headers, redirect: "manual", signal: AbortSignal.timeout(45000) });
    if (response.status !== 200) throw new Error("Web route failed " + path + " HTTP " + response.status);
    if (path === "/" && !(await response.text()).includes("Night Shift")) throw new Error("Web shell missing");
    results.push({ web_path: path, status: response.status });
  }
  if (process.env.BROWSER_CAPTURE === "true") {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      for (const capture of [
        { id: "desktop-dark", width: 1366, height: 1024, colorScheme: "dark" },
        { id: "mobile-light", width: 390, height: 844, colorScheme: "light" }
      ]) {
        const page = await browser.newPage({ viewport: { width: capture.width, height: capture.height }, colorScheme: capture.colorScheme });
        // Credentials are attached only to this exact origin, never font/CDN requests.
        await page.route("https://relay.loew.fi/**", route => route.continue({ headers: { ...route.request().headers(), ...headers } }));
        await page.goto("https://relay.loew.fi", { waitUntil: "domcontentloaded" });
        await page.locator("#operator-connection").filter({ hasText: "Connected" }).waitFor();
        await page.getByRole("button", { name: "Projects", exact: true }).click();
        await page.locator('#project-list [data-repo-icon="relay"][data-icon-source="lrnolivia/relay/apps/web/public/brand/relay-loop.png"] img').waitFor();
        await page.locator('#project-list [data-project-id="relay"]').click();
        await page.locator(".project-detail-head h2").filter({ hasText: "relay" }).waitFor();
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Production viewport overflow: " + capture.id);
        const screenshot = await page.screenshot({ fullPage: false });
        const form = new FormData();
        form.set("metadata", JSON.stringify({
          request_id: "relay-brand-" + process.env.EXPECTED_SOURCE_SHA.slice(0, 12) + "-" + capture.id,
          target_url: "https://relay.loew.fi/", kind: "qa_capture", engine: "github-chromium",
          context: { project: "relay", environment: "production", surface: "shared-dashboard", route_kind: "runner", commit_sha: process.env.EXPECTED_SOURCE_SHA },
          viewport: { width: capture.width, height: capture.height, deviceScaleFactor: 1 },
          step_id: capture.id, step_label: "Relay Projects · " + capture.id,
          assertions: [{ id: "responsive-layout", status: "pass", detail: "No horizontal overflow; official repository icon loaded; shared source identity verified." }]
        }));
        form.set("screenshot", new Blob([screenshot], { type: "image/png" }), capture.id + ".png");
        const response = await fetch("https://relay.loew.fi/evidence/ingest", { method: "POST", headers: { Authorization: headers.Authorization, "CF-Access-Client-Id": headers["CF-Access-Client-Id"], "CF-Access-Client-Secret": headers["CF-Access-Client-Secret"] }, body: form });
        if (!response.ok) throw new Error("Visuals registration failed " + response.status);
        const receipt = await response.json();
        if (!receipt.evidence_id) throw new Error("Visuals receipt missing");
        results.push({ visual_capture: capture.id, mime_type: "image/png", sha256: createHash("sha256").update(screenshot).digest("hex"), receipt });
        await page.close();
      }
    } finally { await browser.close(); }
  }
  results.push({ discovery: { tools: tools.tools.length, resources: resources.resources.length, skills: skills.skills.length }, active_version: active, source_sha: process.env.EXPECTED_SOURCE_SHA });
  console.log("Relay production source, runtime, MCP discovery, web, project, workers and existing QA reads passed.");
} finally {
  await fs.writeFile(process.env.SMOKE_RESULT_PATH || "/tmp/relay-production-smoke.json", JSON.stringify({ results }, null, 2));
}
