import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { chromium } from "playwright";
import { webAssets } from "../generated.js";
import { fitTransform, wheelPanDelta, wheelZoomFactor } from "../public/qa-viewport.js";
// Inspector deliberately reuses Field camera semantics without importing Field editor state.
// Dashboard triage is reversible: stale review evidence is archived, never deleted.
// Review disposition actions preserve the same evidence identity and QA record.

const evidence = {
  evidence_id: "vis_12345678-abcd", captured_at: "2026-09-30T15:00:00Z", step_label: "Relay navigation",
  screenshot_url: "/api/visual/vis_12345678-abcd/image", context: { project: "relay", commit_sha: "a".repeat(40), environment: "preview" }
};
const questions = [{ id: "intent", prompt: "Is the next action clear?", reason: "Check the Relay flow." }];
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlAAAAABJRU5ErkJggg==", "base64");

test("Inspector camera math mirrors Field input semantics", () => {
  const fit = fitTransform(1200, 800, 1440, 900);
  assert.ok(fit.scale > 0 && fit.scale <= 2);
  assert.ok(Number.isFinite(fit.x) && Number.isFinite(fit.y));
  const pan = wheelPanDelta({ deltaMode: 0, deltaX: 12, deltaY: 18 }, 800);
  assert.ok(pan.dx < 0 && pan.dy < 0);
  assert.ok(wheelZoomFactor({ deltaMode: 0, deltaY: -12, metaKey: false }) > 1);
});

