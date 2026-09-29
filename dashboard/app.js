const workersEl = document.querySelector("#workers");
const workerNavEl = document.querySelector("#worker-nav");
const summaryEl = document.querySelector("#summary");
const refreshButton = document.querySelector("#refresh");
const connectionEl = document.querySelector("#connection");
const tabs = [...document.querySelectorAll(".app-tab")];
const primaryNav = [...document.querySelectorAll(".primary-nav-item")];
const workersSection = document.querySelector("#workers-section");
const visualSection = document.querySelector("#visual-section");
const visualContent = document.querySelector("#visual-content");
const visualCount = document.querySelector("#visual-count");
const toolbarContext = document.querySelector("#toolbar-context");
const visualProjectFilter = document.querySelector("#visual-project-filter");
const visualEnvironmentFilter = document.querySelector("#visual-environment-filter");
const visualPrFilter = document.querySelector("#visual-pr-filter");
const visualClearFilters = document.querySelector("#visual-clear-filters");

let selectedWorkerId = null;
let currentWorkers = [];
let currentSection = "workers";
let visualEvidence = [];
let selectedEvidenceId = null;
let baselineEvidenceId = null;
let comparisonState = null;

document.body.dataset.view = "overview";
document.body.dataset.section = "workers";

function relative(value) {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "—";
  const delta = parsed - Date.now();
  const abs = Math.abs(delta);
  const unit = abs < 3_600_000 ? "minute" : abs < 86_400_000 ? "hour" : "day";
  const divisor = unit === "minute" ? 60_000 : unit === "hour" ? 3_600_000 : 86_400_000;
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(delta / divisor), unit);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

async function api(url, options) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...options
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { error: text || `Unexpected ${response.status} response.` }; }
  if (!response.ok) throw Object.assign(new Error(body.error ?? "Request failed"), { status: response.status });
  return body;
}


function hostname(value) {
  try { return new URL(value).hostname; }
  catch { return "unknown"; }
}

function absoluteTime(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit"
  }).format(parsed);
}

function evidenceTitle(item) {
  const host = hostname(item.target_url);
  if (host === "runner.loew.fi") return "runner";
  if (host.endsWith(".loew.fi")) return host.slice(0, -".loew.fi".length);
  return host;
}

async function loadComparison() {
  comparisonState = null;
  if (!baselineEvidenceId || baselineEvidenceId === selectedEvidenceId) {
    renderVisualSelected();
    return;
  }
  try {
    comparisonState = await api("/api/visual/compare?base=" + encodeURIComponent(baselineEvidenceId) + "&current=" + encodeURIComponent(selectedEvidenceId));
  } catch (error) {
    comparisonState = { error: error.message };
  }
  renderVisualSelected();
}

