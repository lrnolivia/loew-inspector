
const friendlyRoot = document.querySelector("#workers-section");
const friendlyToolbar = document.querySelector("#toolbar-context");

function friendlyEscape(value) {
  return String(value == null ? "" : value).replace(/[&<>"\']/g, function (char) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\'": "&#039;" })[char];
  });
}

function friendlyText(text) {
  return String(text || "")
    .replace(/lockfile repair/gi, "dependency repair")
    .replace(/clean install/gi, "fresh install")
    .replace(/project verification is not healthy/gi, "some project checks are still failing")
    .replace(/test isolation diagnostics were captured/gi, "Runner recorded the failing test details")
    .replace(/project tests\/lint have separate failures/gi, "some project checks still need attention")
    .replace(/Repair may open a draft PR with those warnings\./gi, "Runner can prepare a draft fix without hiding those warnings.");
}

function simplifyStatusPill(pill) {
  const label = pill.textContent.trim().toLowerCase();
  const replacements = [
    ["worker · blocked", "automation · needs attention"],
    ["worker · failed", "automation · needs attention"],
    ["worker · running", "automation · working"],
    ["worker · idle", "automation · ready"],
    ["dependencies · repairable", "setup · fix available"],
    ["dependencies · healthy", "setup · good"],
    ["dependencies · failed", "setup · needs attention"],
    ["project · failed", "project · needs attention"],
    ["project · healthy", "project · good"]
  ];
  for (const pair of replacements) {
    if (label === pair[0]) {
      const textNode = pill.querySelector("span:last-child");
      if (textNode) textNode.textContent = pair[1];
      break;
    }
  }
}

function simplifyWorkers() {
  if (!friendlyRoot) return;
  if (friendlyToolbar) {
    const visual = document.body.dataset.section === "visual";
    friendlyToolbar.textContent = visual ? "YOUR QA · LIVE + CAPTURED" : "WHAT’S RUNNING · WHAT NEEDS YOU";
  }

  document.querySelectorAll(".summary .stat span").forEach(function (node) {
    const map = {
      workers: "automations",
      enabled: "on",
      running: "working now",
      repairable: "needs attention",
      blocked: "needs attention"
    };
    const key = node.textContent.trim().toLowerCase();
    if (map[key]) node.textContent = map[key];
  });

  document.querySelectorAll(".worker-panel").forEach(function (panel) {
    const meta = panel.querySelector(".worker-meta");
    if (meta && !meta.dataset.friendly) {
      const repository = meta.textContent.split(" · ")[0];
      meta.textContent = repository + " · automatic project check";
      meta.dataset.friendly = "true";
    }

    const doctor = panel.querySelector(".doctor");
    const repair = panel.querySelector(".repair");
    const run = panel.querySelector(".run");
    if (doctor) doctor.textContent = "Check setup";
    if (repair) repair.textContent = "Prepare fix";
    if (run) run.textContent = "Check now";
    panel.querySelectorAll(".status-pill").forEach(simplifyStatusPill);

    const header = panel.querySelector(".data-header");
    if (header) {
      const labels = ["Watching", "Checks today", "Last checked", "Next check"];
      Array.from(header.children).forEach(function (cell, index) {
        if (labels[index]) cell.textContent = labels[index];
      });
    }
    const row = panel.querySelector(".data-row");
    if (row && row.children.length >= 4) {
      const firstMuted = row.children[0].querySelector(".muted");
      if (firstMuted) firstMuted.textContent = "safe observation";
      const budgetMuted = row.children[1].querySelector(".muted");
      if (budgetMuted) budgetMuted.textContent = "automatic limit set";
      const nextMuted = row.children[3].querySelector(".muted");
      if (nextMuted) nextMuted.textContent = panel.querySelector(".toggle")?.textContent === "Pause" ? "automatic" : "off";
    }

    const settings = panel.querySelector(".settings-card");
    if (settings) {
      settings.classList.remove("overview-only");
      settings.classList.add("diagnostics-only");
      const title = settings.querySelector("summary strong");
      const help = settings.querySelector("summary small");
      if (title) title.textContent = "Automation settings";
      if (help) help.textContent = "Advanced controls · secrets stay hidden";
    }

    if (!panel.querySelector(".friendly-status")) {
      const diagnosis = panel.querySelectorAll(".diagnosis-block");
      const dataHeader = panel.querySelector(".data-header");
      if (diagnosis.length >= 3 && dataHeader) {
        const latest = diagnosis[1].querySelector(".diagnosis-value")?.textContent || "Runner has not checked this project yet.";
        const next = diagnosis[2].querySelector(".diagnosis-value")?.textContent || "Nothing needs your attention right now.";
        const summary = document.createElement("div");
        summary.className = "friendly-status overview-only";
        summary.innerHTML =
          '<section><div class="friendly-label">What happened</div><div class="friendly-copy">' + friendlyEscape(friendlyText(latest)) + "</div></section>" +
          '<section><div class="friendly-label">What happens next</div><div class="friendly-copy">' + friendlyEscape(friendlyText(next)) + "</div></section>" +
          '<section><div class="friendly-label">What Runner can do</div><div class="friendly-copy">Runner can watch, verify, and prepare guarded project work. Anything that changes code still goes through a branch and review.</div></section>';
        dataHeader.before(summary);
      }
    }
  });
}

if (friendlyRoot) {
  new MutationObserver(function () { requestAnimationFrame(simplifyWorkers); }).observe(friendlyRoot, { childList: true, subtree: true });
}
document.addEventListener("click", function () { requestAnimationFrame(simplifyWorkers); });
simplifyWorkers();
