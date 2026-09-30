
import { esc, loadProjectDetail, loadProjectIndex, projectName, stateLabel } from "./operator-projects.js";

let workers = [];
let projectIds = [];
const projectCache = new Map();

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
  if (!value) return "not yet";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "recently";
  const delta = parsed - Date.now();
  const abs = Math.abs(delta);
  const unit = abs < 3_600_000 ? "minute" : abs < 86_400_000 ? "hour" : "day";
  const divisor = unit === "minute" ? 60_000 : unit === "hour" ? 3_600_000 : 86_400_000;
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(delta / divisor), unit);
}

function plainStatus(worker) {
  const state = worker.runtime || {};
  if (!worker.enabled) return "Paused";
  if (["blocked", "failed", "waiting_credentials"].includes(state.status)) return "Needs attention";
  if (state.status === "running") return "Checking now";
  if (state.project_health === "healthy" && state.dependency_health === "healthy") return "All good";
  if (state.dependency_health === "repairable") return "Fix available";
  return "Watching";
}

function primaryAction(worker) {
  const state = worker.runtime || {};
  const dependency = state.dependency || {};
  const repairable = state.dependency_health === "repairable" && dependency.repair_verified === true;

  if (!worker.enabled) return { label: "Resume checks", action: "toggle", tone: "primary" };
  if (worker.id === "field" && repairable) return { label: "Prepare fix", action: "repair", tone: "secondary" };
  if (worker.id === "field" && ["failed", "repairable", "warning"].includes(state.dependency_health)) {
    return { label: "Check setup", action: "doctor", tone: "secondary" };
  }
  return { label: "Check now", action: "run", tone: "primary" };
}

