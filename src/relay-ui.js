export const RELAY_CONTROL_CENTER_URI = "ui://relay/control-center/v1.html";

const RELAY_CONTROL_CENTER_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relay control center</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f3f1ec;
    --panel: #fbfaf7;
    --panel-2: #ece9e2;
    --text: #171715;
    --muted: #706d66;
    --border: #d3cec4;
    --accent: #c58d00;
    --accent-soft: #efe0ad;
    --good: #3e7750;
    --warn: #8d6511;
    --bad: #9c463d;
    --radius: 12px;
    font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #151513;
      --panel: #1c1c1a;
      --panel-2: #242421;
      --text: #f1ece4;
      --muted: #aaa59c;
      --border: #35342f;
      --accent: #ffbf00;
      --accent-soft: #413514;
      --good: #77b38b;
      --warn: #d9aa3f;
      --bad: #dc8075;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: transparent; color: var(--text); }
  body { padding: 10px; }
  button { font: inherit; }
  .relay {
    max-width: 920px;
    margin: 0 auto;
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    background: var(--bg);
  }
  .topbar {
    display: flex;
    gap: 12px;
    align-items: center;
    min-height: 58px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }
  .mark {
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    border-radius: 9px;
    display: grid;
    place-items: center;
    background: #161614;
    border: 1px solid #2d2c27;
  }
  .mark svg { width: 25px; height: 25px; }
  .identity { min-width: 0; flex: 1; }
  .eyebrow {
    font-size: 10px;
    line-height: 1.2;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .titleline { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  h1 { font-size: 17px; margin: 1px 0 0; font-weight: 650; letter-spacing: -.02em; }
  .version { color: var(--muted); font-size: 11px; }
  .top-actions { display: flex; align-items: center; gap: 8px; }
  .status-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--good); box-shadow: 0 0 0 3px color-mix(in srgb, var(--good) 18%, transparent); }
  .refresh {
    min-height: 32px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--panel-2);
    color: var(--text);
    padding: 0 10px;
    cursor: pointer;
  }
  .refresh:disabled, .action:disabled { opacity: .5; cursor: default; }
  .grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }
  .ns {
    min-width: 0;
    padding: 10px 11px 9px;
    border-right: 1px solid var(--border);
  }
  .ns:last-child { border-right: 0; }
  .ns-name { font-size: 10px; letter-spacing: .08em; color: var(--muted); }
  .ns-value { font-size: 13px; margin-top: 3px; display: flex; gap: 6px; align-items: center; }
  .pill {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    padding: 0 7px;
    border-radius: 999px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    font-size: 10px;
    color: var(--muted);
    white-space: nowrap;
  }
  .pill.good { color: var(--good); }
  .pill.warn { color: var(--warn); }
  .content { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(260px, .85fr); }
  .primary { min-width: 0; border-right: 1px solid var(--border); }
  .side { min-width: 0; }
  .section { padding: 12px; }
  .section + .section { border-top: 1px solid var(--border); }
  .section-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 9px;
  }
  h2 { margin: 0; font-size: 12px; font-weight: 650; letter-spacing: .01em; }
  .section-note { font-size: 10px; color: var(--muted); }
  .worker {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--panel);
    overflow: hidden;
  }
  .worker + .worker { margin-top: 8px; }
  .worker-main { padding: 11px; }
  .worker-row { display: flex; align-items: flex-start; gap: 10px; }
  .worker-id {
    width: 29px; height: 29px; border-radius: 7px; display: grid; place-items: center;
    background: var(--panel-2); border: 1px solid var(--border); font-size: 11px; font-weight: 650;
  }
  .worker-copy { flex: 1; min-width: 0; }
  .worker-name { font-size: 13px; font-weight: 650; }
  .worker-meta { margin-top: 2px; color: var(--muted); font-size: 10px; line-height: 1.35; }
  .summary {
    margin-top: 9px;
    font-size: 11px;
    line-height: 1.45;
    color: var(--text);
  }
  .error {
    margin-top: 8px;
    padding: 7px 8px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--bad) 8%, var(--panel-2));
    border: 1px solid color-mix(in srgb, var(--bad) 24%, var(--border));
    color: var(--bad);
    font-size: 10px;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .worker-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 10px 10px;
    border-top: 1px solid var(--border);
    background: color-mix(in srgb, var(--panel-2) 45%, var(--panel));
  }
  .action {
    min-height: 28px;
    border-radius: 7px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
    padding: 0 9px;
    font-size: 10px;
    cursor: pointer;
  }
  .action.primary { border-color: color-mix(in srgb, var(--accent) 48%, var(--border)); }
  .stack { display: grid; gap: 8px; }
  .card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--panel);
    padding: 10px;
  }
  .card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .card-title { font-size: 11px; font-weight: 650; }
  .card-body { margin-top: 6px; font-size: 10px; line-height: 1.45; color: var(--muted); }
  .engine-list { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
  .engine { font-size: 9px; padding: 3px 6px; border-radius: 6px; border: 1px solid var(--border); background: var(--panel-2); }
  .footer {
    min-height: 30px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 12px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 9px;
    background: var(--panel);
  }
  .live { color: var(--good); }
  .loading { opacity: .65; }
  @media (max-width: 700px) {
    body { padding: 4px; }
    .relay { border-radius: 10px; }
    .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ns:nth-child(2n) { border-right: 0; }
    .ns:nth-child(n+3) { border-top: 1px solid var(--border); }
    .content { grid-template-columns: 1fr; }
    .primary { border-right: 0; }
    .side { border-top: 1px solid var(--border); }
    .top-actions .pill { display: none; }
  }
</style>
</head>
<body>
<main class="relay" id="relay-app" aria-live="polite">
  <header class="topbar">
    <div class="mark" aria-hidden="true">
      <svg viewBox="0 0 96 96" fill="none">
        <path d="M31 18H62C71 18 78 25 78 34V62C78 71 71 78 62 78H34C25 78 18 71 18 62V47" stroke="#F1ECE4" stroke-width="12" stroke-linejoin="round"/>
        <path d="M19 31H17C15.8954 31 15 31.8954 15 33V40C15 41.1046 15.8954 42 17 42H19C20.1046 42 21 41.1046 21 40V33C21 31.8954 20.1046 31 19 31Z" fill="#FFBF00"/>
      </svg>
    </div>
    <div class="identity">
      <div class="eyebrow">loew.fi / control plane</div>
      <div class="titleline"><h1>relay</h1><span class="version" id="version">connecting</span></div>
    </div>
    <div class="top-actions">
      <span class="status-dot" id="status-dot"></span>
      <span class="pill good" id="service-status">online</span>
      <button class="refresh" id="refresh" type="button" disabled>Refresh</button>
    </div>
  </header>

  <section class="grid" aria-label="Relay namespaces">
    <div class="ns"><div class="ns-name">CONTROL</div><div class="ns-value"><span id="control-state">ready</span></div></div>
    <div class="ns"><div class="ns-name">RUNNER</div><div class="ns-value"><span id="runner-state">—</span></div></div>
    <div class="ns"><div class="ns-name">SOURCE</div><div class="ns-value"><span id="source-state">—</span></div></div>
    <div class="ns"><div class="ns-name">CLOUD</div><div class="ns-value"><span id="cloud-state">—</span></div></div>
    <div class="ns"><div class="ns-name">VERIFY</div><div class="ns-value"><span id="verify-state">—</span></div></div>
  </section>

  <div class="content">
    <section class="primary section">
      <div class="section-head">
        <h2>relay.RUNNER</h2>
        <span class="section-note" id="worker-count">loading workers</span>
      </div>
      <div id="workers"></div>
    </section>

    <aside class="side">
      <section class="section">
        <div class="section-head"><h2>relay.SOURCE</h2></div>
        <div class="card">
          <div class="card-top"><span class="card-title">GitHub</span><span class="pill" id="source-write-pill">checking</span></div>
          <div class="card-body" id="source-copy">Reading source control capability.</div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>relay.CLOUD</h2></div>
        <div class="card">
          <div class="card-top"><span class="card-title">Cloudflare</span><span class="pill" id="cloud-pill">checking</span></div>
          <div class="card-body" id="cloud-copy">Reading cloud control capability.</div>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>relay.VERIFY</h2></div>
        <div class="card">
          <div class="card-top"><span class="card-title">Evidence engines</span><span class="pill good" id="verify-pill">checking</span></div>
          <div class="engine-list" id="engines"></div>
        </div>
      </section>
    </aside>
  </div>

  <footer class="footer">
    <span id="footer-left">MCP Apps / portable bridge</span>
    <span id="updated">waiting for data</span>
  </footer>
</main>

<script>
(() => {
  if (window.__relayControlCenterInitialized) return;
  window.__relayControlCenterInitialized = true;

  const app = document.getElementById("relay-app");
  const refreshButton = document.getElementById("refresh");
  const pending = new Map();
  let nextId = 1;
  let bridgeReady = false;
  let busy = false;
  let state = {
    version: null,
    capabilities: {},
    workers: [],
    cloud: {},
    verify: { engines: [] },
    source_owner: "lrnolivia",
    generated_at: null
  };

  const byId = (id) => document.getElementById(id);
  const text = (id, value) => { byId(id).textContent = value; };
  const safe = (value, fallback = "—") => value === null || value === undefined || value === "" ? fallback : String(value);

  function rpcNotify(method, params) {
    window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
  }

  function rpcRequest(method, params) {
    const id = nextId++;
    window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  function callTool(name, args = {}) {
    return rpcRequest("tools/call", { name, arguments: args });
  }

  function toolData(response) {
    return response && response.structuredContent ? response.structuredContent : null;
  }

  function shortError(value) {
    const s = safe(value, "");
    if (!s) return "";
    return s.length > 220 ? s.slice(0, 217) + "…" : s;
  }

  function statusWord(ok, enabled = "ready", disabled = "pending") {
    return ok ? enabled : disabled;
  }

  function renderWorkers() {
    const root = byId("workers");
    root.textContent = "";
    const workers = Array.isArray(state.workers) ? state.workers : [];
    text("worker-count", workers.length === 1 ? "1 worker" : workers.length + " workers");

    if (!workers.length) {
      const empty = document.createElement("div");
      empty.className = "card-body";
      empty.textContent = "No Runner workers are registered.";
      root.appendChild(empty);
      return;
    }

    workers.forEach((worker) => {
      const box = document.createElement("article");
      box.className = "worker";

      const main = document.createElement("div");
      main.className = "worker-main";

      const row = document.createElement("div");
      row.className = "worker-row";

      const icon = document.createElement("div");
      icon.className = "worker-id";
      icon.textContent = safe(worker.name || worker.id, "?").slice(0, 1).toUpperCase();

      const copy = document.createElement("div");
      copy.className = "worker-copy";

      const name = document.createElement("div");
      name.className = "worker-name";
      name.textContent = safe(worker.name || worker.id);

      const runtime = worker.runtime || {};
      const meta = document.createElement("div");
      meta.className = "worker-meta";
      meta.textContent = [
        safe(runtime.status, "unknown"),
        safe(worker.target && worker.target.repository),
        worker.cadence_minutes ? worker.cadence_minutes + " min cadence" : null
      ].filter(Boolean).join(" · ");

      copy.append(name, meta);
      row.append(icon, copy);
      main.appendChild(row);

      if (runtime.last_summary) {
        const summary = document.createElement("div");
        summary.className = "summary";
        summary.textContent = runtime.last_summary;
        main.appendChild(summary);
      }

      if (runtime.last_error) {
        const error = document.createElement("div");
        error.className = "error";
        error.textContent = shortError(runtime.last_error);
        main.appendChild(error);
      }

      const actions = document.createElement("div");
      actions.className = "worker-actions";
      ["run", "doctor", "repair"].forEach((actionName) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "action" + (actionName === "run" ? " primary" : "");
        button.textContent = actionName;
        button.disabled = !bridgeReady || busy;
        button.addEventListener("click", () => runWorkerAction(worker.id, actionName));
        actions.appendChild(button);
      });

      box.append(main, actions);
      root.appendChild(box);
    });
  }

  function render() {
    text("version", state.version ? "v" + state.version : "connecting");

    const caps = state.capabilities || {};
    text("runner-state", caps.runner_read ? (caps.runner_write ? "read / write" : "read") : "offline");
    text("source-state", caps.source_read ? (caps.source_write ? "read / write" : "read") : "offline");
    text("cloud-state", caps.cloud_control ? "connected" : "pending");
    text("verify-state", caps.verify ? "ready" : "offline");

    const sourceWrite = byId("source-write-pill");
    sourceWrite.textContent = caps.source_write ? "read / write" : "read only";
    sourceWrite.className = "pill " + (caps.source_write ? "good" : "warn");
    text("source-copy", caps.source_write
      ? "GitHub reads and guarded writes are available for " + safe(state.source_owner) + "."
      : "GitHub reads are live. Relay-native writes are waiting for a first-party source credential.");

    const cloud = state.cloud || {};
    const cloudPill = byId("cloud-pill");
    cloudPill.textContent = cloud.configured ? "connected" : "not configured";
    cloudPill.className = "pill " + (cloud.configured ? "good" : "warn");
    text("cloud-copy", cloud.configured
      ? "Cloudflare control credentials are present."
      : "Cloudflare remains outside Relay until first-party cloud credentials and bounded tools are configured.");

    const engines = state.verify && Array.isArray(state.verify.engines) ? state.verify.engines : [];
    text("verify-pill", engines.length ? engines.length + " engines" : "checking");
    const engineRoot = byId("engines");
    engineRoot.textContent = "";
    engines.forEach((engine) => {
      const tag = document.createElement("span");
      tag.className = "engine";
      tag.textContent = safe(engine.id);
      engineRoot.appendChild(tag);
    });

    const date = state.generated_at ? new Date(state.generated_at) : new Date();
    text("updated", "updated " + date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    refreshButton.disabled = !bridgeReady || busy;
    renderWorkers();
  }

  async function refreshAll() {
    if (!bridgeReady || busy) return;
    busy = true;
    app.classList.add("loading");
    refreshButton.disabled = true;
    try {
      const [statusResponse, workersResponse, cloudResponse, verifyResponse] = await Promise.all([
        callTool("relay_control_status"),
        callTool("relay_runner_workers"),
        callTool("relay_cloud_status"),
        callTool("relay_verify_evidence_engines")
      ]);
      const status = toolData(statusResponse) || {};
      const workers = toolData(workersResponse) || {};
      const cloud = toolData(cloudResponse) || {};
      const verify = toolData(verifyResponse) || {};
      state = Object.assign({}, state, status, {
        workers: workers.workers || [],
        cloud,
        verify,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      text("service-status", "refresh failed");
      byId("service-status").className = "pill warn";
    } finally {
      busy = false;
      app.classList.remove("loading");
      render();
    }
  }

  async function runWorkerAction(workerId, action) {
    if (!bridgeReady || busy) return;
    busy = true;
    renderWorkers();
    try {
      await callTool("relay_runner_action", { worker_id: workerId, action, payload: {} });
      const workersResponse = await callTool("relay_runner_workers");
      const workers = toolData(workersResponse) || {};
      state.workers = workers.workers || [];
      state.generated_at = new Date().toISOString();
    } catch (error) {
      text("service-status", action + " failed");
      byId("service-status").className = "pill warn";
    } finally {
      busy = false;
      render();
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;

    if (message.id !== undefined && pending.has(message.id)) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter.reject(message.error);
      else waiter.resolve(message.result);
      return;
    }

    if (message.method === "ui/notifications/tool-result") {
      const next = message.params && message.params.structuredContent;
      if (next && next.service === "relay") {
        state = Object.assign({}, state, next);
        render();
      }
    }
  }, { passive: true });

  refreshButton.addEventListener("click", refreshAll);

  (async () => {
    try {
      await rpcRequest("ui/initialize", {
        appInfo: { name: "relay-control-center", version: "1.0.0" },
        appCapabilities: {},
        protocolVersion: "2026-01-26"
      });
      rpcNotify("ui/notifications/initialized", {});
      bridgeReady = true;
      byId("service-status").textContent = "online";
      byId("service-status").className = "pill good";
      render();
    } catch (error) {
      byId("service-status").textContent = "bridge error";
      byId("service-status").className = "pill warn";
      render();
    }
  })();

  render();
})();
</script>
</body>
</html>`;

export function relayControlCenterResource() {
  return {
    uri: RELAY_CONTROL_CENTER_URI,
    mimeType: "text/html;profile=mcp-app",
    text: RELAY_CONTROL_CENTER_HTML,
    _meta: {
      ui: {
        prefersBorder: false
      },
      "openai/ui": {
        availableDisplayModes: ["inline", "fullscreen"]
      }
    }
  };
}
