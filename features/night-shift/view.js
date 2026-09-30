import { esc, projectName } from "../../apps/web/public/operator-projects.js";

export async function loadNightShift(ui) {
  const target = document.querySelector("#night-shift-work");
  target.innerHTML = '<div class="operator-loading">Opening automatic work…</div>';
  try {
    const response = await fetch("/api/workers");
    if (!response.ok) throw new Error("Automatic work could not be loaded.");
    const workers = await response.json();
    target.innerHTML = workers.length ? workers.map(worker => {
      const state = worker.runtime || {};
      const blocked = Boolean(state.last_error);
      const error = /insufficient_quota|credit_balance_exhausted|no credits remaining/i.test(state.last_error || "")
        ? "Automatic model work is paused because its API credits are exhausted. Project state and manual controls remain available."
        : state.last_error;
      return `<article class="task-row"><div class="task-state">${blocked ? "Needs attention" : worker.enabled ? "Watching" : "Paused"}</div>
        <div class="task-copy"><strong>${esc(projectName(worker.id))}</strong>
        <p>${esc(state.last_summary || "No run result recorded yet.")}</p>
        <small>${esc(state.last_run_at ? "Last run · " + new Date(state.last_run_at).toLocaleString() : "No run recorded")}</small>
        ${state.last_error ? `<p>${esc(error)}</p>` : ""}
        <p><a href="#projects?project=${encodeURIComponent(worker.id)}">Open project</a> · <a href="#today">Manage automatic checks</a></p></div></article>`;
    }).join("") : '<div class="operator-empty">No automatic work is configured.</div>';
    ui.setConnection("Connected", "good");
  } catch (error) {
    target.innerHTML = '<div class="operator-empty">' + esc(error.message) + '</div>';
    ui.setConnection("Couldn’t connect", "bad");
  }
}
