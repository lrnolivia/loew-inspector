import {reviewFixture,workerSource} from "./work-review-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";
import { mcpHtml, webAssets } from "../generated.js";

// This PR gate exercises the Vite/React boundary from the committed lockfile.
const root = fileURLToPath(new URL("..", import.meta.url));

const progress = {
  project: "relay",
  observed_progress: true,
  progress: [
    {
      assignment: "relay-2.0-build",
      goal: "Ship the Relay 2.0 live React experience",
      observed: true,
      state: "working",
      stage: "implementation",
      primary_staff: "nico",
      last_meaningful_progress_at: "2026-10-01T08:00:00Z",
      latest_event: { type: "source-commit", at: "2026-10-01T08:00:00Z" },
      next_action: "finish release review",
      identities: { branch: "relay/2.0-today-runner-react-slice-20261001", head_sha: "d".repeat(40) },
      events: [{ type: "source-commit", at: "2026-10-01T08:00:00Z" }]
    },
    {
      assignment: "relay-2.0-review",
      goal: "Review Inspector feedback delivery",
      observed: true,
      state: "waiting-for-human",
      stage: "review",
      primary_staff: "vivienne",
      waiting_reason: "Review the exact current result.",
      last_meaningful_progress_at: "2026-10-01T08:01:00Z",
      latest_event: { type: "qa-review", at: "2026-10-01T08:01:00Z" },
      next_action: "approve visual QA",
      identities: { branch: "relay/2.0-today-runner-react-slice-20261001", head_sha: "e".repeat(40) },
      events: [{ type: "qa-review", at: "2026-10-01T08:01:00Z" }]
    }
  ],
  queue: []
};

const workers = [{
  id: "relay",
  name: "relay",
  enabled: true,
  runtime: {
    status: "idle",
    last_summary: "Night shift verified the latest unattended work.",
    last_run_at: "2026-10-01T07:30:00Z",
    next_run_at: "2026-10-01T09:00:00Z"
  }
}];

test("Relay 2.0 React shell renders human-first live surfaces responsively", async () => {
  const vite = await createServer({ root, logLevel: "silent", server: { host: "127.0.0.1", port: 0 } });
  await vite.listen();
  const address = vite.httpServer?.address();
  assert.ok(address && typeof address === "object");
  const origin = "http://127.0.0.1:" + address.port;
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, colorScheme: "dark" });
    await page.route("https://fonts.googleapis.com/**", route => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
    await page.route("https://fonts.gstatic.com/**", route => route.abort());
    await page.route("**/api/projects", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ projects: [{ id: "relay", name: "relay", managed: true }] }) }));
    await page.route("**/api/workers", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(workers) }));
    await page.route("**/api/projects/relay", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ coordination: { claims: progress.progress.map(item => ({ id: item.assignment, state: "active" })) } }) }));
    await page.route("**/api/progress/relay*", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(progress) }));

    const reviews=reviewFixture(item=>item.kind==='check'?workerSource(workers.find(w=>w.id===item.id)):progress.progress.find(p=>p.assignment===item.id));
    await page.route('**/api/work-review',async route=>route.fulfill({json:await reviews.body(route.request().postDataJSON())}));
    await page.goto(origin + "/#/today");
    await page.locator('.operator-connection[data-tone="good"]').filter({ hasText: "live" }).waitFor();
    await page.locator("[data-progress-notice]").waitFor({ state: "detached" });
    // StrictMode can queue a second refresh while the first one settles. Assert
    // the completed snapshot, not a legitimate intermediate "1+" count.
    await page.waitForFunction(() => ['needs','moving','automatic'].every(id =>
      document.querySelector(`[data-signal-id="${id}"] > strong`)?.textContent === '1'
    ) && !document.querySelector('[data-progress-notice]'));

    assert.equal(await page.getByRole("heading", { name: "today", level: 1 }).textContent(), "today");
    assert.equal(await page.locator(".signal-card").count(), 4);

    const mark = await page.locator(".feature-mark").boundingBox();
    assert.ok(mark && Math.abs(mark.width - 96) < 2, "desktop feature mark keeps the approved 1.8/1.9 identity scale");
    const font = await page.getByRole("heading", { name: "today", level: 1 }).evaluate(node => getComputedStyle(node).fontFamily);
    assert.match(font, /Momo Trust Display/);
    assert.equal(await page.locator("body").evaluate(node => getComputedStyle(node).backgroundImage), "none");
    assert.equal(await page.locator(".signal-card").first().evaluate(node => getComputedStyle(node).backgroundImage), "none");

    const track = await page.locator(".signal-track").boundingBox();
    const first = await page.locator(".signal-card").nth(0).boundingBox();
    const second = await page.locator(".signal-card").nth(1).boundingBox();
    assert.ok(track && first && second);
    const third = await page.locator(".signal-card").nth(2).boundingBox();
    assert.ok(third && second.x > first.x && third.y > first.y, "mosaic preserves left-to-right then top-to-bottom summary order");
    assert.ok(second.x + second.width <= track.x + track.width + 2);
    assert.ok(third.x >= track.x && third.x + third.width <= track.x + track.width + 2, "all summaries fit the grid without horizontal navigation");
    assert.equal(await page.locator(".signal-mark svg").count(), 4);
    assert.equal(await page.locator(".signal-card").first().getAttribute("tabindex"), null);

    await page.getByRole("link", { name: /^runner/ }).click();
    await page.getByRole("heading", { name: "runner", level: 1 }).waitFor();
    assert.equal(await page.locator(".signal-card").count(), 4);
    assert.equal(await page.locator(".work-item").count(), 2);
    assert.equal(await page.locator(".work-item details").first().getByText("Details").count(), 1);
    assert.match(await page.locator(".work-item").first().innerText(), /Source:/);
    const destination=new URL(await page.locator('.work-item .work-open').first().getAttribute('href'));assert.equal(destination.origin,'https://ctrl.loew.fi');await page.goto(origin+destination.pathname+destination.search+destination.hash);
    await page.locator(".work-detail").waitFor();
    assert.equal(await page.locator(".work-detail .signal-card").count(), 3);
    await page.getByRole("link", { name: "← runner" }).click();

    await page.getByRole("link", { name: /^night shift/ }).click();
    await page.getByRole("heading", { name: "night shift", level: 1 }).waitFor();
    assert.equal(await page.locator(".signal-card").count(), 4);
    assert.equal(await page.locator('.signal-card:has-text("will anything happen?")').count(), 1);
    assert.match(await page.locator(".work-item").first().textContent(), /Night shift verified/);

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const mobileMark = await page.locator(".feature-mark").boundingBox();
    assert.ok(mobileMark && Math.abs(mobileMark.width - 48) < 2);

    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await page.locator(".signal-track").evaluate(node => getComputedStyle(node).scrollBehavior), "auto");
  } finally {
    await browser.close();
    await vite.close();
  }
});


test("generated cutover publishes the React control center through the authenticated MCP bridge", () => {
  assert.match(webAssets["/"].text, /<title>relay 2\.0<\/title>/);
  assert.ok(webAssets["/inspector"]);
  assert.match(webAssets["/inspector"].text, /data-page="review"/);
  assert.match(mcpHtml, /id="root"/);
  assert.match(mcpHtml, /<script type="module">/);
  assert.match(mcpHtml, /ui\/initialize/);
  assert.match(mcpHtml, /ui\/notifications\/initialized/);
  assert.match(mcpHtml, /tools\/call/);
  assert.match(mcpHtml, /relay_ui_request/);
  assert.match(mcpHtml, /\/inspector#review/);
});
