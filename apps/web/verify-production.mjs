import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { webBuildId } from "./generated.js";

const expected = process.env.EXPECTED_SOURCE_SHA;
const clientId = process.env.CF_ACCESS_CLIENT_ID;
const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
const diagnoseOnly = process.env.DIAGNOSE_ONLY === "true";
if (!expected || !clientId || !clientSecret) throw new Error("Production website verification environment is incomplete");
const origin = "https://relay.loew.fi";
const headers = {
  Authorization: JSON.stringify({ "cf-access-client-id": clientId, "cf-access-client-secret": clientSecret }),
  "CF-Access-Client-Id": clientId, "CF-Access-Client-Secret": clientSecret
};
await mkdir("qa-evidence/production", { recursive: true });
const api = [];
for (const path of ["/api/projects", "/api/workers"]) {
  const response = await fetch(origin + path, { headers, signal: AbortSignal.timeout(45000) });
  const body = await response.json().catch(() => null);
  api.push({ path, status: response.status, error: body?.error || null, shape: Array.isArray(body) ? "array" : Object.keys(body || {}) });
}
await writeFile("qa-evidence/production/api.json", JSON.stringify(api, null, 2));
console.log("WEBSITE_API=" + JSON.stringify(api));
let ready = false;
for (let attempt = 0; attempt < 12; attempt++) {
  const response = await fetch(origin + "/", { headers, signal: AbortSignal.timeout(15000) });
  if (response.ok && (diagnoseOnly || (response.headers.get("X-Relay-Source-Sha") === expected && response.headers.get("X-Relay-Web-Build") === webBuildId))) { ready = true; break; }
  await new Promise(resolve => setTimeout(resolve, 10000));
}
assert.ok(ready, "production must serve this exact source SHA and built website artifact");
const browser = await chromium.launch({ headless: true });
const captures = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, colorScheme: "dark", reducedMotion: "reduce" });
    await page.route(origin + "/**", route => route.continue({ headers: { ...route.request().headers(), ...headers } }));
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    if (diagnoseOnly) {
      await page.goto(origin + "/#/today");
      await page.waitForTimeout(12000);
      const requests = await page.evaluate(async () => Promise.all(["/api/projects", "/api/workers"].map(async path => {
        const response = await fetch(path);
        const body = await response.json().catch(() => null);
        return { path, status: response.status, error: body?.error || null, shape: Array.isArray(body) ? "array" : Object.keys(body || {}) };
      })));
      const diagnostic = { requests, connection: await page.locator(".operator-connection").innerText(), errors };
      await writeFile(`qa-evidence/production/diagnostic-${viewport.width}.json`, JSON.stringify(diagnostic, null, 2));
      await page.screenshot({ path: `qa-evidence/production/diagnostic-${viewport.width}.png`, fullPage: true });
      console.log("WEBSITE_BROWSER=" + JSON.stringify(diagnostic));
      await page.close();
      continue;
    }
    for (const [feature, label, nav] of [["today", "today", "today"], ["runner", "runner", "projects"], ["night-shift", "night shift", "night-shift"]]) {
      await page.goto(origin + "/inspector#review");
      await page.locator(".chat-card-preview").waitFor();
      await page.locator(`[data-nav="${nav}"]`).click();
      await page.getByRole("heading", { name: label, exact: true, level: 1 }).waitFor();
      await page.locator('.operator-connection[data-tone="good"]').waitFor();
      // The connection becomes live after the base snapshot; progress settles later.
      await page.waitForFunction(() => !Array.from(document.querySelectorAll('[data-progress-notice] strong')).some(node => node.textContent.includes('Loading project activity')), null, { timeout: 75000 });
      assert.equal(new URL(page.url()).pathname, "/");
      assert.equal(new URL(page.url()).hash, "#/" + feature);
      assert.equal(await page.locator("#project-tabs").count(), 0);
      assert.equal(await page.locator(".signal-mark").count(), 4);
      assert.ok(await page.locator(".signal-mark").evaluateAll(nodes => nodes.every(node => {
        const svg = node.querySelector('svg.relay-glyph');
        return svg && svg.getBoundingClientRect().width > 0 && svg.getBoundingClientRect().height > 0;
      })), "all semantic SVG glyphs must render");
      assert.equal(await page.locator('.project-tab[aria-pressed="true"]').innerText(), 'all projects');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.match(await page.locator(".react-brand strong").evaluate(node => getComputedStyle(node).fontFamily), /Momo Trust Display/);
      await capture(page, feature, viewport);
    }
    await page.getByRole("link", { name: /^inspector/ }).click();
    await page.locator(".chat-card-preview").waitFor();
    await page.locator('#review-list[data-summary-state="ready"], #review-list[data-summary-state="error"]').waitFor({ timeout: 75000 });
    assert.equal(new URL(page.url()).pathname, "/inspector");
    await capture(page, "inspector", viewport);
    assert.deepEqual(errors, []);
    await page.close();
  }
  await writeFile("qa-evidence/production/result.json", JSON.stringify({ ok: !diagnoseOnly, diagnostic: diagnoseOnly, source_sha: expected, web_build: webBuildId, captures }, null, 2));
  console.log(JSON.stringify({ ok: !diagnoseOnly, diagnostic: diagnoseOnly, source_sha: expected, web_build: webBuildId, captures }));
} finally { await browser.close(); }

async function capture(page, feature, viewport) {
  const surface = `${feature}-${viewport.width}`;
  const canonicalUrl = new URL(page.url());
  canonicalUrl.hash = "";
  const screenshot = await page.screenshot({ fullPage: true });
  await writeFile(`qa-evidence/production/${surface}.png`, screenshot);
  const metadata = {
    kind: "production_website_verification", target_url: canonicalUrl.toString(),
    context: { project: "relay", environment: "production", surface, commit_sha: expected },
    engine: "github-chromium", step_label: `Actual website ${surface}`, viewport,
    dom: { summary: await page.locator('.signal-card').allTextContents(), connection: await page.locator('.operator-connection').innerText(), notice: await page.locator('[data-progress-notice]').allTextContents(), review_state: await page.evaluate(() => document.querySelector('#review-list')?.dataset.summaryState || null) },
    trace: [{ action: "verify_actual_website", url: page.url(), initial_data_cycle: "settled success or explicitly labelled partial/error" }]
  };
  const form = new FormData();
  form.set("metadata", JSON.stringify(metadata));
  form.set("screenshot", new Blob([screenshot], { type: "image/png" }), surface + ".png");
  const response = await fetch(origin + "/evidence/ingest", { method: "POST", headers, body: form, signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, "production screenshot evidence must persist in Inspector: " + response.status);
  const evidence = await response.json();
  captures.push({ surface, url: page.url(), evidence_id: evidence.evidence_id, state: metadata.dom });
}