function renderVisualSelected() {
  if (!visualEvidence.length) {
    visualContent.innerHTML = '<div class="visual-empty"><span class="visual-empty-mark">◌</span><strong>No visual evidence yet</strong><span>Ask inspector to capture a loew.fi surface.</span></div>';
    visualCount.textContent = "0 captures";
    return;
  }

  if (!selectedEvidenceId || !visualEvidence.some(item => item.evidence_id === selectedEvidenceId)) {
    selectedEvidenceId = visualEvidence[0].evidence_id;
  }
  const selected = visualEvidence.find(item => item.evidence_id === selectedEvidenceId);
  visualCount.textContent = visualEvidence.length + (visualEvidence.length === 1 ? " capture" : " captures");

  const trace = Array.isArray(selected.trace) ? selected.trace : [];
  const context = selected.context || {};
  const comparison = comparisonState?.comparison;
  const facts = [
    ["evidence", selected.evidence_id],
    ["kind", selected.kind || "screenshot"],
    ["request", selected.request_id || "—"],
    ["project", context.project || "—"],
    ["environment", context.environment || "unknown"],
    ["commit", context.commit_sha ? String(context.commit_sha).slice(0, 12) : "—"],
    ["PR", context.pr_number || "—"],
    ["deployment", context.deployment_id || "—"],
    ["browser", selected.browser_ms ? Math.round(selected.browser_ms) + " ms" : "session"],
    ["expires", selected.expires_at ? absoluteTime(selected.expires_at) : "—"],
    ["bytes", Number(selected.screenshot_bytes || 0).toLocaleString()],
    ["status", selected.http_status || "rendered"]
  ];

  visualContent.innerHTML = `
    <div class="visual-main">
      ${baselineEvidenceId && baselineEvidenceId !== selectedEvidenceId ? `
        <div class="compare-summary compare-summary-${comparisonState?.error ? "failed" : comparison?.result || "checking"}">
          <span>${escapeHtml(comparisonState?.error ? "failed" : comparison?.result || "checking")}</span>
          <span>${escapeHtml(comparisonState?.error || (
            comparison
              ? (comparison.same_viewport ? "same viewport" : "viewport changed") +
                (comparison.dom.comparable ? " · DOM " + (comparison.dom.changed ? "changed" : "stable") : "") +
                (comparison.accessibility.comparable ? " · a11y " + (comparison.accessibility.changed ? "changed" : "stable") : "")
              : "comparing evidence"
          ))}</span>
        </div>
        <div class="compare-grid">
          <figure class="visual-evidence-frame">
            <img src="${escapeHtml(visualEvidence.find(item => item.evidence_id === baselineEvidenceId)?.screenshot_url || "")}" alt="Baseline visual evidence">
            <figcaption class="visual-caption"><div><div class="visual-caption-title">baseline</div></div></figcaption>
          </figure>
          <figure class="visual-evidence-frame">
            <img src="${escapeHtml(selected.screenshot_url)}" alt="Current visual evidence">
            <figcaption class="visual-caption"><div><div class="visual-caption-title">current</div></div></figcaption>
          </figure>
        </div>
      ` : `
      <figure class="visual-evidence-frame">
        <img src="${escapeHtml(selected.screenshot_url)}" alt="Browser evidence captured from ${escapeHtml(selected.target_url)}">
        <figcaption class="visual-caption">
          <div>
            <div class="visual-caption-title">${escapeHtml(evidenceTitle(selected))}</div>
            <div class="visual-caption-url">${escapeHtml(selected.target_url)}</div>
          </div>
          <div class="visual-caption-time">${escapeHtml(absoluteTime(selected.captured_at))}</div>
        </figcaption>
      </figure>
      `}

      <div class="visual-meta-grid">
        <div class="visual-meta"><div class="visual-meta-label">project</div><div class="visual-meta-value">${escapeHtml(context.project || evidenceTitle(selected))}</div></div>
        <div class="visual-meta"><div class="visual-meta-label">environment</div><div class="visual-meta-value">${escapeHtml(context.environment || "unknown")}</div></div>
        <div class="visual-meta"><div class="visual-meta-label">viewport</div><div class="visual-meta-value">${escapeHtml(selected.viewport?.width || "—")} × ${escapeHtml(selected.viewport?.height || "—")}</div></div>
        <div class="visual-meta"><div class="visual-meta-label">revision</div><div class="visual-meta-value">${escapeHtml(context.commit_sha ? String(context.commit_sha).slice(0, 12) : context.pr_number ? "PR #" + context.pr_number : "—")}</div></div>
      </div>

      <div class="visual-technical">
        <section class="technical-section">
          <h3>trace</h3>
          ${trace.length
            ? '<ol class="trace-list">' + trace.map(entry => '<li><span>' + escapeHtml(entry.action || "event") + (entry.locator?.value ? " · " + escapeHtml(entry.locator.value) : "") + '</span></li>').join("") + '</ol>'
            : '<div class="state-copy">Single-shot capture · no interaction trace.</div>'}
        </section>
        <section class="technical-section">
          <h3>evidence</h3>
          <dl class="evidence-facts">
            ${facts.map(([label,value]) => '<div class="evidence-fact"><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value) + '</dd></div>').join("")}
          </dl>
        </section>
      </div>
    </div>

    <aside class="visual-side" aria-label="Recent visual evidence">
      <div class="visual-side-heading"><strong>recent</strong><span>newest first</span></div>
      <label class="baseline-control">
        <span>baseline</span>
        <select id="visual-baseline-select">
          <option value="">none</option>
          ${visualEvidence.filter(item => item.evidence_id !== selectedEvidenceId).map(item => `
            <option value="${escapeHtml(item.evidence_id)}" ${item.evidence_id === baselineEvidenceId ? "selected" : ""}>${escapeHtml(evidenceTitle(item))} · ${escapeHtml(relative(item.captured_at))}</option>
          `).join("")}
        </select>
      </label>
      <div class="evidence-list">
        ${visualEvidence.map(item => `
          <button class="evidence-list-item ${item.evidence_id === selectedEvidenceId ? "active" : ""}" data-evidence-id="${escapeHtml(item.evidence_id)}" type="button">
            <img class="evidence-thumb" src="${escapeHtml(item.screenshot_url)}" alt="">
            <span class="evidence-list-copy">
              <span class="evidence-list-title">${escapeHtml(evidenceTitle(item))}</span>
              <span class="evidence-list-meta">${escapeHtml(item.kind || "screenshot")} · ${escapeHtml(item.viewport?.width || "—")}×${escapeHtml(item.viewport?.height || "—")}</span>
            </span>
            <span class="evidence-list-time">${escapeHtml(relative(item.captured_at))}</span>
          </button>
        `).join("")}
      </div>
    </aside>
  `;

  visualContent.querySelectorAll("[data-evidence-id]").forEach(button => {
    button.addEventListener("click", () => {
      selectedEvidenceId = button.dataset.evidenceId;
      comparisonState = null;
      renderVisualSelected();
      if (baselineEvidenceId && baselineEvidenceId !== selectedEvidenceId) loadComparison();
    });
  });
  visualContent.querySelector("#visual-baseline-select")?.addEventListener("change", event => {
    baselineEvidenceId = event.currentTarget.value || null;
    comparisonState = null;
    if (baselineEvidenceId) loadComparison();
    else renderVisualSelected();
  });
}