async function performAction(worker, action, button, ui) {
  const original = button.textContent;
  const pending = {
    toggle: worker.enabled ? "Pausing…" : "Resuming…",
    run: "Checking…",
    doctor: "Checking setup…",
    repair: "Preparing…"
  };
  button.disabled = true;
  button.textContent = pending[action] || "Working…";

  try {
    const options = { method: "POST", body: "{}" };
    if (action === "toggle") options.body = JSON.stringify({ enabled: !worker.enabled });
    await api("/api/workers/" + encodeURIComponent(worker.id) + "/" + action, options);
    ui.notify(
      action === "toggle"
        ? (worker.enabled ? "Automatic checks paused." : "Automatic checks resumed.")
        : action === "repair"
          ? "Runner is preparing the guarded fix."
          : action === "doctor"
            ? "Setup check started."
            : "Project check started."
    );
    workers = await api("/api/workers");
    renderAttention(ui);
    renderAutomations(ui);
  } catch (error) {
    ui.notify(error.message, "bad");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function renderAttention(ui) {
  const target = document.querySelector("#today-attention");
  const attention = workers.filter(worker => {
    const state = worker.runtime || {};
    return ["blocked", "failed", "waiting_credentials"].includes(state.status) ||
      ["failed", "repairable"].includes(state.dependency_health);
  });

  if (!attention.length) {
    target.innerHTML = '<div class="clear-card"><strong>You’re clear.</strong><span>Nothing urgent is asking for a decision right now.</span></div>';
    return;
  }

  target.innerHTML = attention.slice(0, 3).map(worker => {
    const state = worker.runtime || {};
    const text =
      state.dependency_health === "repairable"
        ? "Runner found a setup problem it knows how to repair."
        : state.dependency_health === "failed"
          ? "Runner needs to re-check this project’s setup."
          : state.status === "waiting_credentials"
            ? "Runner needs access before it can keep going."
            : "The automatic check stopped and needs another look.";
    return `
      <article class="attention-card">
        <div><span>${esc(projectName(worker.id))}</span><strong>${esc(text)}</strong></div>
        <button type="button" data-jump-worker="${esc(worker.id)}">See the action</button>
      </article>
    `;
  }).join("");

  target.querySelectorAll("[data-jump-worker]").forEach(button => {
    button.addEventListener("click", () => {
      const row = [...document.querySelectorAll("[data-worker-id]")].find(item => item.dataset.workerId === button.dataset.jumpWorker);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

function renderAutomations(ui) {
  const target = document.querySelector("#today-automations");
  if (!workers.length) {
    target.innerHTML = '<div class="operator-empty">No automatic project checks are registered.</div>';
    return;
  }

  target.innerHTML = workers.map(worker => {
    const state = worker.runtime || {};
    const action = primaryAction(worker);
    return `
      <article class="automation-row" data-worker-id="${esc(worker.id)}">
        <div class="automation-main">
          <div class="automation-title"><strong>${esc(worker.name || projectName(worker.id))}</strong><span class="operator-state">${esc(plainStatus(worker))}</span></div>
          <p>Last checked ${esc(relative(state.last_run_at))} · ${worker.enabled ? "next " + esc(relative(state.next_run_at)) : "automatic checks are off"}</p>
        </div>
        <button class="operator-button ${action.tone}" data-worker-action="${action.action}" type="button">${esc(action.label)}</button>
        <details class="automation-more">
          <summary>More</summary>
          <div class="automation-menu">
            ${worker.enabled && action.action !== "toggle" ? '<button type="button" data-worker-action="toggle">Pause automatic checks</button>' : ""}
            <div>Runner changes code only through its guarded branch and review flow.</div>
          </div>
        </details>
      </article>
    `;
  }).join("");

  target.querySelectorAll("[data-worker-id]").forEach(row => {
    const worker = workers.find(item => item.id === row.dataset.workerId);
    row.querySelectorAll("[data-worker-action]").forEach(button => {
      button.addEventListener("click", () => performAction(worker, button.dataset.workerAction, button, ui));
    });
  });
}

async function loadProjectWork(ui) {
  const target = document.querySelector("#today-work");
  target.innerHTML = '<div class="operator-loading">Checking project work…</div>';

  try {
    if (!projectIds.length) projectIds = await loadProjectIndex();
    const results = await Promise.allSettled(projectIds.map(async id => {
      if (!projectCache.has(id)) projectCache.set(id, await loadProjectDetail(id));
      return { id, ...projectCache.get(id) };
    }));

    const items = [];
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const claims = Array.isArray(result.value.coordination?.claims) ? result.value.coordination.claims : [];
      for (const claim of claims) {
        if (["active", "held", "claimed"].includes(claim.state)) items.push({ projectId: result.value.id, item: claim });
      }
    }

    const priority = { held: 0, claimed: 1, active: 2 };
    items.sort((a, b) => (priority[a.item.state] ?? 3) - (priority[b.item.state] ?? 3));

    target.innerHTML = items.length ? items.slice(0, 6).map(({ projectId, item }) => `
      <button class="today-task" type="button" data-open-project="${esc(projectId)}">
        <span class="today-task-project">${esc(projectName(projectId))}</span>
        <span class="today-task-title">${esc(item.goal || item.id || "Work item")}</span>
        <span class="today-task-state">${esc(stateLabel(item.state))}</span>
      </button>
    `).join("") : '<div class="operator-empty">No project work is waiting on you.</div>';

    target.querySelectorAll("[data-open-project]").forEach(button => {
      button.addEventListener("click", () => ui.openProject(button.dataset.openProject));
    });
  } catch {
    target.innerHTML = '<div class="operator-empty">Project work could not be loaded right now.</div>';
  }
}

export async function loadToday(ui) {
  ui.setConnection("Checking…");
  try {
    workers = await api("/api/workers");
    renderAttention(ui);
    renderAutomations(ui);
    loadProjectWork(ui);
    ui.setConnection("Connected", "good");
  } catch (error) {
    ui.setConnection(error.status === 403 ? "Access needed" : "Couldn’t connect", "bad");
    document.querySelector("#today-attention").innerHTML = '<div class="operator-empty">Runner could not load project status.</div>';
    document.querySelector("#today-automations").innerHTML = "";
  }
}
