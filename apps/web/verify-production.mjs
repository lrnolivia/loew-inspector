import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { webBuildId } from "./generated.js";

const expected = process.env.EXPECTED_SOURCE_SHA;
const clientId = process.env.CF_ACCESS_CLIENT_ID;
const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
if (!expected || !clientId || !clientSecret) throw new Error("Production website verification environment is incomplete");
const origin = "https://relay.loew.fi";
const headers = {
  Authorization: JSON.stringify({ "cf-access-client-id": clientId, "cf-access-client-secret": clientSecret }),
  "CF-Access-Client-Id": clientId, "CF-Access-Client-Secret": clientSecret
};
await mkdir("qa-evidence/production", { recursive: true });
let ready = false;
for (let attempt = 0; attempt < 12; attempt++) {
  const response = await fetch(origin + "/", { headers, signal: AbortSignal.timeout(15000) });
  if (response.ok && response.headers.get("X-Relay-Source-Sha") === expected && response.headers.get("X-Relay-Web-Build") === webBuildId) { ready = true; break; }
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
    for (const [feature, label, nav] of [["today", "today", "today"], ["runner", "runner", "projects"], ["night-shift", "night shift", "night-shift"]]) {
      await page.goto(origin + "/inspector#review");
      await page.locator(".chat-card-preview").waitFor();
      await page.locator(`[data-nav="${nav}"]`).click();
      await page.getByRole("heading", { name: label, exact: true, level: 1 }).waitFor();
      await page.locator('.operator-connection[data-tone="good"]').waitFor();
      assert.equal(new URL(page.url()).pathname, "/");
      assert.equal(new URL(page.url()).hash, "#/" + feature);
      assert.equal(await page.locator("#project-tabs").count(), 0);
      assert.equal(await page.locator(".signal-mark").count(), 4);
      assert.ok(await page.locator(".signal-mark").evaluateAll(nodes => nodes.every(node => node.complete && node.naturalWidth > 0)));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.match(await page.locator(".react-brand strong").evaluate(node => getComputedStyle(node).fontFamily), /Momo Trust Display/);
      await capture(page, feature, viewport);
    }
    await page.getByRole("link", { name: /^inspector/ }).click();
    await page.locator(".chat-card-preview").waitFor();
    assert.equal(new URL(page.url()).pathname, "/inspector");
    await capture(page, "inspector", viewport);
    assert.deepEqual(errors, []);
    await page.close();
  }
  await writeFile("qa-evidence/production/result.json", JSON.stringify({ ok: true, source_sha: expected, web_build: webBuildId, captures }, null, 2));
  console.log(JSON.stringify({ ok: true, source_sha: expected, web_build: webBuildId, captures }));
} finally { await browser.close(); }

async function capture(page, feature, viewport) {
  const surface = `${feature}-${viewport.width}`;
  const screenshot = await page.screenshot({ fullPage: true });
  await writeFile(`qa-evidence/production/${surface}.png`, screenshot);
  const metadata = {
    kind: "production_website_verification", target_url: page.url(),
    context: { project: "relay", environment: "production", surface, commit_sha: expected },
    engine: "github-chromium", step_label: `Actual website ${surface}`, viewport
  };
  const form = new FormData();
  form.set("metadata", JSON.stringify(metadata));
  form.set("screenshot", new Blob([screenshot], { type: "image/png" }), surface + ".png");
  const response = await fetch(origin + "/evidence/ingest", { method: "POST", headers, body: form, signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok, "production screenshot evidence must persist in Inspector: " + response.status);
  const evidence = await response.json();
  captures.push({ surface, url: page.url(), evidence_id: evidence.evidence_id });
}
