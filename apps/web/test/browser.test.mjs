import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { chromium } from "playwright";
import { webAssets, mcpHtml } from "../generated.js";

const evidence = {
  evidence_id: "vis_12345678-abcd", captured_at: "2026-09-30T15:00:00Z", step_label: "Relay navigation",
  screenshot_url: "/api/visual/vis_12345678-abcd/image", context: { project: "relay", commit_sha: "a".repeat(40), environment: "preview" }
};
const questions = [{ id: "intent", prompt: "Is the next action clear?", reason: "Check the Relay flow." }];
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlAAAAABJRU5ErkJggg==", "base64");

test("shared interface works on web and MCP host transport, including mobile, deep links and exact review saves", async () => {
  let review = null;
  const project = { id: "relay", name: "relay", managed: true };
  const workers = [{ id: "relay", enabled: false, name: "relay", runtime: { status: "idle", last_summary: "Latest canonical run" } }];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const send = body => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
    const asset = webAssets[url.pathname];
    if (asset) { res.setHeader("Content-Type", asset.type); return res.end(asset.text); }
    if (url.pathname === "/host") { res.setHeader("Content-Type", "text/html"); return res.end('<iframe id="app" style="width:100%;height:900px;border:0"></iframe>'); }
    if (url.pathname === "/api/projects") return send({ projects: [project] });
    if (url.pathname === "/api/projects/relay") return send({ project, coordination: { claims: [{ id: "work", state: "active", goal: "Complete consolidation" }] } });
    if (url.pathname === "/api/workers") return send(workers);
    if (url.pathname === "/api/visual") return send({ evidence: [evidence] });
    if (url.pathname.endsWith("/image")) { res.setHeader("Content-Type", "image/png"); return res.end(pixel); }
    if (url.pathname.endsWith("/live")) return send({ live: { active: false } });
    if (url.pathname.endsWith("/qa")) {
      if (req.method === "POST") {
        let body = ""; for await (const chunk of req) body += chunk;
        review = { ...JSON.parse(body), evidence_id: evidence.evidence_id, updated_at: new Date().toISOString() };
      }
      return send({ evidence, questions, review });
    }
    res.statusCode = 404; send({ error: "Unexpected test request " + url.pathname });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const mode of ["web", "mcp"]) {
      const page = await browser.newPage({ viewport: { width: 1360, height: 1000 }, colorScheme: "dark" });
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      let view = page;
      if (mode === "web") await page.goto(origin);
      else {
        await page.goto(origin + "/host");
        await page.evaluate(html => {
          window.addEventListener("message", async event => {
            const message = event.data;
            if (message?.jsonrpc !== "2.0" || message.id === undefined) return;
            let result = {};
            if (message.method === "tools/call") {
              const args = message.params.arguments;
              const response = await fetch(args.path, { method: args.method, headers: { "Content-Type": "application/json" }, body: args.body ? JSON.stringify(args.body) : undefined });
              const content_type = response.headers.get("content-type");
              const data = { status: response.status, content_type };
              if (content_type.startsWith("image/")) data.base64 = btoa(String.fromCharCode(...new Uint8Array(await response.arrayBuffer())));
              else data.body = await response.json();
              result = { structuredContent: data };
            }
            event.source.postMessage({ jsonrpc: "2.0", id: message.id, result }, "*");
          });
          document.querySelector("iframe").srcdoc = html;
        }, mcpHtml);
        view = page.frameLocator("#app");
      }
      await view.locator("#operator-connection").filter({ hasText: "Connected" }).waitFor();
      await view.getByRole("button", { name: "Projects", exact: true }).click();
      await view.locator("#project-detail").filter({ hasText: "Complete consolidation" }).waitFor();
      await view.getByRole("button", { name: "Night Shift", exact: true }).click();
      await view.locator("#night-shift-work").filter({ hasText: "Latest canonical run" }).waitFor();
      await view.getByRole("button", { name: "Review", exact: true }).click();
      if (mode === "mcp") await view.getByRole("button", { name: "All", exact: true }).click();
      await view.locator("[data-review-id]").click();
      await view.getByRole("button", { name: "Yes", exact: true }).click();
      await view.getByRole("button", { name: "Looks good", exact: true }).click();
      await view.locator(".qa-save-state").filter({ hasText: "Saved" }).waitFor();
      assert.equal(review.evidence_id, evidence.evidence_id); assert.equal(review.answers.intent, "yes");
      await view.getByRole("button", { name: "Close QA", exact: true }).click();
      if (mode === "web") {
        await page.goto(origin + "#projects?project=relay");
        await page.locator("#project-detail").filter({ hasText: "Complete consolidation" }).waitFor();
        await page.screenshot({ path: "/tmp/relay-b4-dark.png" });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ colorScheme: "light" });
        await page.getByRole("button", { name: "Today", exact: true }).click();
        await page.locator("#operator-connection").filter({ hasText: "Connected" }).waitFor();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflow, false);
        await page.screenshot({ path: "/tmp/relay-b4-mobile-light.png", fullPage: true });
        await page.goto(origin + "#review?evidence=" + evidence.evidence_id);
        await page.locator(".qa-stage").waitFor();
        assert.equal(await page.locator(".qa-answer.selected").textContent(), "Yes");
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
