import { glyph } from "../../../packages/shared-ui/glyphs.js";
import { brand } from "./brand.js";
import { iconSlot, hydrateProjectIcons } from "./project-icons.js";
import { projectName } from "./operator-projects.js";

export function qaEscape(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char];
  });
}

function answerLabel(value) {
  if (value === "yes") return "Yes";
  if (value === "no") return "No, fix it";
  return "Not sure";
}

function verdictLabel(value) {
  if (value === "looks_good") return "Looks good";
  if (value === "needs_work") return "Needs work";
  return "Not sure";
}

export function renderQaPreview(stage, state, requestedMode) {
  const preview = stage.querySelector(".qa-preview");
  const live = state.live || {};
  const evidence = state.evidence || {};
  const canLive = Boolean(live.active && live.embeddable && live.url);
  const mode = requestedMode === "live" && canLive ? "live" : "captured";

  stage.querySelectorAll("[data-qa-view]").forEach(function (button) {
    button.classList.toggle("active", button.dataset.qaView === mode);
    if (button.dataset.qaView === "live") button.disabled = !canLive;
  });

  if (mode === "live") {
    preview.innerHTML =
      '<iframe src="' + qaEscape(live.url) + '" title="Live QA preview"></iframe>' +
      '<div class="qa-preview-message">Live environment · interactive. Switch to Captured to review exactly what Inspector saw.</div>';
  } else {
    let message = "The original environment is no longer active. Showing the exact captured evidence instead.";
    if (live.active && live.embeddable) message = "Exact captured evidence.";
    if (live.active && !live.embeddable) message = "The environment is still active, but it cannot be embedded here. Use Open preview to interact with it.";
    preview.innerHTML =
      '<img src="' + qaEscape(evidence.screenshot_url) + '" alt="Exact captured QA evidence">' +
      '<div class="qa-preview-message">' + qaEscape(message) + "</div>";
  }
  return mode;
}

export function renderQaToolbar(stage, state, mode, onView) {
  const toolbar = stage.querySelector(".qa-preview-toolbar");
  const live = state.live || {};
  const canLive = Boolean(live.active && live.embeddable && live.url);
  toolbar.innerHTML =
    '<button type="button" class="qa-view-toggle" data-qa-view="live" ' + (canLive ? "" : "disabled") + ">Live</button>" +
    '<button type="button" class="qa-view-toggle" data-qa-view="captured">Captured</button>' +
    (live.active && live.url
      ? '<a class="qa-live-link" href="' + qaEscape(live.url) + '" target="_blank" rel="noreferrer">Open preview ↗</a>'
      : "");

  toolbar.querySelectorAll("[data-qa-view]").forEach(function (button) {
    button.classList.toggle("active", button.dataset.qaView === mode);
    button.addEventListener("click", function () {
      if (!button.disabled) onView(button.dataset.qaView);
    });
  });
}

