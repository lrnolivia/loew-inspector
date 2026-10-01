import { brandInitializeResponse } from "./branding.js";
import gateway from "../../packages/inspector/index.js";
import runner from "../../packages/runner/src/cloudflare-worker.mjs";
import { webAssets, webBuildId, webSourceSha } from "../web/generated.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const websiteRoutes = { "/today": "/#/today", "/runner": "/#/runner", "/night-shift": "/#/night-shift" };
    const destination = websiteRoutes[url.pathname.replace(/\/$/, "")];
    if (destination && ["GET", "HEAD"].includes(request.method)) {
      return Response.redirect(url.origin + destination + url.search, 308);
    }
    if (url.pathname.startsWith("/api/")) {
      // Verify the same identity as native MCP before exposing operator API routes.
      const auth = await gateway.fetch(new Request(url.origin + "/mcp", {
        method: "POST", headers: new Headers({ ...Object.fromEntries(request.headers), "Content-Type": "application/json" }),
        body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "tools/call", params: { name: "__relay_web_auth_probe__", arguments: {} } })
      }), env);
      if (auth.status !== 200) return auth;
      return runner.fetch(request, env);
    }
    const asset = webAssets[url.pathname];
    if (asset && ["GET", "HEAD"].includes(request.method)) return new Response(request.method === "HEAD" ? null : asset.text, {
      headers: { "Content-Type": asset.type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Relay-Web-Build": webBuildId, ...(webSourceSha ? { "X-Relay-Source-Sha": webSourceSha } : {}) }
    });
    const identityRequest = url.pathname === "/mcp" && request.method === "POST" ? request.clone() : null;
    const response = await gateway.fetch(request, env);
    return identityRequest ? brandInitializeResponse(identityRequest, response) : response;
  }
};
