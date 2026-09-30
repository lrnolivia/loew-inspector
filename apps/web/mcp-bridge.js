// Same interface and HTTP-shaped responses; the host provides authenticated tool transport.
const pending = new Map();
let sequence = 0;
function rpc(method, params) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Relay host timed out")); }, 30000);
    pending.set(id, { resolve, reject, timer });
    window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
  });
}
window.addEventListener("message", event => {
  if (event.source !== window.parent || event.data?.jsonrpc !== "2.0") return;
  const waiter = pending.get(event.data.id);
  if (!waiter) return;
  pending.delete(event.data.id); clearTimeout(waiter.timer);
  if (event.data.error) waiter.reject(new Error(event.data.error.message));
  else waiter.resolve(event.data.result);
});
const ready = rpc("ui/initialize", {
  appInfo: { name: "relay", version: "1.0.0" }, appCapabilities: {}, protocolVersion: "2026-01-26"
}).then(() => window.parent.postMessage({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} }, "*"));
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, options = {}) => {
  const path = typeof input === "string" ? input : input.url;
  if (!path.startsWith("/api/")) return nativeFetch(input, options);
  await ready;
  const args = { path, method: options.method || "GET" };
  if (options.body) args.body = JSON.parse(options.body);
  const result = await rpc("tools/call", { name: "relay_ui_request", arguments: args });
  if (result.isError) throw new Error(result.content?.[0]?.text || "Relay request failed");
  const data = result.structuredContent || JSON.parse(result.content[0].text);
  const body = data.base64 ? Uint8Array.from(atob(data.base64), char => char.charCodeAt(0)) : JSON.stringify(data.body);
  return new Response(body, { status: data.status, headers: { "Content-Type": data.content_type } });
};
const images = new Map();
new MutationObserver(() => {
  document.querySelectorAll('img[src^="/api/"]').forEach(async img => {
    const path = img.getAttribute("src");
    img.removeAttribute("src");
    try {
      if (!images.has(path)) images.set(path, fetch(path).then(async response => {
        if (!response.ok) throw new Error("Could not load captured evidence");
        return URL.createObjectURL(await response.blob());
      }));
      img.src = await images.get(path);
    } catch (error) { img.alt = error.message; }
  });
}).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
