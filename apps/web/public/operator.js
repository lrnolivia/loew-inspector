import { openQa } from "./qa.js";
import { loadNightShift } from "../../../features/night-shift/view.js";

import { loadToday } from "./operator-today.js";
import { bindReviewFilters, loadReview } from "./operator-review.js";
import { esc, loadProjectDetail, loadProjectIndex, projectName, renderProjectDetail } from "./operator-projects.js";

const pages = [...document.querySelectorAll("[data-page]")];
const nav = [...document.querySelectorAll("[data-nav]")];
const connection = document.querySelector("#operator-connection");
const toast = document.querySelector("#operator-toast");
const projectList = document.querySelector("#project-list");
const projectDetail = document.querySelector("#project-detail");

let toastTimer = null;
let projectIds = [];
let selectedProject = null;
const projectCache = new Map();

function route() {
  const page = (location.hash || "#today").slice(1).split("?")[0];
  return ["today", "projects", "review", "night-shift"].includes(page) ? page : "today";
}

function setConnection(label, tone = "quiet") {
  if (!connection) return;
  connection.textContent = label;
  connection.dataset.tone = tone;
}

function notify(message, tone = "good") {
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
}

async function selectProject(id) {
  selectedProject = id;
  projectList.querySelectorAll("[data-project-id]").forEach(button => {
    button.classList.toggle("active", button.dataset.projectId === id);
  });
  projectDetail.innerHTML = '<div class="operator-loading">Opening ' + esc(projectName(id)) + "…</div>";

  try {
    if (!projectCache.has(id)) projectCache.set(id, await loadProjectDetail(id));
    renderProjectDetail(projectDetail, id, projectCache.get(id));
  } catch {
    projectDetail.innerHTML = '<div class="operator-empty">Relay could not load this project right now.</div>';
  }
}

async function loadProjects() {
  const linked = new URLSearchParams(location.hash.split("?")[1] || "").get("project");
  if (linked) selectedProject = linked;
  projectCache.clear();
  if (!projectIds.length) projectIds = await loadProjectIndex();
  if (!selectedProject || !projectIds.includes(selectedProject)) selectedProject = projectIds[0] || null;

  projectList.innerHTML = projectIds.length ? projectIds.map(id => `
    <button class="project-list-item ${id === selectedProject ? "active" : ""}" type="button" data-project-id="${esc(id)}">
      <strong>${esc(projectName(id))}</strong>
      <span>Open</span>
    </button>
  `).join("") : '<div class="operator-empty">No projects are registered.</div>';

  projectList.querySelectorAll("[data-project-id]").forEach(button => {
    button.addEventListener("click", () => selectProject(button.dataset.projectId));
  });

  if (selectedProject) await selectProject(selectedProject);
}

function openProject(id) {
  selectedProject = id;
  if (location.hash === "#projects") loadProjects();
  else location.hash = "projects?project=" + encodeURIComponent(id);
}

const ui = { setConnection, notify, openProject };

async function showPage(name) {
  pages.forEach(page => { page.hidden = page.dataset.page !== name; });
  nav.forEach(button => {
    const active = button.dataset.nav === name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });

  document.body.dataset.page = name;
  if (name === "today") await loadToday(ui);
  if (name === "projects") {
    setConnection("Connected", "good");
    await loadProjects();
  }
  if (name === "review") {
    await loadReview(ui);
    const evidence = new URLSearchParams(location.hash.split("?")[1] || "").get("evidence");
    if (evidence && /^vis_[a-zA-Z0-9-]{8,128}$/.test(evidence)) await openQa(evidence);
  }
  if (name === "night-shift") await loadNightShift(ui);
}

nav.forEach(button => {
  button.addEventListener("click", () => {
    const next = button.dataset.nav;
    if (location.hash === "#" + next) showPage(next);
    else location.hash = next;
  });
});

window.addEventListener("hashchange", () => showPage(route()));
bindReviewFilters();
showPage(route()).catch(error => { setConnection("Couldn’t connect", "bad"); notify(error.message, "bad"); });