async function loadVisual() {
  visualContent.innerHTML = '<div class="visual-empty"><span class="visual-empty-mark">◌</span><strong>Loading evidence</strong><span>Asking inspector what it saw.</span></div>';
  try {
    const params = new URLSearchParams();
    if (visualProjectFilter?.value.trim()) params.set("project", visualProjectFilter.value.trim());
    if (visualEnvironmentFilter?.value) params.set("environment", visualEnvironmentFilter.value);
    if (visualPrFilter?.value) params.set("pr", visualPrFilter.value);
    const payload = await api("/api/visual" + (params.size ? "?" + params.toString() : ""));
    visualEvidence = Array.isArray(payload.evidence) ? payload.evidence : [];
    renderVisualSelected();
    setConnection("good", "CONNECTED");
  } catch (error) {
    visualEvidence = [];
    visualCount.textContent = "";
    visualContent.innerHTML = '<div class="visual-empty"><span class="visual-empty-mark">×</span><strong>Evidence unavailable</strong><span>' + escapeHtml(error.message) + '</span></div>';
    setConnection("bad", error.status === 403 ? "ACCESS REQUIRED" : "VISUAL ERROR");
  }
}

function setSection(section) {
  currentSection = section === "visual" ? "visual" : "workers";
  document.body.dataset.section = currentSection;
  workersSection.hidden = currentSection !== "workers";
  visualSection.hidden = currentSection !== "visual";
  primaryNav.forEach(item => item.classList.toggle("active", item.dataset.section === currentSection));
  toolbarContext.textContent = currentSection === "visual"
    ? "INSPECTOR · BROWSER EVIDENCE"
    : "CONFIG · RECOVERY · DIAGNOSTICS";
  if (currentSection === "visual") loadVisual();
  else load();
}

function statusTone(value) {
  if (["healthy", "idle", "complete", "saved"].includes(value)) return "good";
  if (["repairable", "warning", "running", "waiting_credentials"].includes(value)) return "warn";
  if (["failed", "blocked", "error"].includes(value)) return "bad";
  return "neutral";
}

