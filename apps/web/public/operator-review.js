import { showLoading } from "./loading.js";
import { brand, featureAccent } from "./brand.js";
import { iconSlot, hydrateProjectIcons } from "./project-icons.js";

import { openQa } from "./qa.js";
import { esc, projectName } from "./operator-projects.js";

let reviewItems = [];
let reviewMode = "needs";
let cardPreviewMode = "relay";

const cardPreviews = Object.freeze({
  relay: {
    feature: "relay",
    kicker: "relay",
    title: "the release is moving",
    summary: "runner is shipping the last 1.9.9 pieces while inspector keeps the visual work honest.",
    label: "working",
    tone: "info",
    signal: "working",
    metric: "1.9.9",
    metricLabel: "current release",
    staff: "ellis",
    team: "runner",
    progress: null,
    rows: [["source", "v71"], ["checks", "green"]],
    next: "verify the card in a real ChatGPT consumer"
  },
  runner: {
    feature: "runner",
    kicker: "runner reporting",
    title: "runner is moving the release forward",
    summary: "the branch is admitted, checks are green, and the current deployment is being verified.",
    label: "working",
    tone: "good",
    signal: "working",
    metric: "82%",
    metricLabel: "declared milestone",
    staff: "ellis",
    team: "runner",
    progress: 82,
    rows: [["branch", "1.9.9"], ["handoff", "inspector next"]],
    next: "capture the final consumer proof"
  },
  inspector: {
    feature: "inspector",
    kicker: "inspector reporting",
    title: "three screens need your eye",
    summary: "fresh visual evidence is ready. the technical checks passed; these need a human call.",
    label: "needs you",
    tone: "act",
    signal: "attention",
    metric: "3",
    metricLabel: "screens waiting",
    staff: "valentina",
    team: "inspector",
    progress: null,
    rows: [["latest", "just now"], ["review", "visual QA"]],
    next: "open the newest capture"
  },
  "night-shift": {
    feature: "night-shift",
    kicker: "night shift reporting",
    title: "everything boring is still being watched",
    summary: "four automatic checks are running quietly. nothing needs you right now.",
    label: "watching",
    tone: "quiet",
    signal: "external",
    metric: "4",
    metricLabel: "checks watching",
    staff: "relay",
    team: "night shift",
    progress: null,
    rows: [["last pass", "8m ago"], ["next pass", "soon"]],
    next: "leave it alone unless something changes"
  }
});

function renderChatCardPreview() {
  const target = document.querySelector("#chat-card-preview");
  const tabs = document.querySelector("#chat-card-tabs");
  if (!target || !tabs) return;

  tabs.innerHTML = Object.entries(cardPreviews).map(([id, card]) => {
    const active = id === cardPreviewMode;
    return '<button type="button" role="tab" aria-selected="' + active + '" class="' + (active ? "active" : "") + '" data-card-preview="' + esc(id) + '">' + esc(card.feature.replace("-", " ")) + '</button>';
  }).join("");

  const card = cardPreviews[cardPreviewMode] || cardPreviews.relay;
  const accent = featureAccent[card.feature] || featureAccent.relay;
  const rows = card.rows.map(([label, value]) =>
    '<div class="chat-card-row"><strong>' + esc(label) + '</strong><span>' + esc(value) + '</span></div>'
  ).join("");

  target.innerHTML = `
    <article class="chat-card-preview" data-feature="${esc(card.feature)}" data-signal="${esc(card.signal)}" style="--card-accent:${esc(accent)}">
      <section class="chat-card-hero">
        <div class="chat-card-mark" aria-hidden="true"><img src="${esc(brand[card.feature] || brand.relay)}" alt=""></div>
        <div class="chat-card-copy">
          <span class="chat-card-kicker">${esc(card.kicker)}</span>
          <h3>${esc(card.feature.replace("-", " "))}</h3>
          <strong>${esc(card.title)}</strong>
          <p>${esc(card.summary)}</p>
          <span class="chat-card-staff"><span class="chat-card-avatar" aria-hidden="true"></span><span>${esc(card.staff)}</span><small>${esc(card.team)}</small></span>
        </div>
      </section>
      <aside class="chat-card-insight">
        <span class="chat-card-state" data-tone="${esc(card.tone)}"><span class="status-light" aria-hidden="true"></span><span>${esc(card.label)}</span></span>
        <div class="chat-card-metric">${esc(card.metric)}</div>
        <div class="chat-card-metric-label">${esc(card.metricLabel)}</div>
        ${card.progress == null ? "" : '<div class="chat-card-meter" aria-label="' + esc(card.progress + "% complete") + '"><span style="width:' + card.progress + '%"></span></div>'}
        <div class="chat-card-rows">${rows}</div>
        <p class="chat-card-next">next: ${esc(card.next)}</p>
        <div class="chat-card-actions" aria-label="Preview actions"><button type="button" disabled>refresh</button><button type="button" class="primary" disabled>open relay</button></div>
      </aside>
    </article>
  `;

  tabs.querySelectorAll("[data-card-preview]").forEach(button => {
    button.addEventListener("click", () => {
      cardPreviewMode = button.dataset.cardPreview;
      renderChatCardPreview();
    });
  });
}

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
  renderChatCardPreview();
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
  showLoading(target, "review", "Loading captures");

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
