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
const projectTabs = document.querySelector("#project-tabs");
const projectDetail = document.querySelector("#project-detail");
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
  today: ["relay", "live workspace", "Observed work, decisions and automatic checks"],
  projects: ["runner", "observed execution", "Runner, GitHub and Cloud evidence"],
  review: ["inspector", "evidence queue", "Project-scoped visual review and QA"],
  "night-shift": ["night shift", "unattended activity", "Automatic work and its latest result"]
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
  const line = document.createElement("div");
  line.className = "page-statusline";
  line.setAttribute("aria-label", "Current view");
  line.innerHTML = '<div class="page-statusline-copy">' +
    (system ? '<span class="subsystem-context"><img src="' + brand[system] + '" alt=""><span>' + kicker + '</span></span>' : '<span class="page-status-kicker">' + kicker + '</span>') +
    '<strong data-flow-label>' + title + '</strong></div><span class="page-overview-detail">' + detail + '</span>';
  heading.after(line);
});

function setFlow(phase, label) {
  const page = pages.find(item => !item.hidden);
  if (!page) return;
  const line = page.querySelector(".page-statusline");
  if (!line) return;
  line.dataset.phase = phase;
  const target = line.querySelector("[data-flow-label]");
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
  renderProjectTabs();
  return projectIds;
}

function contextProject() {
  return selectedProject || "";
}

function renderProjectTabs() {
  if (!projectTabs) return;
  const items = [{ id: "", label: "all projects" }, ...projectIds.map(id => ({ id, label: projectName(id) }))];
  projectTabs.innerHTML = items.map(item => {
    const active = (selectedProject || "") === item.id;
    const identity = item.id ? iconSlot(item.id) : '<span class="project-tab-all">' + glyph("projects") + '</span>';
    return '<button class="project-tab' + (active ? " active" : "") + '" type="button" role="tab" aria-selected="' + (active ? "true" : "false") + '" data-project-id="' + esc(item.id) + '">' + identity + '<span>' + esc(item.label) + '</span></button>';
  }).join("");
  projectTabs.querySelectorAll("[data-project-id]").forEach(button => {
    button.addEventListener("click", () => chooseProject(button.dataset.projectId));
  });
  hydrateProjectIcons(projectTabs);
  const active = projectTabs.querySelector(".project-tab.active");
  active?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

async function chooseProject(id) {
  selectedProject = id || null;
  projectCache.clear();
  renderProjectTabs();
  if (route() === "projects") {
    if (id) {
      const next = "#projects?project=" + encodeURIComponent(id);
      if (location.hash !== next) location.hash = next;
      else await selectProject(id);
    } else {
      if (location.hash !== "#projects") location.hash = "projects";
      else await selectProject(null);
    }
    return;
  }
  await showPage(route());
}

async function selectProject(id) {
  selectedProject = id || null;
  renderProjectTabs();
  if (!id) {
    projectDetail.innerHTML = '<div class="project-empty-state"><strong>Choose a project</strong><span>The project tabs above control Runner, Inspector, Today and night shift.</span></div>';
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
  renderProjectTabs();
  await selectProject(selectedProject);
}

function openProject(id) {
  selectedProject = id;
  renderProjectTabs();
  location.hash = "projects?project=" + encodeURIComponent(id);
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
    setFlow("orient", "live workspace");
    await loadToday(ui, contextProject());
  }
  if (name === "projects") {
    setFlow("orient", "observed execution");
    setConnection("Connected", "good");
    await loadProjects();
  }
  if (name === "review") {
    setFlow("orient", "evidence queue");
    await loadReview(ui, contextProject());
    const evidence = new URLSearchParams(location.hash.split("?")[1] || "").get("evidence");
    if (evidence && /^vis_[a-zA-Z0-9-]{8,128}$/.test(evidence)) await openQa(evidence);
  }
  if (name === "night-shift") {
    setFlow("orient", "unattended activity");
    await loadNightShift(ui, contextProject());
  }
}

nav.forEach(button => button.addEventListener("click", () => {
  const next = button.dataset.nav;
  if (location.hash === "#" + next) showPage(next);
  else location.hash = next;
}));

appSettings?.addEventListener("click", openSettings);
window.addEventListener("hashchange", () => showPage(route()));
bindReviewFilters();
showPage(route()).catch(error => { setConnection("Couldn’t connect", "bad"); notify(error.message, "bad"); });