export function renderQaPanel(stage, state, questionIndex, handlers) {
  const panel = stage.querySelector(".qa-companion");
  const evidence = state.evidence || {};
  const context = evidence.context || {};
  const review = state.review || { answers: {}, notes: "", overall: null };
  const questions = state.questions || [];
  const q = questions[questionIndex] || null;
  const live = state.live || {};
  const answered = Object.keys(review.answers || {}).length;

  let questionHtml = "";
  if (q) {
    const answer = review.answers && review.answers[q.id];
    questionHtml =
      '<section class="qa-question-card">' +
      '<div class="qa-progress">Question ' + (questionIndex + 1) + " of " + questions.length + " · " + answered + " answered</div>" +
      '<h2 class="qa-question">' + qaEscape(q.prompt) + "</h2>" +
      '<p class="qa-question-reason">' + qaEscape(q.reason || "") + "</p>" +
      '<div class="qa-answer-grid" role="group" aria-label="Answer">' +
      ["yes", "no", "not_sure"].map(function (value) {
        return '<button type="button" class="qa-answer ' + (answer === value ? "selected" : "") +
          '" data-qa-answer="' + value + '">' + answerLabel(value) + "</button>";
      }).join("") +
      "</div>" +
      '<div class="qa-question-nav">' +
      '<button type="button" class="qa-text-button" data-qa-prev ' + (questionIndex === 0 ? "disabled" : "") + ">" + glyph("previous") + " Previous</button>" +
      '<button type="button" class="qa-text-button" data-qa-next ' + (questionIndex >= questions.length - 1 ? "disabled" : "") + ">Next " + glyph("next") + "</button>" +
      "</div></section>";
  } else {
    questionHtml =
      '<section class="qa-question-card">' +
      '<div class="qa-progress">Human QA</div>' +
      '<h2 class="qa-question">No targeted questions for this capture.</h2>' +
      '<p class="qa-question-reason">You can still leave notes and give the screen an overall verdict.</p></section>';
  }

  panel.innerHTML =
    '<div class="qa-panel-head">' +
      '<div class="qa-panel-identity">' +
        '<span class="qa-product-badge">' + (context.project ? iconSlot(context.project) : "") +
          '<strong>' + qaEscape(context.project ? projectName(context.project) : evidence.title || "capture") + '</strong></span>' +
        '<span class="qa-tool-identity"><img src="' + brand.inspector + '" alt=""><span>inspector</span></span>' +
      '</div>' +
      '<div class="qa-panel-tools">' +
        '<button type="button" class="qa-icon-button" data-qa-side aria-label="Move review to the other side" title="Move panel">' + glyph("move") + '</button>' +
        '<button type="button" class="qa-icon-button" data-qa-minimize aria-label="Minimize review" title="Minimize">' + glyph("minimize") + '</button>' +
        '<button type="button" class="qa-icon-button" data-qa-close aria-label="Close QA" title="Close">' + glyph("close") + '</button>' +
      "</div>" +
    "</div>" +
    '<div class="qa-panel-body">' +
      (evidence.step_label ? '<div class="qa-capture-title">' + qaEscape(evidence.step_label) + "</div>" : "") +
      '<div class="qa-status-line"><span>' + qaEscape(context.environment || "unknown") + "</span><span>" +
        qaEscape(live.active ? "preview active" : "capture only") + "</span></div>" +
      '<span class="badge qa-flow-badge" data-tone="' + (state.saved && review.overall ? "resolve" : state.dirty ? "act" : "orient") + '">' + (state.saved && review.overall ? "Review saved" : state.dirty ? "Unsaved changes" : "Review capture") + '</span>' +
      questionHtml +
      '<label class="qa-notes"><span>Notes</span><textarea maxlength="6000" placeholder="Anything you notice, in your own words…">' +
        qaEscape(review.notes || "") + "</textarea></label>" +
      '<div class="qa-overall"><div class="qa-overall-label">Overall</div><div class="qa-overall-options" role="group" aria-label="Overall verdict">' +
        ["looks_good", "needs_work", "not_sure"].map(function (value) {
          return '<button type="button" class="qa-overall-button ' + (review.overall === value ? "selected" : "") +
            '" data-qa-overall="' + value + '">' + verdictLabel(value) + "</button>";
        }).join("") +
      "</div></div>" +
      (state.saved && review.overall ? '<section class="qa-resolution"><span class="badge" data-tone="resolve">Recorded</span><strong>Your review is saved.</strong><p>' + qaEscape(verdictLabel(review.overall)) + ' · attached to this exact capture.</p></section>' : "") +
      '<details class="qa-details"><summary>Technical details</summary><dl>' +
        '<div><dt>capture</dt><dd>' + qaEscape(evidence.evidence_id || "—") + "</dd></div>" +
        '<div><dt>viewport</dt><dd>' + qaEscape(evidence.viewport && evidence.viewport.width ? evidence.viewport.width + " × " + evidence.viewport.height : "—") + "</dd></div>" +
        '<div><dt>revision</dt><dd>' + qaEscape(context.commit_sha ? String(context.commit_sha).slice(0, 12) : "—") + "</dd></div>" +
        '<div><dt>PR</dt><dd>' + qaEscape(context.pr_number || "—") + "</dd></div>" +
      "</dl></details>" +
    "</div>" +
      '<div class="qa-save-row"><span class="qa-save-state" aria-live="polite">' +
        qaEscape(review.updated_at ? "Saved " + new Date(review.updated_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Not saved yet") +
        '</span><button type="button" class="qa-save-button" data-qa-save>' + glyph("save") + ' Save review</button></div>';

  void hydrateProjectIcons(panel);
  panel.querySelector("[data-qa-close]").addEventListener("click", handlers.close);
  panel.querySelector("[data-qa-minimize]").addEventListener("click", handlers.minimize);
  panel.querySelector("[data-qa-side]").addEventListener("click", handlers.move);

  panel.querySelectorAll("[data-qa-answer]").forEach(function (button) {
    button.addEventListener("click", function () { handlers.answer(q.id, button.dataset.qaAnswer); });
  });
  const previous = panel.querySelector("[data-qa-prev]");
  const next = panel.querySelector("[data-qa-next]");
  if (previous) previous.addEventListener("click", handlers.previous);
  if (next) next.addEventListener("click", handlers.next);

  const textarea = panel.querySelector("textarea");
  if (textarea) textarea.addEventListener("input", function () { handlers.notes(textarea.value); });

  panel.querySelectorAll("[data-qa-overall]").forEach(function (button) {
    button.addEventListener("click", function () { handlers.overall(button.dataset.qaOverall); });
  });
  panel.querySelector("[data-qa-save]").addEventListener("click", handlers.save);
}