test("preserved Inspector surface works at /inspector, including mobile, deep links and exact review saves", async () => {
  let review = null;
  let heldPath = "";
  let releaseLoading;
  let loadingGate;
  const hold = path => { heldPath = path; loadingGate = new Promise(resolve => { releaseLoading = () => { heldPath = ""; resolve(); }; }); };
  const project = { id: "relay", name: "relay", managed: true };
  const workers = [{ id: "relay", enabled: false, name: "relay", runtime: { status: "idle", last_summary: "Latest canonical run" } }];
  const progress = {
    contract_version: "1.7.5", observed_progress: true, project: "relay",
    progress: [
      {
        assignment: "Complete consolidation", observed: true, state: "waiting-for-human", stage: "review",
        worker: { heartbeat_at: "2026-09-30T15:00:00Z", freshness: "fresh" },
        external: { active: false, system: null, detail: null },
        last_meaningful_progress_at: "2026-09-30T15:00:00Z",
        latest_event: { type: "source-commit", at: "2026-09-30T15:00:00Z" },
        waiting_reason: "Review the exact current result.",
        identities: { branch: "relay/test", head_sha: "c".repeat(40) },
        next_action: "Keep implementing"
      },
      {
        assignment: "Broken release", observed: true, state: "failed", stage: "checks",
        worker: { heartbeat_at: "2026-09-30T14:58:00Z", freshness: "fresh" },
        external: { active: false, system: null, detail: null },
        last_meaningful_progress_at: "2026-09-30T14:58:00Z",
        latest_event: { type: "check-completed", at: "2026-09-30T14:58:00Z" },
        waiting_reason: "checks failed",
        identities: { branch: "relay/broken", head_sha: "d".repeat(40) }
      },
      {
        assignment: "Active build", observed: true, state: "working", stage: "implementation",
        worker: { heartbeat_at: "2026-09-30T14:57:00Z", freshness: "fresh" },
        external: { active: false, system: null, detail: null },
        last_meaningful_progress_at: "2026-09-30T14:57:00Z",
        latest_event: { type: "source-commit", at: "2026-09-30T14:57:00Z" },
        identities: { branch: "relay/active", head_sha: "e".repeat(40) }
      },
      {
        assignment: "External wait", observed: true, state: "waiting-on-external-system", stage: "checks",
        worker: { heartbeat_at: "2026-09-30T14:56:00Z", freshness: "fresh" },
        external: { active: true, system: "github", detail: "CI is running" },
        last_meaningful_progress_at: "2026-09-30T14:56:00Z",
        latest_event: { type: "check-started", at: "2026-09-30T14:56:00Z" },
        identities: { branch: "relay/wait", head_sha: "f".repeat(40) }
      }
    ],
    queue: []
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const send = body => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
    const asset = webAssets[url.pathname];
    if (asset) { res.setHeader("Content-Type", asset.type); return res.end(asset.text); }
    if (url.pathname === "/host") { res.setHeader("Content-Type", "text/html"); return res.end('<iframe id="app" style="width:100%;height:900px;border:0"></iframe>'); }
    if (url.pathname === heldPath) await loadingGate;
    if (url.pathname === "/api/projects") return send({ projects: [project] });
    if (url.pathname === "/api/projects/relay/icon") return send({ status: "found", icon: { data_url: "data:image/png;base64," + pixel.toString("base64"), repository: "lrnolivia/relay", path: "apps/web/public/brand/relay-loop.png", blob_sha: "b".repeat(40) } });
    if (url.pathname === "/api/projects/relay") return send({ project, coordination: { claims: [{ id: "work", state: "active", goal: "Legacy claim context" }] } });
    if (url.pathname === "/api/progress/relay") return send(progress);
    if (url.pathname === "/api/workers") return send(workers);
    if (url.pathname === "/api/visual") return send({ evidence: [evidence] });
    if (url.pathname.endsWith("/image")) { res.setHeader("Cache-Control", "no-store"); res.setHeader("Content-Type", "image/png"); return res.end(pixel); }
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
    for (const mode of ["web"]) {
      const page = await browser.newPage({ viewport: { width: 1360, height: 1000 }, colorScheme: "dark" });
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      let view = page;
      if (mode === "web") {
        hold("/api/workers");
        await page.goto(origin + "/inspector#review");
        await view.locator("#today-work .content-skeleton").waitFor();
        assert.equal(await view.locator("#today-attention .content-skeleton").getAttribute("role"), "status");
        assert.equal(await view.locator("#operator-connection").evaluate(node => getComputedStyle(node, "::before").position), "static");
        assert.equal(await view.locator("#operator-connection").evaluate(node => getComputedStyle(node, "::before").animationName), "connection-checking");
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal(await view.locator("#operator-connection").evaluate(node => getComputedStyle(node, "::before").animationName), "none");
        assert.equal(await view.locator("#today-work .skeleton-block").first().evaluate(node => getComputedStyle(node).animationName), "none");
        await page.screenshot({ path: "/tmp/relay-loading-skeletons.png" });
        releaseLoading();
        await page.emulateMedia({ reducedMotion: "no-preference" });
      }
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
      await view.locator("#operator-connection").filter({ hasText: "connected" }).waitFor({ timeout: 10000 }).catch(error => { throw new Error(mode + " connection failed: " + JSON.stringify(errors), { cause: error }); });
      assert.equal(await view.locator(".page-statusline").count(), 0);
      const todayHeader = view.locator('.feature-heading[data-feature="today"]');
      await todayHeader.locator(".feature-mark").waitFor();
      assert.equal(await todayHeader.locator("p").textContent(), "focus");
      assert.equal(await todayHeader.evaluate(node => getComputedStyle(node).getPropertyValue("--feature-accent").trim()), "#ff6f78");
      const todayIcon = await todayHeader.locator(".feature-mark").evaluate(node => ({ src: node.getAttribute("src"), naturalWidth: node.naturalWidth, naturalHeight: node.naturalHeight }));
      assert.match(todayIcon.src, /^data:image\/png;base64,/);
      assert.equal(todayIcon.naturalWidth, 1024);
      assert.equal(todayIcon.naturalHeight, 1024);
      assert.equal(await view.locator("#app-settings").evaluate(node => getComputedStyle(node).borderBottomWidth), "0px");
      assert.equal(await view.locator("#app-settings").evaluate(node => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)");
      assert.equal(await view.locator("#app-settings .utility-icon .relay-glyph").count(), 1);

      const sidebar = view.locator(".operator-topbar");
      const shell = view.locator(".operator-shell");
      const collapsed = await sidebar.evaluate(node => ({ width: node.getBoundingClientRect().width, navOpacity: getComputedStyle(node.querySelector(".nav-copy")).opacity }));
      assert.ok(collapsed.width >= 84 && collapsed.width <= 92, mode + " collapsed sidebar width");
      assert.equal(collapsed.navOpacity, "0");
      assert.ok(await view.locator('.operator-page[data-page="today"]').evaluate(node => node.getBoundingClientRect().width) <= 1121, mode + " centered content max-width");
      assert.ok(parseFloat(await shell.evaluate(node => getComputedStyle(node).marginLeft)) >= 84);
      const sidebarTransition = await sidebar.evaluate(node => getComputedStyle(node).transitionDuration);
      assert.ok(sidebarTransition.split(",").every(value => parseFloat(value) <= .26), mode + " sidebar transition must stay fast");
      await sidebar.hover();
      await page.waitForTimeout(40);
      assert.equal(await view.locator("body").getAttribute("data-shell-motion"), "expand");
      const movingPage = view.locator('.operator-page[data-page="today"]');
      assert.equal(await movingPage.evaluate(node => getComputedStyle(node).animationName), "relay-shell-expand-inertia");
      assert.ok(parseFloat(await movingPage.evaluate(node => getComputedStyle(node).animationDuration)) <= .26);
      await page.waitForTimeout(220);
      const expanded = await sidebar.evaluate(node => ({ width: node.getBoundingClientRect().width, navOpacity: getComputedStyle(node.querySelector(".nav-copy")).opacity }));
      assert.ok(expanded.width >= 330 && expanded.width <= 350, mode + " expanded sidebar width");
      assert.equal(expanded.navOpacity, "1");
      assert.ok(parseFloat(await shell.evaluate(node => getComputedStyle(node).marginLeft)) >= 330);
      await shell.hover();
      await page.waitForTimeout(40);
      assert.equal(await view.locator("body").getAttribute("data-shell-motion"), "collapse");
      assert.equal(await movingPage.evaluate(node => getComputedStyle(node).animationName), "relay-shell-collapse-inertia");
      await page.waitForTimeout(180);
      const attention = view.locator(".attention-card").first();
      await attention.waitFor();
      const geometry = await attention.evaluate(node => {
        const card = node.getBoundingClientRect();
        const button = node.querySelector("button")?.getBoundingClientRect();
        return button ? {
          contained: button.left >= card.left && button.right <= card.right && button.top >= card.top && button.bottom <= card.bottom,
          cardWidth: card.width,
          buttonWidth: button.width
        } : { contained: false };
      });
      assert.equal(geometry.contained, true, mode + " attention action must stay inside its card");
      await view.getByRole("button", { name: "runner", exact: true }).click();
      const runnerButton = view.getByRole("button", { name: "runner", exact: true });
      assert.equal(await view.getByRole("heading", { name: "runner", level: 1, exact: true }).textContent(), "runner");
      assert.equal(await view.locator('.feature-heading[data-feature="runner"] p').textContent(), "coordinate");
      assert.equal(await view.locator('.feature-heading[data-feature="runner"]').evaluate(node => getComputedStyle(node).getPropertyValue("--feature-accent").trim()), "#3bcb8d");
      assert.equal(await runnerButton.evaluate(node => getComputedStyle(node).getPropertyValue("--feature-accent").trim()), "#3bcb8d");
      assert.ok(parseFloat(await runnerButton.evaluate(node => getComputedStyle(node).borderBottomWidth)) <= 1, "active nav must not use fake underline depth");
      await view.getByRole("tab", { name: "relay", exact: true }).click();
      await view.locator("#project-detail").filter({ hasText: "Complete consolidation" }).waitFor();
      assert.equal(await view.locator('.overview-metric:has-text("moving")').getAttribute("data-tone"), "good");
      assert.equal(await view.locator('.overview-metric:has-text("external wait")').getAttribute("data-tone"), "wait");
      assert.equal(await view.locator('.overview-metric:has-text("needs you")').getAttribute("data-tone"), "act");
      const failedBadge = view.locator('.progress-row[data-progress-state="failed"] .status-badge');
      await failedBadge.waitFor();
      assert.equal(await failedBadge.getAttribute("data-tone"), "bad");
      assert.equal(await failedBadge.getAttribute("data-signal"), "danger");
      assert.equal(await failedBadge.locator(".status-light").count(), 1);
      assert.equal(await failedBadge.evaluate(node => getComputedStyle(node, "::before").display), "none");
      const failedColor = await failedBadge.evaluate(node => getComputedStyle(node).color);
      assert.notEqual(failedColor, "rgb(198, 191, 183)");
      assert.notEqual(await failedBadge.locator(".status-light").evaluate(node => getComputedStyle(node, "::after").animationName), "none");
      const failedRow = view.locator('.progress-row[data-progress-state="failed"]');
      assert.equal(await failedRow.evaluate(node => getComputedStyle(node).borderLeftWidth), "0px");
      assert.equal(await failedRow.evaluate(node => getComputedStyle(node).borderTopWidth), "0px");
      const failedSurface = await failedRow.evaluate(node => getComputedStyle(node).backgroundColor);
      const workingSurface = await view.locator('.progress-row[data-progress-state="working"]').evaluate(node => getComputedStyle(node).backgroundColor);
      assert.equal(failedSurface, workingSurface, "User-directed neutral greige cards keep status color in the badge");
      assert.equal(failedSurface, "rgb(34, 34, 32)");
      assert.notEqual(failedColor, await view.locator('.progress-row[data-progress-state="working"] .status-badge').first().evaluate(node => getComputedStyle(node).color));
      await view.locator('#project-tabs [data-project-id="relay"] [data-repo-icon="relay"][data-icon-sha="' + "b".repeat(40) + '"] img').waitFor();
      assert.equal(await view.locator('#project-tabs [data-project-id="relay"] [data-repo-icon="relay"]').evaluate(node => getComputedStyle(node).backgroundColor), "rgba(0, 0, 0, 0)");
      for (const width of [560, 900, 1360]) {
        await page.setViewportSize({ width, height: 1000 });
        assert.equal(await view.locator("body").evaluate(() => document.documentElement.scrollWidth > innerWidth), false, mode + " viewport " + width);
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(await view.locator(".relay-glyph").first().evaluate(node => getComputedStyle(node).transitionDuration), "0s");
      assert.equal(await shell.evaluate(node => getComputedStyle(node).transitionDuration), "0s");
      assert.equal(await view.locator('.operator-page[data-page="projects"]').evaluate(node => getComputedStyle(node).animationName), "none");
      assert.equal(await failedBadge.locator(".status-light").evaluate(node => getComputedStyle(node, "::after").animationName), "none");
      assert.equal(await failedBadge.evaluate(node => getComputedStyle(node).color), failedColor);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      assert.equal(await view.locator(".flow-band").count(), 0);
      assert.equal(await view.locator(".page-overview").count(), 0);
      assert.equal(await view.locator(".page-statusline").count(), 0);
      assert.equal(await view.locator(".project-tabs").count(), 1);
      await view.getByRole("button", { name: "night shift", exact: true }).click();
      await view.locator("#night-shift-work").filter({ hasText: "Latest canonical run" }).waitFor();
      if (mode === "web") hold("/api/visual");
      await view.getByRole("button", { name: "inspector", exact: true }).click();
      let skeletonWidth;
      if (mode === "web") {
        await view.locator(".skeleton-review .skeleton-card").first().waitFor();
        assert.equal(await view.locator(".skeleton-review .skeleton-card").count(), 3);
        skeletonWidth = (await view.locator(".skeleton-review .skeleton-card").first().boundingBox()).width;
        releaseLoading();
      }
      if (mode === "mcp") await view.getByRole("button", { name: "all", exact: true }).click();
      await view.locator("[data-review-id]").waitFor();
      if (mode === "web") {
        assert.ok(Math.abs((await view.locator(".review-row").first().boundingBox()).width - skeletonWidth) < 1, "Review skeleton and loaded card have matching widths");
        await page.screenshot({ path: "/tmp/relay-greige-review-cards.png" });
      }
      assert.equal(await view.getByRole("button", { name: "completed", exact: true }).count(), 1);
      assert.equal(await view.getByRole("button", { name: "stale", exact: true }).count(), 1);
      assert.equal(await view.getByRole("button", { name: "archived", exact: true }).count(), 1);
      assert.equal(await view.getByRole("button", { name: "clear stale", exact: true }).count(), 1);
      await view.getByRole("button", { name: "all", exact: true }).click();
      await view.getByRole("button", { name: "mark completed", exact: true }).click();
      await view.locator('.review-row[data-review-disposition="completed"]').waitFor();
      assert.equal(review.disposition, "completed");
      await view.getByRole("button", { name: "completed", exact: true }).click();
      await view.getByRole("button", { name: "reopen", exact: true }).click();
      await view.getByRole("button", { name: "needs review", exact: true }).click();
      await view.locator('.review-row[data-review-disposition="pending"]').waitFor();
      assert.equal(review.disposition, "pending");
      await view.getByRole("button", { name: "mark stale", exact: true }).click();
      await view.getByRole("button", { name: "stale", exact: true }).click();
      await view.locator('.review-row[data-review-disposition="stale"]').waitFor();
      assert.equal(review.disposition, "stale");
      await view.getByRole("button", { name: "clear stale", exact: true }).click();
      await view.getByRole("button", { name: "archived", exact: true }).click();
      await view.locator('.review-row[data-review-disposition="archived"]').waitFor();
      assert.equal(review.disposition, "archived");
      await view.getByRole("button", { name: "restore", exact: true }).click();
      await view.getByRole("button", { name: "stale", exact: true }).click();
      await view.locator('.review-row[data-review-disposition="stale"]').waitFor();
      assert.equal(review.disposition, "stale");
      await view.getByRole("button", { name: "reopen", exact: true }).click();
      await view.getByRole("button", { name: "needs review", exact: true }).click();
      await view.locator('.review-row[data-review-disposition="pending"]').waitFor();
      assert.equal(review.disposition, "pending");
      await view.locator("[data-review-id]").waitFor();
      if (mode === "web") hold("/api/visual/vis_12345678-abcd/qa");
      assert.equal(await view.locator(".review-list").evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length), 3);
      assert.equal(await view.locator(".review-row").first().evaluate(node => getComputedStyle(node).flexDirection), "column");
      await view.locator("[data-review-id]").click();
      if (mode === "web") {
        await view.locator(".qa-review-loading").waitFor();
        releaseLoading();
        await view.locator(".qa-review-loading").waitFor({ state: "detached" });
      }
      await view.locator(".qa-project-pill strong").filter({ hasText: "relay" }).waitFor();
      assert.equal(await view.locator(".qa-review-progress").textContent(), "Review 1 of 1");
      assert.equal(await view.locator(".qa-tool-identity").count(), 0);
      assert.equal(await view.locator(".qa-panel-head").count(), 0);
      assert.equal(await view.locator(".qa-save-row").count(), 0);
      assert.equal(await view.locator(".qa-overall").count(), 0);
      assert.equal(await view.locator(".qa-details").count(), 0);
      assert.equal(await view.locator("[data-qa-close]").count(), 0);
      assert.equal(await view.locator(".qa-companion").evaluate(node => getComputedStyle(node).backgroundColor), "rgb(52, 49, 46)");
      assert.equal(await view.locator(".qa-companion").evaluate(node => getComputedStyle(node).borderRadius), "28px");
      await view.locator(".qa-camera").waitFor();
      assert.notEqual(await view.locator(".qa-camera").evaluate(node => getComputedStyle(node).transform), "none");
      if (mode === "web") {
        const panel = view.locator(".qa-companion");
        const before = await panel.boundingBox();
        assert.ok(Math.abs(before.width - 450) < 2, "Inspector opens at the Figma 450px width");
        await page.mouse.move(before.x + 3, before.y + 3);
        await page.mouse.down();
        await page.mouse.move(before.x - 90, before.y - 40, { steps: 8 });
        await page.mouse.up();
        const expanded = await panel.boundingBox();
        assert.ok(expanded.width > before.width + 50, "Invisible edge resize expands the floating Inspector");
        assert.equal(await panel.evaluate(node => getComputedStyle(node).resize), "none");
        await panel.evaluate(node => { node.style.width = "450px"; node.style.height = ""; });
        await page.screenshot({ path: "/tmp/relay-inspector-spatial-canvas.png" });
      }
      await view.getByRole("button", { name: "Yes, clear", exact: true }).click();
      await view.locator(".qa-save-state").filter({ hasText: "Saved" }).waitFor();
      assert.equal(review.evidence_id, evidence.evidence_id);
      assert.equal(review.answers.intent, "yes");
      assert.equal(review.overall, "looks_good");
      await view.locator(".qa-notes textarea").fill("A durable note on this exact capture.");
      await view.locator(".qa-save-state").filter({ hasText: "Saved" }).waitFor();
      assert.equal(await view.locator(".qa-notes textarea").inputValue(), "A durable note on this exact capture.");
      await page.keyboard.press("Escape");
      await view.locator(".qa-stage").waitFor({ state: "detached" });
      assert.equal(await view.locator(".review-list").evaluate(node => getComputedStyle(node).gap), "28px");
      assert.equal(await view.locator(".operator-brand strong").evaluate(node => getComputedStyle(node).color), "rgb(251, 250, 247)");
      await view.getByRole("button", { name: "Switch to light mode", exact: true }).click();
      assert.equal(await view.locator("html").getAttribute("data-theme"), "light");
      assert.equal(await view.locator(".operator-brand strong").evaluate(node => getComputedStyle(node).color), "rgb(181, 71, 31)");
      await view.locator("[data-review-id]").click();
      await view.locator(".qa-project-pill strong").waitFor();
      assert.equal(await view.locator(".qa-companion").evaluate(node => getComputedStyle(node).backgroundColor), "rgb(52, 49, 46)");
      await page.keyboard.press("Escape");
      await view.locator(".qa-stage").waitFor({ state: "detached" });
      await view.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
      assert.equal(await view.locator("html").getAttribute("data-theme"), "dark");
      await view.locator("#app-settings").evaluate(node => { window.open = href => { window.__testExternal = href; }; node.click(); });
      assert.equal(await view.locator("body").evaluate(() => window.__testExternal), "https://chatgpt.com/settings/plugins-settings/plugin_asdk_app_6abdbca7c98c819187cc153d781b0faf");
      assert.equal(await view.locator("#app-settings .glyph-refresh").count(), 1);
      assert.equal(await view.locator("#app-settings .relay-glyph").evaluate(node => getComputedStyle(node).width), "18px");
      if (mode === "web") {
        await page.emulateMedia({ colorScheme: "light" });
        await page.reload();
        assert.equal(await page.locator("html").getAttribute("data-theme"), "dark", "Manual choice survives reload and overrides system light");
        await page.evaluate(() => localStorage.removeItem("relay-theme"));
        await page.emulateMedia({ colorScheme: "dark" });
        await page.goto(origin + "/inspector#projects?project=relay");
        await page.locator("#project-detail").filter({ hasText: "Complete consolidation" }).waitFor();
        assert.equal(await page.getByRole("tab", { name: "relay", exact: true }).getAttribute("aria-selected"), "true");
        await page.screenshot({ path: "/tmp/relay-b4-dark.png" });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.emulateMedia({ colorScheme: "light" });
        await page.getByRole("button", { name: "today", exact: true }).click();
        await page.locator("#operator-connection").filter({ hasText: "connected" }).waitFor();
        assert.equal(await page.locator(".operator-topbar").evaluate(node => getComputedStyle(node).position), "static");
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        assert.equal(overflow, false);
        await page.screenshot({ path: "/tmp/relay-b4-mobile-light.png", fullPage: true });
        await page.goto(origin + "/inspector#review?evidence=" + evidence.evidence_id);
        await page.locator(".qa-stage").waitFor();
        assert.equal(await page.locator(".qa-answer.selected").textContent(), "Yes, clear");
        assert.equal(await page.locator(".qa-companion").evaluate(node => getComputedStyle(node).resize), "none");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: "/tmp/relay-inspector-polish-mobile.png" });
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { releaseLoading?.(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
