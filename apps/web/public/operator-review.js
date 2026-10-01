import { showLoading } from "./loading.js";
import { brand, featureAccent } from "./brand.js";
import { iconSlot, hydrateProjectIcons } from "./project-icons.js";

import { openQa } from "./qa.js";
import { esc, projectName } from "./operator-projects.js";

let reviewItems = [];
let reviewMode = "needs";
let reviewUi = null;
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

function reviewDisposition(item) {
  const explicit = item.qaReview?.disposition;
  if (["pending", "completed", "stale", "archived"].includes(explicit)) return explicit;
  return item.qaReview?.overall ? "completed" : "pending";
}

function reviewStats() {
  const stats = { pending: 0, completed: 0, stale: 0, archived: 0 };
  reviewItems.forEach(item => { stats[reviewDisposition(item)] += 1; });
  return stats;
}

function updateReviewOverview() {
  const stats = reviewStats();
  reviewUi?.setOverviewDetail(
    stats.pending + " awaiting review · " +
    stats.stale + " stale · " +
    stats.completed + " completed"
  );
}

function visibleReviews() {
  if (reviewMode === "all") return reviewItems.filter(item => reviewDisposition(item) !== "archived");
  const wanted = reviewMode === "needs" ? "pending" : reviewMode;
  return reviewItems.filter(item => reviewDisposition(item) === wanted);
}

function dispositionMeta(disposition) {
  if (disposition === "completed") return { label: "completed", tone: "done", signal: "steady" };
  if (disposition === "stale") return { label: "stale", tone: "warn", signal: "steady" };
  if (disposition === "archived") return { label: "archived", tone: "quiet", signal: "steady" };
  return { label: "needs review", tone: "act", signal: "attention" };
}

function reviewActions(disposition) {
  if (disposition === "completed") return [
    ["pending", "reopen"],
    ["stale", "mark stale"]
  ];
  if (disposition === "stale") return [["pending", "reopen"]];
  if (disposition === "archived") return [["stale", "restore"]];
  return [
    ["completed", "mark completed"],
    ["stale", "mark stale"]
  ];
}

async function setReviewDisposition(item, disposition, { render = true } = {}) {
  const current = item.qaReview || {};
  const payload = {
    answers: { ...(current.answers || {}) },
    notes: current.notes || "",
    overall: current.overall || null,
    disposition
  };
  const result = await api(
    "/api/visual/" + encodeURIComponent(item.evidence_id) + "/qa",
    { method: "POST", body: JSON.stringify(payload) }
  );
  item.qaReview = result.review || { ...payload, evidence_id: item.evidence_id };
  if (render) {
    renderReview();
    updateReviewOverview();
  }
  reviewUi?.setConnection("connected", "good");
}

async function clearStaleReviews(button) {
  const stale = reviewItems.filter(item => reviewDisposition(item) === "stale");
  if (!stale.length) return;
  button.disabled = true;
  const label = button.textContent;
  button.textContent = "clearing…";
  try {
    await Promise.all(stale.map(item => setReviewDisposition(item, "archived", { render: false })));
    renderReview();
    updateReviewOverview();
  } catch (error) {
    reviewUi?.setConnection("couldn’t update review", "bad");
  } finally {
    button.textContent = label;
    button.disabled = reviewStats().stale === 0;
  }
}

