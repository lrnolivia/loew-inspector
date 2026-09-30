import { iconSlot, hydrateProjectIcons } from "./project-icons.js";

const names = {
  relay: "relay",
  "bazzite-custom": "loewOS",
  field: "field",
  gamebridge: "GameBridge",
  "loew-inspector": "inspector",
  "loew-runner": "runner",
  "loew-shell": "loew shell",
  loewfi: "loew.fi",
  loewtorials: "loewtorials",
  "rtxforge-mfg": "rtxForge MFG",
  rtxforge: "rtxForge",
  thetake: "The Take"
};

export function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

export function projectName(id) {
  return names[id] || String(id || "project").replace(/[-_]+/g, " ");
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Could not load project information.");
  return response.json();
}

export async function loadProjectIndex() {
  const { projects } = await fetchJson("/api/projects");
  return projects.map(project => project.id).sort((a, b) => projectName(a).localeCompare(projectName(b)));
}

export async function loadProjectDetail(id) {
  return fetchJson("/api/projects/" + encodeURIComponent(id));
}

export function stateLabel(state) {
  if (state === "active") return "In progress";
  if (state === "held") return "Waiting";
  if (state === "claimed") return "Ready";
  if (state === "queued") return "Up next";
  if (state === "completed") return "Done";
  return "Recorded";
}

function taskRow(item) {
  const title = item.goal || item.id || "Work item";
  const next = item.next_action || "";
  const technical = next || item.branch || item.pr;
  return `
    <article class="task-row">
      <div class="task-state task-state-${esc(item.state || "unknown")}">${esc(stateLabel(item.state))}</div>
      <div class="task-copy">
        <strong>${esc(title)}</strong>
        ${technical ? `
          <details class="task-details">
            <summary>Technical details</summary>
            <div>${next ? esc(next) : ""}${item.branch ? (next ? "<br><br>" : "") + "Branch · " + esc(item.branch) : ""}${item.pr ? ((next || item.branch) ? "<br>" : "") + "PR #" + esc(item.pr) : ""}</div>
          </details>
        ` : ""}
      </div>
    </article>
  `;
}

function empty(message) {
  return '<div class="operator-empty">' + esc(message) + "</div>";
}

export function renderProjectDetail(target, id, data) {
  const project = data.project || {};
  const coordination = data.coordination || {};
  const claims = Array.isArray(coordination.claims) ? coordination.claims : [];
  const queue = Array.isArray(coordination.queue) ? coordination.queue : [];
  const current = claims.filter(item => ["active", "held", "claimed"].includes(item.state));
  const queued = queue.filter(item => item.state !== "completed");
  const recent = claims
    .filter(item => item.state === "completed")
    .sort((a, b) => Date.parse(b.completed_at || b.updated_at || 0) - Date.parse(a.completed_at || a.updated_at || 0))
    .slice(0, 3);

  target.innerHTML = `
    <div class="project-detail-head">
      <div>
        <h2 class="project-name">${iconSlot(id)}${esc(project.name || projectName(id))}</h2>
        <p>${current.length ? current.length + " thing" + (current.length === 1 ? "" : "s") + " happening now" : "Nothing active right now"}${queued.length ? " · " + queued.length + " up next" : ""}</p>
      </div>
      <span class="project-health ${project.managed ? "good" : "quiet"}">${project.managed ? "Managed by Relay" : "Tracked"}</span>
    </div>

    <section class="project-work-section">
      <h3>Now</h3>
      ${current.length ? current.map(taskRow).join("") : empty("Nothing needs attention here right now.")}
    </section>

    <section class="project-work-section">
      <h3>Up next</h3>
      ${queued.length ? queued.map(taskRow).join("") : empty("No queued work.")}
    </section>

    ${recent.length ? `
      <details class="project-history">
        <summary>Recently finished</summary>
        <div class="project-history-list">${recent.map(taskRow).join("")}</div>
      </details>
    ` : ""}
  `;
  hydrateProjectIcons(target);
}
