import { iconSlot, hydrateProjectIcons } from "./project-icons.js";

import { openQa } from "./qa.js";
import { esc, projectName } from "./operator-projects.js";

let reviewItems = [];
let reviewMode = "needs";

async function api(url, options) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...options
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { error: text || "Unexpected response." }; }
  if (!response.ok) throw Object.assign(new Error(body.error || "Request failed."), { status: response.status });
  return body;
}

function relative(value) {
  if (!value) return "recently";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "recently";
  const delta = parsed - Date.now();
  const abs = Math.abs(delta);
  const unit = abs < 3_600_000 ? "minute" : abs < 86_400_000 ? "hour" : "day";
  const divisor = unit === "minute" ? 60_000 : unit === "hour" ? 3_600_000 : 86_400_000;
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(delta / divisor), unit);
}

function evidenceKey(item) {
  const context = item.context || {};
  return [
    context.project || item.target_url || "",
    item.step_label || item.step_id || context.surface || "",
    item.viewport?.width || "",
    item.viewport?.height || "",
    context.commit_sha || context.pr_number || item.run_id || ""
  ].join("|");
}

function evidenceTitle(item) {
  const context = item.context || {};
  return item.step_label || context.surface || "Screen review";
}

function renderReview() {
  const target = document.querySelector("#review-list");
  const count = document.querySelector("#review-count");
  const filters = document.querySelector("#review-filters");
  const needs = reviewItems.filter(item => !item.qaReview?.overall);
  const visible = reviewMode === "needs" ? needs : reviewItems;

  count.innerHTML = '<span class="status-light" aria-hidden="true"></span><span>' + (needs.length ? needs.length + " need" + (needs.length === 1 ? "s" : "") + " you" : "all caught up") + '</span>';
  count.className = "review-count status-badge";
  count.dataset.tone = needs.length ? "act" : "done";
  count.dataset.signal = needs.length ? "attention" : "steady";
  filters.querySelectorAll("[data-review-mode]").forEach(button => {
    button.classList.toggle("active", button.dataset.reviewMode === reviewMode);
  });

  if (!visible.length) {
    target.innerHTML = '<div class="clear-card review-clear"><strong>nothing waiting for review.</strong><span>switch to all if you want to revisit an earlier screen.</span></div>';
    return;
  }

  target.innerHTML = visible.slice(0, 10).map(item => {
    const context = item.context || {};
    const reviewed = Boolean(item.qaReview?.overall);
    return `
      <button class="review-row" type="button" data-review-id="${esc(item.evidence_id)}" data-tone="${reviewed ? "done" : "act"}" data-signal="${reviewed ? "steady" : "attention"}">
        <img src="${esc(item.screenshot_url)}" alt="">
        <span class="review-copy">
          <span class="review-project project-name">${iconSlot(context.project)}${esc(projectName(context.project || "review"))}</span>
          <strong>${esc(evidenceTitle(item))}</strong>
          <small>${esc(context.environment || "capture")} · ${esc(relative(item.captured_at))}</small>
        </span>
        <span class="review-state status-badge ${reviewed ? "done" : ""}" data-tone="${reviewed ? "done" : "act"}" data-signal="${reviewed ? "steady" : "attention"}"><span class="status-light" aria-hidden="true"></span><span>${reviewed ? "reviewed" : "needs review"}</span></span>
      </button>
    `;
  }).join("");

  hydrateProjectIcons(target);
  target.querySelectorAll("[data-review-id]").forEach(button => {
    button.addEventListener("click", () => openQa(button.dataset.reviewId));
  });
}

export function bindReviewFilters() {
  const filters = document.querySelector("#review-filters");
  filters?.addEventListener("click", event => {
    const button = event.target.closest("[data-review-mode]");
    if (!button) return;
    reviewMode = button.dataset.reviewMode;
    renderReview();
  });
}

export async function loadReview(ui, projectId = "") {
  const target = document.querySelector("#review-list");
  const count = document.querySelector("#review-count");
  target.innerHTML = '<div class="operator-loading">Checking what needs your eyes…</div>';

  try {
    const payload = await api("/api/visual" + (projectId ? "?project=" + encodeURIComponent(projectId) : ""));
    const raw = Array.isArray(payload.evidence) ? payload.evidence : [];
    const deduped = [];
    const seen = new Set();

    for (const item of raw) {
      const context = item.context || {};
      const internalRunnerAudit =
        context.project === "loew-runner" &&
        (String(item.request_id || "").startsWith("runner-ui-audit") ||
          String(context.surface || "").toLowerCase().includes("audit"));
      if (internalRunnerAudit) continue;
      const key = evidenceKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
      if (deduped.length >= 14) break;
    }

    reviewItems = await Promise.all(deduped.map(async item => {
      try {
        const qa = await api("/api/visual/" + encodeURIComponent(item.evidence_id) + "/qa");
        return { ...item, qaReview: qa.review || null };
      } catch {
        return { ...item, qaReview: null };
      }
    }));

    renderReview();
    const needs = reviewItems.filter(item => !item.qaReview?.overall).length;
    ui.setOverviewDetail(needs + " awaiting review · " + (reviewItems.length - needs) + " reviewed in this view");
    ui.setConnection("connected", "good");
  } catch (error) {
    count.textContent = "";
    target.innerHTML = '<div class="operator-empty">Review items could not be loaded right now.</div>';
    ui.setConnection(error.status === 403 ? "access needed" : "couldn’t connect", "bad");
  }
}
