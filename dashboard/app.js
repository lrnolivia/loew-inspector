const workersEl = document.querySelector("#workers");
const summaryEl = document.querySelector("#summary");
const refreshButton = document.querySelector("#refresh");

function relative(value) {
  if (!value) return "—";
  const delta = Date.parse(value) - Date.now();
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
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
}

async function load() {
  const workers = await api("/api/workers");
  const active = workers.filter((w) => w.enabled).length;
  const running = workers.filter((w) => w.runtime.status === "running").length;
  const blocked = workers.filter((w) => w.runtime.status === "blocked").length;
  const healthy = workers.filter((w) => w.runtime.dependency_health === "healthy").length;

  summaryEl.innerHTML = [
    ["workers", workers.length],
    ["enabled", active],
    ["running", running],
    ["deps healthy", healthy]
  ].map(([label, value]) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`).join("");

  workersEl.innerHTML = workers.map((worker) => {
    const state = worker.runtime;
    const healthClass = state.dependency_health === "healthy"
      ? "health-good"
      : state.dependency_health === "repairable"
        ? "health-warn"
        : state.dependency_health === "failed"
          ? "health-bad"
          : "health-unknown";
    const projectClass = state.project_health === "healthy"
      ? "health-good"
      : state.project_health === "failed" || state.project_health === "blocked"
        ? "health-bad"
        : "health-unknown";
    const dependency = state.dependency ?? {};
    const repairable = state.dependency_health === "repairable" && dependency.repair_verified === true;
    const repairLabel = repairable && state.project_health !== "healthy" ? "Repair draft" : "Repair";
    const workflowLink = dependency.workflow_url
      ? `<a href="${escapeHtml(dependency.workflow_url)}" target="_blank" rel="noreferrer">view doctor run ↗</a>`
      : "";

    return `
      <article class="card" data-id="${escapeHtml(worker.id)}">
        <div class="card-head">
          <div class="identity">
            <div class="name-line">
              <span class="dot ${escapeHtml(state.status)}"></span>
              <span class="name">${escapeHtml(worker.name)}</span>
            </div>
            <div class="repo">${escapeHtml(worker.target.repository)} · every ${worker.cadence_minutes}m · ${escapeHtml(worker.model.id)} · cap ${escapeHtml(worker.limits?.max_runs_per_day ?? "—")}/day</div>
          </div>
          <div class="actions">
            <button class="button doctor">Doctor</button>
            <button class="button repair" ${repairable ? "" : "disabled"}>${repairLabel}</button>
            <button class="button toggle">${worker.enabled ? "Pause" : "Enable"}</button>
            <button class="button primary run" ${worker.enabled ? "" : "disabled"}>Run now</button>
          </div>
        </div>
        <div class="details">
          <div class="cell">
            <div class="label">status</div>
            <div class="value">${escapeHtml(state.status)}</div>
            <div class="label" style="margin-top:10px">dependencies</div>
            <div class="value ${healthClass}">${escapeHtml(state.dependency_health ?? "unknown")}</div>
            <div class="label" style="margin-top:10px">verification</div>
            <div class="value ${projectClass}">${escapeHtml(state.project_health ?? "unknown")}</div>
          </div>
          <div class="cell">
            <div class="label">daily budget</div>
            <div class="value">${escapeHtml(state.budget?.runs ?? 0)} runs · ${Number(state.budget?.tokens ?? 0).toLocaleString()} tokens</div>
            <div class="label" style="margin-top:10px">last run</div>
            <div class="value">${escapeHtml(relative(state.last_run_at))}</div>
            <div class="label" style="margin-top:10px">next run</div>
            <div class="value">${worker.enabled ? escapeHtml(relative(state.next_run_at)) : "paused"}</div>
          </div>
          <div class="cell">
            <div class="label">dependency diagnosis</div>
            <div class="value summary-text">${escapeHtml(dependency.reason ?? "Not checked yet.")}</div>
            <div class="meta-link">${workflowLink}</div>
            <div class="label" style="margin-top:10px">latest</div>
            <div class="value summary-text">${escapeHtml(state.last_summary ?? "No run yet.")}</div>
          </div>
        </div>
      </article>
    `;
  }).join("");

  document.querySelectorAll(".card").forEach((card) => {
    const id = card.dataset.id;
    const worker = workers.find((item) => item.id === id);

    card.querySelector(".toggle").addEventListener("click", async () => {
      await api(`/api/workers/${id}/toggle`, {
        method: "POST",
        body: JSON.stringify({ enabled: !worker.enabled })
      });
      await load();
    });

    card.querySelector(".run").addEventListener("click", async () => {
      const button = card.querySelector(".run");
      button.disabled = true;
      button.textContent = "Starting…";
      try {
        await api(`/api/workers/${id}/run`, { method: "POST", body: "{}" });
      } catch (error) {
        alert(error.message);
      }
      await load();
    });

    card.querySelector(".doctor").addEventListener("click", async () => {
      const button = card.querySelector(".doctor");
      button.disabled = true;
      button.textContent = "Queued…";
      try {
        await api(`/api/workers/${id}/doctor`, { method: "POST", body: "{}" });
      } catch (error) {
        alert(error.message);
      }
      await load();
    });

    card.querySelector(".repair").addEventListener("click", async () => {
      const button = card.querySelector(".repair");
      button.disabled = true;
      button.textContent = "Queued…";
      try {
        await api(`/api/workers/${id}/repair`, { method: "POST", body: "{}" });
      } catch (error) {
        alert(error.message);
      }
      await load();
    });
  });
}

refreshButton.addEventListener("click", load);
load().catch((error) => {
  workersEl.textContent = error.message;
});