function renderReview() {
  const target = document.querySelector("#review-list");
  const count = document.querySelector("#review-count");
  const filters = document.querySelector("#review-filters");
  const bulk = document.querySelector('[data-review-bulk="clear-stale"]');
  const stats = reviewStats();
  const visible = visibleReviews();

  count.innerHTML = '<span class="status-light" aria-hidden="true"></span><span>' +
    (stats.pending ? stats.pending + " need" + (stats.pending === 1 ? "s" : "") + " you" : "all caught up") +
    '</span>';
  count.className = "review-count status-badge";
  count.dataset.tone = stats.pending ? "act" : "done";
  count.dataset.signal = stats.pending ? "attention" : "steady";

  filters?.querySelectorAll("[data-review-mode]").forEach(button => {
    button.classList.toggle("active", button.dataset.reviewMode === reviewMode);
  });
  if (bulk) {
    bulk.disabled = stats.stale === 0;
    bulk.title = stats.stale ? "Archive " + stats.stale + " stale review" + (stats.stale === 1 ? "" : "s") : "No stale reviews";
  }

  if (!visible.length) {
    const empty = {
      needs: ["nothing waiting for review.", "completed and stale captures stay out of your active queue."],
      completed: ["nothing completed yet.", "mark a capture completed when you are done with it."],
      stale: ["no stale captures.", "mark outdated evidence stale, then clear it when you are ready."],
      archived: ["archive is empty.", "clear stale moves old captures here so they can still be restored."],
      all: ["no active review evidence.", "archived captures remain available in the archived filter."]
    }[reviewMode] || ["nothing here.", ""];
    target.innerHTML = '<div class="clear-card review-clear"><strong>' + esc(empty[0]) + '</strong><span>' + esc(empty[1]) + '</span></div>';
    return;
  }

  target.innerHTML = visible.slice(0, 18).map(item => {
    const context = item.context || {};
    const disposition = reviewDisposition(item);
    const meta = dispositionMeta(disposition);
    const actions = reviewActions(disposition).map(([next, label]) =>
      '<button type="button" class="review-action" data-review-action="' + esc(next) +
      '" data-evidence-action-id="' + esc(item.evidence_id) + '">' + esc(label) + '</button>'
    ).join("");
    return `
      <article class="review-row" data-tone="${esc(meta.tone)}" data-signal="${esc(meta.signal)}" data-review-disposition="${esc(disposition)}">
        <button class="review-open" type="button" data-review-id="${esc(item.evidence_id)}" aria-label="Open ${esc(evidenceTitle(item))}">
          <img src="${esc(item.screenshot_url)}" alt="">
          <span class="review-copy">
            <span class="review-project project-name">${iconSlot(context.project)}${esc(projectName(context.project || "review"))}</span>
            <strong>${esc(evidenceTitle(item))}</strong>
            <small>${esc(context.environment || "capture")} · ${esc(relative(item.captured_at))}</small>
          </span>
        </button>
        <div class="review-card-footer">
          <span class="review-state status-badge ${disposition === "completed" ? "done" : ""}" data-tone="${esc(meta.tone)}" data-signal="${esc(meta.signal)}"><span class="status-light" aria-hidden="true"></span><span>${esc(meta.label)}</span></span>
          <div class="review-actions">${actions}</div>
        </div>
      </article>
    `;
  }).join("");

  hydrateProjectIcons(target);
  target.querySelectorAll("[data-review-id]").forEach(button => {
    button.addEventListener("click", () => openQa(button.dataset.reviewId));
  });
  target.querySelectorAll("[data-review-action]").forEach(button => {
    button.addEventListener("click", async () => {
      const item = reviewItems.find(candidate => candidate.evidence_id === button.dataset.evidenceActionId);
      if (!item) return;
      button.disabled = true;
      try {
        await setReviewDisposition(item, button.dataset.reviewAction);
      } catch (error) {
        button.disabled = false;
        reviewUi?.setConnection("couldn’t update review", "bad");
      }
    });
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
  document.querySelector('[data-review-bulk="clear-stale"]')?.addEventListener("click", event => {
    void clearStaleReviews(event.currentTarget);
  });
}

export async function loadReview(ui, projectId = "") {
  reviewUi = ui;
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
      if (deduped.length >= 30) break;
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
    updateReviewOverview();
    ui.setConnection("connected", "good");
  } catch (error) {
    count.textContent = "";
    target.innerHTML = '<div class="operator-empty">Review items could not be loaded right now.</div>';
    ui.setConnection(error.status === 403 ? "access needed" : "couldn’t connect", "bad");
  }
}
