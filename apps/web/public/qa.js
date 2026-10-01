import { loadingMarkup } from "./loading.js";
import { qaEscape, renderQaPanel, renderQaPreview } from "./qa-panel.js";
import { createQaFloat } from "./qa-float.js";
import { createQaViewport } from "./qa-viewport.js";
import { createQaContrast } from "./qa-contrast.js";

const visualContent = document.querySelector("#visual-content");
const visualHeadingTools = document.querySelector(".visual-heading-tools");
let stage = null;
let state = null;
let questionIndex = 0;
let previewMode = "captured";
let saveTimer = null;
let viewportController = null;
let floatController = null;
let contrastController = null;
let historyToken = null;
const saving = new Set();

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
  node.setAttribute("aria-label", "Inspector review");
  node.innerHTML =
    '<div class="qa-preview">' + loadingMarkup("preview", "Loading review surface") + '</div>' +
    '<button type="button" class="qa-exit" aria-label="Exit full screen review">Back</button>' +
    '<aside class="qa-companion" role="dialog" aria-label="Inspector questions">' +
      '<div class="qa-review-loading">Loading review…</div>' +
    '</aside>';
  document.body.appendChild(node);
  document.body.classList.add("qa-open");

  let exitTimer = null;
  node.addEventListener("pointermove", event => {
    const nearCorner = event.clientX <= 88 && event.clientY <= 88;
    if (nearCorner) {
      clearTimeout(exitTimer);
      node.classList.add("qa-exit-visible");
    } else if (node.classList.contains("qa-exit-visible")) {
      clearTimeout(exitTimer);
      exitTimer = setTimeout(() => node.classList.remove("qa-exit-visible"), 700);
    }
  });
  node.querySelector(".qa-exit").addEventListener("click", () => closeQa());
  return node;
}

function pushQaHistory(evidenceId) {
  historyToken = "relay-qa-" + Date.now().toString(36);
  history.pushState({ ...(history.state || {}), relayQaToken: historyToken, evidenceId }, "", location.href);
}

function deriveOverall(review, questions) {
  if (!questions.length) return review.overall || null;
  const answers = questions.map(question => review.answers?.[question.id]);
  if (answers.some(answer => answer === "no")) return "needs_work";
  if (answers.every(answer => answer === "yes")) return "looks_good";
  return null;
}

function edited() {
  state.revision += 1;
  state.dirty = true;
  state.saved = false;
}

function handlers() {
  return {
    answer(id, answer) {
      edited();
      if (!state.review.answers) state.review.answers = {};
      state.review.answers[id] = answer;
      state.review.overall = deriveOverall(state.review, state.questions || []);
      repaintPanel();
      queueSave(80);
      if (questionIndex < (state.questions || []).length - 1) {
        setTimeout(function () {
          if (!stage || !state) return;
          questionIndex += 1;
          repaintPanel();
        }, 180);
      }
    },
    notes(notes) {
      edited();
      state.review.notes = notes;
      queueSave(650);
    }
  };
}

function repaintPanel() {
  if (!stage || !state) return;
  renderQaPanel(stage, state, questionIndex, handlers());
  requestAnimationFrame(() => floatController?.refresh());
}

function setView(mode) {
  viewportController?.destroy();
  previewMode = renderQaPreview(stage, state, mode);
  viewportController = createQaViewport(stage, { mode: previewMode });
}

function initialQuestionIndex() {
  const questions = state.questions || [];
  const index = questions.findIndex(question => !state.review.answers?.[question.id]);
  return index >= 0 ? index : Math.max(0, questions.length - 1);
}

export async function openQa(evidenceId) {
  if (stage) closeQa({ popHistory: false });
  stage = buildStage();
  pushQaHistory(evidenceId);

  const openingStage = stage;
  try {
    const results = await Promise.all([
      api("/api/visual/" + encodeURIComponent(evidenceId) + "/qa"),
      api("/api/visual/" + encodeURIComponent(evidenceId) + "/live")
    ]);
    if (stage !== openingStage) return;

    state = {
      evidence: results[0].evidence,
      questions: results[0].questions || [],
      review: results[0].review || { answers: {}, notes: "", overall: null },
      live: results[1].live || {},
      saved: Boolean(results[0].review?.updated_at),
      dirty: false,
      revision: 0
    };

    questionIndex = initialQuestionIndex();
    previewMode = state.live.active && state.live.embeddable
      ? "live"
      : state.evidence?.video_url
        ? "video"
        : "captured";

    setView(previewMode);
    repaintPanel();

    contrastController = createQaContrast(stage);
    floatController = createQaFloat(stage, {
      onDockChange(edge) { void contrastController?.update(edge); }
    });
    requestAnimationFrame(() => floatController?.refresh());
  } catch (error) {
    if (stage !== openingStage) return;
    stage.querySelector(".qa-preview").innerHTML =
      '<div class="qa-surface-error">QA could not open: ' + qaEscape(error.message) + '</div>';
    stage.querySelector(".qa-companion").innerHTML =
      '<div class="qa-review-head"><div class="qa-review-progress"><span class="qa-review-dot"></span><span>Review</span></div></div>' +
      '<section class="qa-question-card"><h2 class="qa-question">Could not open this review.</h2>' +
      '<p class="qa-question-reason">' + qaEscape(error.message) + '</p></section>';
    contrastController = createQaContrast(stage);
    floatController = createQaFloat(stage, {
      onDockChange(edge) { void contrastController?.update(edge); }
    });
  }
}

function queueSave(delay) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveReview, delay || 500);
  const message = stage?.querySelector("[data-qa-save-state]");
  if (message) message.textContent = "Saving…";
}

async function saveReview(snapshot = null) {
  const activeState = snapshot || state;
  if (!activeState?.evidence) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  if (saving.has(activeState)) {
    activeState.saveAgain = true;
    return;
  }

  saving.add(activeState);
  const revision = activeState.revision;
  const evidenceId = activeState.evidence.evidence_id;
  const review = {
    answers: { ...(activeState.review.answers || {}) },
    notes: activeState.review.notes || "",
    overall: deriveOverall(activeState.review, activeState.questions || [])
  };
  const message = stage?.querySelector("[data-qa-save-state]");
  if (message) message.textContent = "Saving…";

  try {
    const payload = await api(
      "/api/visual/" + encodeURIComponent(evidenceId) + "/qa",
      { method: "POST", body: JSON.stringify(review) }
    );

    if (state === activeState && activeState.revision === revision) {
      state.review = payload.review;
      state.saved = true;
      state.dirty = false;
    }
    if (message?.isConnected && activeState.revision === revision) message.textContent = "Saved";
  } catch (error) {
    if (message?.isConnected) message.textContent = "Could not save · " + error.message;
  } finally {
    saving.delete(activeState);
    if (activeState.saveAgain) {
      activeState.saveAgain = false;
      setTimeout(() => saveReview(activeState), 80);
    }
  }
}

function teardownQa() {
  const activeState = state;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (activeState) void saveReview(activeState);
  }
  viewportController?.destroy();
  floatController?.destroy();
  contrastController?.destroy();
  viewportController = null;
  floatController = null;
  contrastController = null;
  stage?.remove();
  stage = null;
  state = null;
  document.body.classList.remove("qa-open");
}

function closeQa({ popHistory = true } = {}) {
  const token = historyToken;
  teardownQa();
  historyToken = null;
  if (popHistory && token && history.state?.relayQaToken === token) history.back();
}

window.addEventListener("popstate", function () {
  if (stage) closeQa({ popHistory: false });
});

window.addEventListener("keydown", function (event) {
  if (stage && event.key === "Escape") closeQa();
});
