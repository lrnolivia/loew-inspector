import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { webAssets, webBuildId } from "../generated.js";
import worker from "../../mcp/index.js";

test("website entrypoints serve React and expose a deterministic build identity", async () => {
  for (const route of ["/", "/index.html", "/inspector"]) {
    const response = await worker.fetch(new Request("https://relay.loew.fi" + route), {});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Relay-Web-Build"), webBuildId);
    assert.match(webBuildId, /^[a-f0-9]{64}$/);
    assert.match(await response.text(), route === "/inspector" ? /data-relay-inspector-navigation/ : /id="root"/);
  }
  for (const route of ["today", "runner", "night-shift"]) {
    const response = await worker.fetch(new Request("https://relay.loew.fi/" + route + "?project=relay"), {});
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("Location"), "https://relay.loew.fi/#/" + route + "?project=relay");
  }
});

test("actual built website navigation leaves Inspector for React on desktop and mobile", async () => {
  const progress = { project: "relay", progress: [{ assignment: "website-repair", goal: "Restore the Relay website", state: "working", observed: true, stage: "implementation", primary_staff: "nico", next_action: "verify the deployed pages", last_meaningful_progress_at: new Date().toISOString(), events: [] }], queue: [] };
  const workers = [{ id: "relay", name: "relay", enabled: true, runtime: { status: "idle", last_summary: "Website navigation and release verified.", last_run_at: new Date().toISOString() } }];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const asset = webAssets[url.pathname];
    if (asset) { res.setHeader("Content-Type", asset.type); return res.end(asset.text); }
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/api/projects") return res.end(JSON.stringify({ projects: [{ id: "relay", name: "relay" }] }));
    if (url.pathname === "/api/workers") return res.end(JSON.stringify(workers));
    if (url.pathname === "/api/progress/relay") return res.end(JSON.stringify(progress));
    if (url.pathname === "/api/visual") return res.end(JSON.stringify({ evidence: [] }));
    if (url.pathname === "/api/projects/relay") return res.end(JSON.stringify({ project: { id: "relay", name: "relay" }, coordination: { claims: [{ id: "website-repair", state: "active" }] } }));
    res.statusCode = 404; res.end("{}");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ headless: true });
  await mkdir("qa-evidence/website", { recursive: true });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, colorScheme: "dark", reducedMotion: "reduce" });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      const captures = [];
      for (const [label, nav, route] of [["today", "today", "today"], ["runner", "projects", "runner"], ["night shift", "night-shift", "night-shift"]]) {
        await page.goto(origin + "/inspector#review");
        await page.getByRole("heading", { name: "inspector", exact: true, level: 1 }).waitFor();
        await page.locator(`[data-nav="${nav}"]`).click();
        await page.getByRole("heading", { name: label, exact: true, level: 1 }).waitFor();
        assert.equal(new URL(page.url()).pathname, "/");
        assert.equal(new URL(page.url()).hash, "#/" + route);
        assert.equal(await page.locator("#root .react-page").count(), 1);
        assert.equal(await page.locator("#project-tabs").count(), 0);
        await page.locator('.operator-connection[data-tone="good"]').waitFor();
        await page.locator("[data-progress-notice]").waitFor({ state: "detached" });
        const font = await page.locator(".react-operator-nav .nav-copy strong").first().evaluate(node => getComputedStyle(node).fontFamily);
        assert.match(font, /Momo Trust Display/);
        const images = await page.locator(".signal-mark").evaluateAll(nodes => nodes.map(node => ({ src: node.src, loaded: node.complete && node.naturalWidth > 0 })));
        assert.equal(images.length, 4);
        assert.ok(images.every(image => image.loaded));
        const file = route === "night-shift" ? "nightshift-icon.png.png" : route + "-icon.png";
        const canonical = "data:image/png;base64," + (await readFile(new URL("../../../icons/" + file, import.meta.url))).toString("base64");
        assert.ok(images.every(image => image.src === canonical), "built website uses the exact canonical icon bytes");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: `qa-evidence/website/${route}-${viewport.width}.png`, fullPage: true });
        captures.push(route);
      }
      await page.getByRole("link", { name: /^inspector/ }).click();
      await page.getByRole("heading", { name: "inspector", exact: true, level: 1 }).waitFor();
      await page.locator(".chat-card-preview").waitFor();
      await page.screenshot({ path: `qa-evidence/website/inspector-${viewport.width}.png`, fullPage: true });
      assert.equal(new URL(page.url()).pathname, "/inspector");
      for (const [hash, target] of [["today", "today"], ["projects?project=relay", "runner?project=relay"], ["night-shift", "night-shift"]]) {
        await page.goto(origin + "/inspector#" + hash);
        await page.waitForURL(origin + "/#/" + target);
        assert.equal(await page.locator("#project-tabs").count(), 0);
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    await writeFile("qa-evidence/website/result.json", JSON.stringify({ build: webBuildId, ok: true, source: process.env.GITHUB_SHA || null, surfaces: ["today", "runner", "night-shift", "inspector"], viewports: [1440, 390] }, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