function statusPill(label, value) {
  const normalized = String(value ?? "unknown").toLowerCase();
  return `<span class="status-pill status-${statusTone(normalized)}"><span class="status-dot"></span><span>${escapeHtml(label)} · ${escapeHtml(normalized)}</span></span>`;
}

function setConnection(kind, label) {
  connectionEl.className = `status-pill status-${kind}`;
  connectionEl.innerHTML = `<span class="status-dot"></span><span>${escapeHtml(label)}</span>`;
}

function renderNav(workers) {
  if (!workers.length) {
    workerNavEl.innerHTML = '<div class="sidebar-note">No workers registered.</div>';
    return;
  }
  if (!selectedWorkerId || !workers.some((worker) => worker.id === selectedWorkerId)) {
    selectedWorkerId = workers[0].id;
  }
  workerNavEl.innerHTML = workers.map((worker) => {
    const active = worker.id === selectedWorkerId;
    return `<button class="sidebar-item ${active ? "active" : ""}" type="button" data-worker-id="${escapeHtml(worker.id)}"><span class="nav-dot"></span><span>${escapeHtml(worker.name)}</span></button>`;
  }).join("");

  workerNavEl.querySelectorAll(".sidebar-item").forEach((button) => {
    button.addEventListener("click", () => {
      selectedWorkerId = button.dataset.workerId;
      renderNav(currentWorkers);
      renderWorkers(currentWorkers);
    });
  });
}

