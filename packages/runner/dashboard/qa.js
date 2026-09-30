
import { qaEscape, renderQaPanel, renderQaPreview, renderQaToolbar } from "./qa-panel.js";

const visualContent = document.querySelector("#visual-content");
const visualHeadingTools = document.querySelector(".visual-heading-tools");
let stage = null;
let state = null;
let questionIndex = 0;
let previewMode = "captured";
let saveTimer = null;

async function api(url, options) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...options
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { error: text || "Unexpected " + response.status + " response." }; }
  if (!response.ok) throw Object.assign(new Error(body.error || "Request failed"), { status: response.status });
  return body;
}

function selectedEvidenceId() {
  const active = visualContent && visualContent.querySelector("[data-evidence-id].active");
  if (active && active.dataset.evidenceId) return active.dataset.evidenceId;
  const image = visualContent && visualContent.querySelector('img[src*="/api/visual/vis_"]');
  if (!image) return null;
  const match = image.getAttribute("src").match(/\/api\/visual\/(vis_[a-zA-Z0-9-]+)\/image/);
  return match ? match[1] : null;
}

function ensureLaunch() {
  if (!visualHeadingTools || document.querySelector("#qa-review-launch")) return;
  const button = document.createElement("button");
  button.id = "qa-review-launch";
  button.className = "qa-launch";
  button.type = "button";
  button.textContent = "Review full screen";
  button.addEventListener("click", function () {
    const id = selectedEvidenceId();
    if (id) openQa(id);
  });
  visualHeadingTools.prepend(button);
}

function syncLaunch() {
  ensureLaunch();
  const button = document.querySelector("#qa-review-launch");
  if (!button) return;
  const id = selectedEvidenceId();
  button.disabled = !id;
  button.title = id ? "Review this capture in full-screen QA mode" : "Choose a capture first";
}

if (visualContent) {
  new MutationObserver(syncLaunch).observe(visualContent, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });
}
document.addEventListener("click", function () { setTimeout(syncLaunch, 0); });
syncLaunch();

function buildStage() {
  const node = document.createElement("section");
  node.className = "qa-stage";
  node.setAttribute("aria-label", "Runner QA review");
  node.innerHTML =
    '<div class="qa-preview"></div>' +
    '<div class="qa-preview-toolbar" aria-label="Preview controls"></div>' +
    '<aside class="qa-companion" role="dialog" aria-label="Runner QA questions"></aside>' +
    '<button type="button" class="qa-mini">runner qa · reopen</button>';
  document.body.appendChild(node);
  document.body.classList.add("qa-open");
  node.querySelector(".qa-mini").addEventListener("click", function () {
    node.classList.remove("qa-minimized");
  });
  return node;
}

function handlers() {
  return {
    close: closeQa,
    minimize: function () { stage.classList.add("qa-minimized"); },
    move: function () { stage.classList.toggle("qa-left"); },
    previous: function () {
      questionIndex = Math.max(0, questionIndex - 1);
      repaintPanel();
    },
    next: function () {
      questionIndex = Math.min((state.questions || []).length - 1, questionIndex + 1);
      repaintPanel();
    },
    answer: function (id, answer) {
      if (!state.review.answers) state.review.answers = {};
      state.review.answers[id] = answer;
      repaintPanel();
      queueSave(80);
      if (questionIndex < (state.questions || []).length - 1) {
        setTimeout(function () {
          questionIndex += 1;
          repaintPanel();
        }, 180);
      }
    },
    notes: function (notes) {
      state.review.notes = notes;
      queueSave(650);
    },
    overall: function (verdict) {
      state.review.overall = verdict;
      repaintPanel();
      queueSave(80);
    },
    save: saveReview
  };
}

function repaintPanel() {
  if (stage && state) renderQaPanel(stage, state, questionIndex, handlers());
}

function setView(mode) {
  previewMode = renderQaPreview(stage, state, mode);
  renderQaToolbar(stage, state, previewMode, setView);
}

export async function openQa(evidenceId) {
  if (stage) closeQa();
  stage = buildStage();
  stage.querySelector(".qa-preview").innerHTML =
    '<div class="qa-preview-message">Opening QA workspace…</div>';

  try {
    const results = await Promise.all([
      api("/api/visual/" + encodeURIComponent(evidenceId) + "/qa"),
      api("/api/visual/" + encodeURIComponent(evidenceId) + "/live")
    ]);
    state = {
      evidence: results[0].evidence,
      questions: results[0].questions || [],
      review: results[0].review || { answers: {}, notes: "", overall: null },
      live: results[1].live || {}
    };
    questionIndex = 0;
    previewMode = state.live.active && state.live.embeddable ? "live" : "captured";
    setView(previewMode);
    repaintPanel();
  } catch (error) {
    stage.querySelector(".qa-preview").innerHTML =
      '<div class="qa-preview-message">QA could not open: ' + qaEscape(error.message) + "</div>";
    const panel = stage.querySelector(".qa-companion");
    panel.innerHTML =
      '<div class="qa-panel-head"><div class="qa-panel-brand"><strong>runner qa</strong><small>could not load</small></div>' +
      '<button type="button" class="qa-icon-button" data-qa-close aria-label="Close QA">×</button></div>' +
      '<div class="qa-panel-body"><p class="qa-question-reason">' + qaEscape(error.message) + "</p></div>";
    panel.querySelector("[data-qa-close]").addEventListener("click", closeQa);
  }
}

function queueSave(delay) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveReview, delay || 500);
  const message = stage && stage.querySelector(".qa-save-state");
  if (message) message.textContent = "Saving…";
}

async function saveReview() {
  if (!state || !state.evidence) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  const evidenceId = state.evidence.evidence_id;
  const review = {
    answers: { ...(state.review.answers || {}) },
    notes: state.review.notes || "",
    overall: state.review.overall || null
  };
  const activeStage = stage;
  const message = activeStage && activeStage.querySelector(".qa-save-state");
  if (message) message.textContent = "Saving…";

  try {
    const payload = await api(
      "/api/visual/" + encodeURIComponent(evidenceId) + "/qa",
      {
        method: "POST",
        body: JSON.stringify(review)
      }
    );
    if (state?.evidence?.evidence_id === evidenceId) state.review = payload.review;
    if (message?.isConnected) {
      message.textContent = "Saved " + new Date(payload.review.updated_at).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
      });
    }
  } catch (error) {
    if (message?.isConnected) message.textContent = "Could not save · " + error.message;
  }
}

function closeQa() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    saveReview();
  }
  if (stage) stage.remove();
  stage = null;
  state = null;
  document.body.classList.remove("qa-open");
}

window.addEventListener("keydown", function (event) {
  if (stage && event.key === "Escape") closeQa();
});
