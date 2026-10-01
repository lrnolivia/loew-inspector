// Only the standalone Inspector document installs this bootstrap. The preserved
// review UI stays intact; other website jobs belong to the React app at root.
export function inspectorWebsiteNavigation() {
  const destinations = { today: "/#/today", projects: "/#/runner", runner: "/#/runner", "night-shift": "/#/night-shift" };
  function reconcile() {
    const [route, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
    if (destinations[route]) {
      location.replace(destinations[route] + (query ? "?" + query : ""));
      return;
    }
    if (!route) history.replaceState(null, "", location.pathname + location.search + "#review");
  }
  document.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest("[data-nav]") : null;
    const destination = button && destinations[button.dataset.nav];
    if (!destination) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(destination);
  }, true);
  window.addEventListener("hashchange", reconcile);
  reconcile();
}