function renderSummary(workers) {
  const active = workers.filter((worker) => worker.enabled).length;
  const running = workers.filter((worker) => worker.runtime.status === "running").length;
  const repairable = workers.filter((worker) => worker.runtime.dependency_health === "repairable").length;
  const blocked = workers.filter((worker) => ["blocked", "failed", "waiting_credentials"].includes(worker.runtime.status)).length;
  summaryEl.innerHTML = [
    ["workers", workers.length],
    ["enabled", active],
    ["running", running],
    [repairable ? "repairable" : "blocked", repairable || blocked]
  ].map(([label, value]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`).join("");
}

function renderWorkers(workers) {
  const visible = workers.filter((worker) => worker.id === selectedWorkerId);
  if (!visible.length) {
    workersEl.innerHTML = '<div class="empty-state"><div class="state-title">No worker selected</div><div class="state-copy">Choose a worker from the navigation rail.</div></div>';
    return;
  }

  workersEl.innerHTML = visible.map((worker) => {
    const state = worker.runtime ?? {};
    const dependency = state.dependency ?? {};
    const repairable = state.dependency_health === "repairable" && dependency.repair_verified === true;
    const repairLabel = repairable && state.project_health !== "healthy" ? "Repair draft" : "Repair";
    const workflowLink = dependency.workflow_url
      ? `<a href="${escapeHtml(dependency.workflow_url)}" target="_blank" rel="noreferrer">View doctor run ↗</a>`
      : "No doctor run recorded.";

    return `
      <article class="worker-panel" data-id="${escapeHtml(worker.id)}">
        <div class="worker-toolbar">
          <div class="worker-title">
            <div class="worker-name">${escapeHtml(worker.name)}</div>
            <div class="worker-meta">${escapeHtml(worker.target.repository)} · every ${escapeHtml(worker.cadence_minutes)}m · ${escapeHtml(worker.model.id)} · cap ${escapeHtml(worker.limits?.max_runs_per_day ?? "—")}/day</div>
          </div>
          <div class="actions">
            <button class="tp-button secondary doctor" type="button">Doctor</button>
            <button class="tp-button secondary repair" type="button" ${repairable ? "" : "disabled"}>${repairLabel}</button>
            <button class="tp-button secondary toggle" type="button">${worker.enabled ? "Pause" : "Enable"}</button>
            <button class="tp-button primary run" type="button" ${worker.enabled ? "" : "disabled"}>Run now</button>
          </div>
        </div>

        <div class="status-strip">
          ${statusPill("worker", state.status)}
          ${statusPill("dependencies", state.dependency_health)}
          ${statusPill("project", state.project_health)}
        </div>

        <div class="data-header overview-only">
          <div>Target</div><div>Budget</div><div>Last run</div><div>Next run</div>
        </div>
        <div class="data-row overview-only">
          <div><strong>${escapeHtml(worker.target.repository)}</strong><div class="muted">${escapeHtml(worker.target.write_mode)}</div></div>
          <div>${escapeHtml(state.budget?.runs ?? 0)} runs<div class="muted">${Number(state.budget?.tokens ?? 0).toLocaleString()} tokens</div></div>
          <div>${escapeHtml(relative(state.last_run_at))}<div class="muted">${escapeHtml(state.run_count ?? 0)} total</div></div>
          <div>${worker.enabled ? escapeHtml(relative(state.next_run_at)) : "paused"}<div class="muted">${worker.enabled ? "scheduled" : "disabled"}</div></div>
        </div>

        <details class="settings-card overview-only">
          <summary>
            <span><strong>Runtime settings</strong><small>Maintenance only · secrets are never exposed here</small></span>
            <span class="settings-disclosure">Edit</span>
          </summary>
          <form data-settings-form>
            <div class="settings-grid">
              <label class="settings-field"><span>Cadence</span><input name="cadence_minutes" type="number" min="60" max="1440" step="1" value="${escapeHtml(worker.cadence_minutes)}"><small>minutes · scheduler still wakes hourly</small></label>
              <label class="settings-field"><span>Model</span><input name="model_id" type="text" value="${escapeHtml(worker.model.id)}" autocomplete="off"></label>
              <label class="settings-field"><span>Reasoning</span><select name="reasoning_effort">${["low","medium","high"].map((value) => `<option value="${value}" ${worker.model.reasoning_effort === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
              <label class="settings-field"><span>Runs / day</span><input name="max_runs_per_day" type="number" min="1" max="24" step="1" value="${escapeHtml(worker.limits?.max_runs_per_day ?? 12)}"></label>
              <label class="settings-field"><span>Token ceiling / day</span><input name="max_tokens_per_day" type="number" min="10000" max="2000000" step="10000" value="${escapeHtml(worker.limits?.max_tokens_per_day ?? 250000)}"></label>
              <label class="settings-check"><input name="web_search" type="checkbox" ${worker.model.web_search ? "checked" : ""}><span>Allow OpenAI web search for this runner</span></label>
            </div>
            <div class="settings-actions">
              <span class="muted">Credentials, repository targets, and write authority are intentionally not editable here.</span>
              <button class="tp-button secondary save-settings" type="submit">Save settings</button>
            </div>
          </form>
        </details>

        <div class="diagnosis diagnostics-only">
          <div class="diagnosis-block">
            <div class="diagnosis-title">Dependency diagnosis</div>
            <div class="diagnosis-value">${escapeHtml(dependency.reason ?? "Not checked yet.")}</div>
            <div class="diagnosis-value">${workflowLink}</div>
          </div>
          <div class="diagnosis-block">
            <div class="diagnosis-title">Latest runner state</div>
            <div class="diagnosis-value">${escapeHtml(state.last_summary ?? "No agent run yet.")}</div>
          </div>
          <div class="diagnosis-block">
            <div class="diagnosis-title">Next focus</div>
            <div class="diagnosis-value">${escapeHtml(state.next_focus ?? "No next focus recorded.")}</div>
          </div>
          <div class="diagnosis-block">
            <div class="diagnosis-title">Verification</div>
            <div class="diagnosis-value">install ${escapeHtml(dependency.checks?.repaired_clean_install ?? dependency.checks?.initial_install ?? "—")} · build ${escapeHtml(dependency.checks?.build ?? "—")} · tests ${escapeHtml(dependency.checks?.tests ?? "—")} · lint ${escapeHtml(dependency.checks?.lint ?? "—")}</div>
          </div>
        </div>
      </article>
    `;
  }).join("");

  document.querySelectorAll(".worker-panel").forEach((panel) => {
    const id = panel.dataset.id;
    const worker = workers.find((item) => item.id === id);

    panel.querySelector(".toggle").addEventListener("click", async () => {
      await runAction(panel.querySelector(".toggle"), worker.enabled ? "Pausing…" : "Enabling…", async () => {
        await api(`/api/workers/${id}/toggle`, {
          method: "POST",
          body: JSON.stringify({ enabled: !worker.enabled })
        });
      });
    });

    panel.querySelector(".run").addEventListener("click", async () => {
      await runAction(panel.querySelector(".run"), "Starting…", () => api(`/api/workers/${id}/run`, { method: "POST", body: "{}" }));
    });

    panel.querySelector(".doctor").addEventListener("click", async () => {
      await runAction(panel.querySelector(".doctor"), "Queued…", () => api(`/api/workers/${id}/doctor`, { method: "POST", body: "{}" }));
    });

    panel.querySelector(".repair").addEventListener("click", async () => {
      await runAction(panel.querySelector(".repair"), "Queued…", () => api(`/api/workers/${id}/repair`, { method: "POST", body: "{}" }));
    });

    panel.querySelector("[data-settings-form]").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector(".save-settings");
      const original = button.textContent;
      const values = new FormData(form);
      button.disabled = true;
      button.textContent = "Saving…";
      try {
        await api(`/api/workers/${id}/settings`, {
          method: "POST",
          body: JSON.stringify({
            cadence_minutes: Number(values.get("cadence_minutes")),
            model_id: String(values.get("model_id") ?? "").trim(),
            reasoning_effort: String(values.get("reasoning_effort") ?? "medium"),
            max_runs_per_day: Number(values.get("max_runs_per_day")),
            max_tokens_per_day: Number(values.get("max_tokens_per_day")),
            web_search: form.elements.web_search.checked
          })
        });
        setConnection("good", "SAVED");
      } catch (error) {
        setConnection("bad", "SETTINGS ERROR");
        alert(error.message);
      } finally {
        button.textContent = original;
        await load();
      }
    });
  });
}

