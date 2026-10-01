import { loadingMarkup } from "./loading.js";
import { iconSlot, hydrateProjectIcons } from "./project-icons.js";
import { projectName } from "./operator-projects.js";

export function qaEscape(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char];
  });
}

function answerLabel(value) {
  if (value === "yes") return "Yes, clear";
  if (value === "no") return "No, needs work";
  return "Not sure";
}

function surfaceSize(evidence = {}) {
  const width = Math.max(320, Math.min(3840, Number(evidence.viewport?.width) || 1440));
  const height = Math.max(240, Math.min(2160, Number(evidence.viewport?.height) || 900));
  return { width, height };
}

export function renderQaPreview(stage, state, requestedMode) {
  const preview = stage.querySelector(".qa-preview");
  const live = state.live || {};
  const evidence = state.evidence || {};
  const canLive = Boolean(live.active && live.embeddable && live.url);
  const canVideo = Boolean(evidence.video_url);
  const mode =
    requestedMode === "live" && canLive ? "live" :
    requestedMode === "video" && canVideo ? "video" :
    canLive ? "live" :
    canVideo ? "video" :
    "captured";
  const { width, height } = surfaceSize(evidence);

  let media = "";
  if (mode === "live") {
    media = '<iframe class="qa-surface-media" src="' + qaEscape(live.url) + '" title="Live QA preview" data-qa-live-preview></iframe>';
  } else if (mode === "video") {
    media = '<video class="qa-surface-media" src="' + qaEscape(evidence.video_url) + '" controls playsinline preload="metadata" aria-label="Recorded QA evidence"></video>';
  } else {
    media = loadingMarkup("preview", "Loading captured image") +
      '<img class="qa-surface-media qa-image-pending" src="' + qaEscape(evidence.screenshot_url) + '" alt="Exact captured QA evidence">';
  }

  preview.innerHTML =
    '<div class="qa-camera"><div class="qa-surface" data-qa-surface-kind="' + mode +
    '" style="width:' + width + 'px;height:' + height + 'px">' + media +
    '</div></div><div class="qa-gesture-layer" aria-hidden="true"></div>';

  if (mode === "captured") {
    const image = preview.querySelector("img");
    const finish = () => {
      preview.querySelector(".content-skeleton")?.remove();
      image.classList.remove("qa-image-pending");
      if (!image.naturalWidth) preview.innerHTML = '<div class="qa-surface-error">The captured image could not load.</div>';
    };
    image.addEventListener("load", finish, { once: true });
    image.addEventListener("error", finish, { once: true });
    if (image.complete) finish();
  }
  return mode;
}

export function renderQaPanel(stage, state, questionIndex, handlers) {
  const panel = stage.querySelector(".qa-companion");
  const evidence = state.evidence || {};
  const context = evidence.context || {};
  const review = state.review || { answers: {}, notes: "", overall: null };
  const questions = state.questions || [];
  const q = questions[questionIndex] || null;
  const answer = q ? review.answers?.[q.id] : null;
  const progress = q ? "Review " + (questionIndex + 1) + " of " + questions.length : "Review";

  panel.innerHTML =
    '<div class="qa-review-head">' +
      '<div class="qa-review-progress"><span class="qa-review-dot" aria-hidden="true"></span><span>' + qaEscape(progress) + '</span></div>' +
      (context.project ? '<span class="qa-project-pill">' + iconSlot(context.project) +
        '<strong>' + qaEscape(projectName(context.project)) + '</strong></span>' : "") +
    '</div>' +
    '<section class="qa-question-card">' +
      '<h2 class="qa-question">' + qaEscape(q?.prompt || "Anything feel off?") + '</h2>' +
      '<p class="qa-question-reason">' + qaEscape(q?.reason || "Leave a note if there is anything you want changed.") + '</p>' +
      (q ? '<div class="qa-answer-stack" role="group" aria-label="Answer">' +
        ["yes", "no"].map(function (value) {
          return '<button type="button" class="qa-answer ' + (answer === value ? "selected" : "") +
            '" data-qa-answer="' + value + '">' + answerLabel(value) + '</button>';
        }).join("") + '</div>' : "") +
    '</section>' +
    '<label class="qa-notes"><span class="sr-only">Notes</span><textarea maxlength="6000" placeholder="Add a note…">' +
      qaEscape(review.notes || "") + '</textarea></label>' +
    '<span class="qa-save-state sr-only" data-qa-save-state aria-live="polite">' +
      qaEscape(review.updated_at ? "Saved" : "Not saved yet") + '</span>';

  void hydrateProjectIcons(panel);
  if (q) {
    panel.querySelectorAll("[data-qa-answer]").forEach(function (button) {
      button.addEventListener("click", function () { handlers.answer(q.id, button.dataset.qaAnswer); });
    });
  }
  const textarea = panel.querySelector("textarea");
  if (textarea) textarea.addEventListener("input", function () { handlers.notes(textarea.value); });
}
