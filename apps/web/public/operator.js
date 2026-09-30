import { glyph } from "../../../packages/shared-ui/glyphs.js";
import { brand } from "./brand.js";
import { iconSlot, hydrateProjectIcons } from "./project-icons.js";
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
const projectContext = document.querySelector("#project-context");
const projectSearch = document.querySelector("#project-search");
const appSettings = document.querySelector("#app-settings");

let toastTimer = null;
let projectIds = [];
let selectedProject = null;
const projectCache = new Map();
const navigation = {
  today: ["Today", "Current focus", "today"],
  projects: ["Runner", "Projects & coordination", "projects"],
  review: ["Inspector", "Review & evidence", "review"],
  "night-shift": ["night shift", "Unattended activity", "moon"]
};
const overview = {
  today: ["relay", "What is actually moving now", "Observed work, decisions and automatic checks"],
  projects: ["runner", "Coordination & execution", "Observed from Runner, GitHub and Cloud"],
  review: ["inspector", "Review, evidence & QA", "Project-scoped visual evidence"],
  "night-shift": ["night shift", "Unattended activity", "Automatic work and its latest result"]
};

nav.forEach(button => {
  const [label, detail, icon] = navigation[button.dataset.nav];
  button.setAttribute("aria-label", label);
  const tool = button.dataset.nav === "projects" ? "runner" : button.dataset.nav === "review" ? "inspector" : null;
  button.innerHTML = '<span class="glyph-chip">' + (tool ? '<img class="tool-mark" src="' + brand[tool] + '" alt="">' : glyph(icon)) + '</span><span class="nav-copy"><strong>' + label + '</strong><small>' + detail + '</small></span><span class="nav-chevron">' + glyph("next") + '</span>';
});

pages.forEach(page => {
  const heading = page.querySelector(".page-heading");
  const key = page.dataset.page;
  const [kicker, title, detail] = overview[key];
  const system = key === "review" ? "inspector" : key === "projects" ? "runner" : null;
  const band = document.createElement("div");
  band.className = "page-overview";
  band.setAttribute("aria-label", "Current view");
  band.innerHTML = '<div class="page-overview-copy">' +
    (system ? '<span class="subsystem-context"><img src="' + brand[system] + '" alt=""><span>' + kicker + '</span></span>' : '<small>' + kicker + '</small>') +
    '<strong data-flow-label>' + title + '</strong></div><span class="page-overview-detail">' + detail + '</span>';
  heading.after(band);
});

function setFlow(phase, label) {
  const page = pages.find(item => !item.hidden);
  if (!page) return;
  const band = page.querySelector(".page-overview");
  if (!band) return;
  band.dataset.phase = phase;
  const target = band.querySelector("[data-flow-label]");
  if (target && label) target.textContent = label;
}
function setOverviewDetail(label) {
  const page = pages.find(item => !item.hidden);
  const detail = page?.querySelector(".page-overview-detail");
  if (detail && label) detail.textContent = label;
}

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

async function ensureProjects() {
  if (!projectIds.length) projectIds = await loadProjectIndex();
  if (projectContext && projectContext.options.length <= 1) {
    projectIds.forEach(id => projectContext.add(new Option(projectName(id), id)));
  }
  return projectIds;
}

function contextProject() {
  return projectContext?.value || "";
}

function syncContext(id) {
  if (!projectContext) return;
  projectContext.value = id && projectIds.includes(id) ? id : "";
}

function renderProjectList() {
  const query = (projectSearch?.value || "").trim().toLowerCase();
  const visible = projectIds.filter(id => !query || projectName(id).toLowerCase().includes(query) || id.toLowerCase().includes(query));
  projectList.innerHTML = visible.length ? visible.map(id => `
    <button class="project-list-item ${id === selectedProject ? "active" : ""}" type="button" data-project-id="${esc(id)}">
      ${iconSlot(id)}<strong>${esc(projectName(id))}</strong>
      <span class="nav-chevron">${glyph("next")}</span>
    </button>
  `).join("") : '<div class="operator-empty">No projects match that search.</div>';
  projectList.querySelectorAll("[data-project-id]").forEach(button => {
    button.addEventListener("click", () => selectProject(button.dataset.projectId));
  });
  hydrateProjectIcons(projectList);
}

async function selectProject(id, { sync = true } = {}) {
  selectedProject = id;
  if (sync) syncContext(id);
  renderProjectList();
  if (!id) {
    projectDetail.innerHTML = '<div class="operator-empty">Choose a project to inspect.</div>';
    return;
  }
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
  await ensureProjects();
  projectCache.clear();
  if (linked && projectIds.includes(linked)) selectedProject = linked;
  else if (contextProject() && projectIds.includes(contextProject())) selectedProject = contextProject();
  else if (!selectedProject || !projectIds.includes(selectedProject)) selectedProject = projectIds[0] || null;
  syncContext(selectedProject);
  renderProjectList();
  await selectProject(selectedProject, { sync: false });
}

function openProject(id) {
  selectedProject = id;
  syncContext(id);
  if (route() === "projects") loadProjects();
  else location.hash = "projects?project=" + encodeURIComponent(id);
}

async function openSettings() {
  const href = "https://chatgpt.com/settings/plugins-settings/plugin_asdk_app_6abcbc2be3c081919a9a9ce9c3d2d141";
  try {
    if (window.openai?.openExternal) await window.openai.openExternal({ href });
    else window.open(href, "_blank", "noopener,noreferrer");
  } catch {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}

const ui = { setConnection, notify, openProject, setFlow, setOverviewDetail, contextProject };

async function showPage(name) {
  await ensureProjects().catch(() => []);
  pages.forEach(page => { page.hidden = page.dataset.page !== name; });
  nav.forEach(button => {
    const active = button.dataset.nav === name;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  document.body.dataset.page = name;
  document.querySelector("#workspace-page").textContent = navigation[name][0];

  if (name === "today") {
    setFlow("orient", "What is actually moving now");
    await loadToday(ui, contextProject());
  }
  if (name === "projects") {
    setFlow("orient", "Coordination & execution");
    setConnection("Connected", "good");
    await loadProjects();
  }
  if (name === "review") {
    setFlow("orient", "Review, evidence & QA");
    await loadReview(ui, contextProject());
    const evidence = new URLSearchParams(location.hash.split("?")[1] || "").get("evidence");
    if (evidence && /^vis_[a-zA-Z0-9-]{8,128}$/.test(evidence)) await openQa(evidence);
  }
  if (name === "night-shift") {
    setFlow("orient", "Unattended activity");
    await loadNightShift(ui, contextProject());
  }
}

nav.forEach(button => button.addEventListener("click", () => {
  const next = button.dataset.nav;
  if (location.hash === "#" + next) showPage(next);
  else location.hash = next;
}));
projectContext?.addEventListener("change", () => {
  selectedProject = contextProject() || selectedProject;
  projectCache.clear();
  showPage(route()).catch(error => notify(error.message, "bad"));
});
projectSearch?.addEventListener("input", renderProjectList);
appSettings?.addEventListener("click", openSettings);
window.addEventListener("hashchange", () => showPage(route()));
bindReviewFilters();
showPage(route()).catch(error => { setConnection("Couldn’t connect", "bad"); notify(error.message, "bad"); });
