import http from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { webAssets } from "../generated.js";

const commit = process.env.PREVIEW_COMMIT || "";
const pr = Number(process.env.PREVIEW_PR || 0);
const clientId = process.env.CF_ACCESS_CLIENT_ID || "";
const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET || "";
if (!commit || !pr || !clientId || !clientSecret) throw new Error("Preview evidence environment is incomplete");

const progress = {
  project: "relay",
  observed_progress: true,
  progress: [
    { assignment: "relay-2.0-build", goal: "Port Relay 2.0 onto the approved 1.8/1.9 visual system", observed: true, state: "working", stage: "implementation", primary_staff: "vivienne", last_meaningful_progress_at: "2026-10-01T10:00:00Z", latest_event: { type: "source-commit", at: "2026-10-01T10:00:00Z" }, next_action: "review the visual port in Inspector", identities: { branch: "relay/2.0-approved-visual-port-20261001", head_sha: commit }, events: [{ type: "source-commit", at: "2026-10-01T10:00:00Z" }] },
    { assignment: "relay-2.0-review", goal: "Review the exact visual result before release", observed: true, state: "waiting-for-human", stage: "review", primary_staff: "vivienne", waiting_reason: "Human visual approval is required before merge.", last_meaningful_progress_at: "2026-10-01T10:01:00Z", latest_event: { type: "qa-review", at: "2026-10-01T10:01:00Z" }, next_action: "approve or annotate the Inspector captures", identities: { branch: "relay/2.0-approved-visual-port-20261001", head_sha: commit }, events: [{ type: "qa-review", at: "2026-10-01T10:01:00Z" }] },
    { assignment: "relay-external-check", goal: "Confirm release evidence", observed: true, state: "waiting-on-external-system", stage: "checks", primary_staff: "julian", last_meaningful_progress_at: "2026-10-01T09:58:00Z", latest_event: { type: "check-started", at: "2026-10-01T09:58:00Z" }, next_action: "wait for exact-head checks", identities: { branch: "relay/2.0-approved-visual-port-20261001", head_sha: commit }, events: [{ type: "check-started", at: "2026-10-01T09:58:00Z" }] }
  ],
  queue: []
};
const workers = [
  { id: "relay", name: "relay", enabled: true, runtime: { status: "running", last_summary: "Reviewing the approved Relay visual port.", last_run_at: "2026-10-01T09:50:00Z", next_run_at: "2026-10-01T11:00:00Z" } },
  { id: "field", name: "field", enabled: true, runtime: { status: "idle", last_summary: "No new material changes.", last_run_at: "2026-10-01T09:30:00Z", next_run_at: "2026-10-01T10:30:00Z" } },
  { id: "loewfi", name: "loew.fi", enabled: false, runtime: { status: "idle", last_summary: "Automatic checks paused.", last_run_at: "2026-10-01T08:30:00Z", next_run_at: null } }
];
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlAAAAABJRU5ErkJggg==", "base64");

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const asset = webAssets[url.pathname];
  if (asset) { res.setHeader("content-type", asset.type); return res.end(asset.text); }
  const json = value => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(value)); };
  if (url.pathname === "/api/projects") return json({ projects: [{ id: "relay", name: "relay", managed: true }] });
  if (url.pathname === "/api/workers") return json(workers);
  if (url.pathname === "/api/progress/relay") return json(progress);
  if (url.pathname === "/api/projects/relay") return json({ project: { id: "relay", name: "relay", managed: true }, coordination: { claims: progress.progress.map(item => ({ id: item.assignment, state: "active" })) } });
  if (url.pathname === "/api/projects/relay/icon") return json({ status: "found", icon: { data_url: "data:image/png;base64," + pixel.toString("base64"), repository: "lrnolivia/relay", path: "apps/web/public/brand/relay.png", blob_sha: "a".repeat(40) } });
  if (url.pathname === "/api/visual") return json({ evidence: [] });
  res.statusCode = 404; return json({ error: "preview route not found", path: url.pathname });
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const origin = "http://127.0.0.1:" + address.port;

const accessHeader = JSON.stringify({ "cf-access-client-id": clientId, "cf-access-client-secret": clientSecret });
const authHeaders = { Authorization: accessHeader, "CF-Access-Client-Id": clientId, "CF-Access-Client-Secret": clientSecret };

async function ingest({ screenshot, label, surface, canonicalUrl, viewport }) {
  const metadata = {
    request_id: "relay-pr-" + pr + "-" + surface,
    target_url: canonicalUrl,
    kind: "pr_preview",
    context: { project: "relay", project_id: "relay", environment: "preview", surface, route_kind: "other", commit_sha: commit, pr_number: pr },
    viewport: { ...viewport, deviceScaleFactor: 1 },
    engine: "github-chromium",
    engine_reason: "pull_request_visual_review",
    step_label: label,
    title: "Relay PR #" + pr + " — " + label,
    trace: [{ action: "render_pr_preview", route: surface }]
  };
  const form = new FormData();
  form.set("metadata", JSON.stringify(metadata));
  form.set("screenshot", new Blob([screenshot], { type: "image/png" }), surface + ".png");
  const response = await fetch("https://relay.loew.fi/evidence/ingest", { method: "POST", headers: authHeaders, body: form });
  if (!response.ok) throw new Error("Inspector ingest failed: " + response.status + " " + (await response.text()).slice(0, 240));
  const stored = await response.json();
  console.log("RELAY_PREVIEW_EVIDENCE=" + JSON.stringify({ label, evidence_id: stored.evidence_id, surface }));
  return stored.evidence_id;
}

const browser = await chromium.launch({ headless: true });
await mkdir("qa-evidence", { recursive: true });
const captures = [];
try {
  for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: "dark" });
    const screens = [
      { route: "/#/today", label: "Today " + viewport.name, surface: "today-" + viewport.name, wait: 'h1:text-is("today")', canonical: "https://relay.loew.fi/" },
      { route: "/#/runner", label: "Runner " + viewport.name, surface: "runner-" + viewport.name, wait: 'h1:text-is("runner")', canonical: "https://relay.loew.fi/" },
      { route: "/#/runner/relay/relay-2.0-build", label: "Runner detail " + viewport.name, surface: "runner-detail-" + viewport.name, wait: ".work-detail", canonical: "https://relay.loew.fi/" },
      { route: "/#/night-shift", label: "Night Shift " + viewport.name, surface: "night-shift-" + viewport.name, wait: 'h1:text-is("night shift")', canonical: "https://relay.loew.fi/" },
      { route: "/inspector#review", label: "Inspector " + viewport.name, surface: "inspector-" + viewport.name, wait: ".inspector-signal-deck", canonical: "https://relay.loew.fi/inspector" }
    ];
    for (const screen of screens) {
      await page.goto(origin + screen.route, { waitUntil: "networkidle" });
      await page.locator(screen.wait).first().waitFor({ state: "visible", timeout: 10000 });
      await page.waitForTimeout(350);
      const screenshot = await page.screenshot({ fullPage: true });
      await writeFile("qa-evidence/" + screen.surface + ".png", screenshot);
      const evidenceId = await ingest({ screenshot, label: screen.label, surface: screen.surface, canonicalUrl: screen.canonical, viewport });
      captures.push({ ...screen, evidence_id: evidenceId });
    }
    await page.close();
  }
  await writeFile("qa-evidence/result.json", JSON.stringify({ ok: true, pr, commit, captures }, null, 2));
  console.log("RELAY_VISUAL_REVIEW_RESULT=" + JSON.stringify({ ok: true, pr, commit, captures }));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