async function runAction(button, pendingLabel, action) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = pendingLabel;
  try {
    await action();
    setConnection("good", "QUEUED");
  } catch (error) {
    setConnection("bad", "ACTION ERROR");
    alert(error.message);
  } finally {
    button.textContent = original;
    await load();
  }
}

async function load() {
  refreshButton.disabled = true;
  try {
    const workers = await api("/api/workers");
    currentWorkers = workers;
    renderNav(workers);
    renderSummary(workers);
    renderWorkers(workers);
    setConnection("good", "CONNECTED");
  } catch (error) {
    currentWorkers = [];
    summaryEl.innerHTML = "";
    workerNavEl.innerHTML = "";
    workersEl.innerHTML = `<div class="error-state"><div class="state-title">Runner API unavailable</div><div class="state-copy">${escapeHtml(error.message)}</div><div class="state-copy">The static dashboard is deployed correctly; the control API is fail-closed until its Access and GitHub runtime credentials are valid.</div></div>`;
    setConnection("bad", error.status === 403 ? "ACCESS REQUIRED" : "API LOCKED");
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", () => currentSection === "visual" ? loadVisual() : load());
[visualProjectFilter, visualEnvironmentFilter, visualPrFilter].forEach(control => {
  control?.addEventListener("change", () => {
    selectedEvidenceId = null;
    loadVisual();
  });
});
visualProjectFilter?.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    selectedEvidenceId = null;
    loadVisual();
  }
});
visualClearFilters?.addEventListener("click", () => {
  visualProjectFilter.value = "";
  visualEnvironmentFilter.value = "";
  visualPrFilter.value = "";
  selectedEvidenceId = null;
  loadVisual();
});
primaryNav.forEach((item) => {
  item.addEventListener("click", () => setSection(item.dataset.section));
});
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((item) => item.classList.toggle("active", item === tab));
    document.body.dataset.view = tab.dataset.view;
  });
});

load();
