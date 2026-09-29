import { browserRequestOptions, runQuickAction } from "./browser.js";
import { storeEvidence, decodeBase64Bytes, summarizeSnapshot } from "./evidence.js";

const VERSION = "0.4.0";
const ACCESS_ISSUER = "https://loewfi.cloudflareaccess.com";
const ACCESS_AUD = "6d19d2ef9eea644a9f55a049699a31110150fefebb1bca8c89632b9dd149ccd6";
const BRIDGE_ACCESS_AUD = "042e98668017c064913a05705dd5e26de48153116ecb9bd574ec1128a559fd23";
const MAX_BODY_BYTES = 262144;
const MAX_REDIRECTS = 5;
const TARGET_TIMEOUT_MS = 10000;
const SAFE_HEADERS = [
  "content-type", "content-length", "cache-control", "cf-ray", "server",
  "cross-origin-resource-policy", "cross-origin-opener-policy",
  "cross-origin-embedder-policy", "origin-agent-cluster"
];
const TEXT_TYPES = /^(text\/|application\/(?:json|xml|javascript|xhtml\+xml|[^;]+\+(?:json|xml)))/i;

let jwksCache = { expires: 0, keys: [] };

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

function validateTarget(input) {
  if (typeof input !== "string" || input.length > 4096 || input !== input.trim() || /[\\\x00-\x1f\x7f]/.test(input)) {
    throw new Error("Invalid URL");
  }
  let url;
  try { url = new URL(input); } catch { throw new Error("Invalid URL"); }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    (host !== "loew.fi" && !host.endsWith(".loew.fi")) ||
    url.username || url.password || url.port || url.hash
  ) {
    throw new Error("Only HTTPS URLs on loew.fi and its subdomains are allowed");
  }
  return url;
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

async function getAccessKeys() {
  const now = Date.now();
  if (jwksCache.expires > now && jwksCache.keys.length) return jwksCache.keys;
  const response = await fetch(ACCESS_ISSUER + "/cdn-cgi/access/certs", {
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error("Unable to load Access signing keys");
  const data = await response.json();
  const keys = Array.isArray(data.keys) ? data.keys : [];
  jwksCache = { expires: now + 300000, keys };
  return keys;
}

async function verifyAccessJwt(request) {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token || token.length > 8192) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const now = Date.now() / 1000;
    if (
      header.alg !== "RS256" ||
      typeof header.kid !== "string" ||
      claims.iss !== ACCESS_ISSUER ||
      (!aud.includes(ACCESS_AUD) && !aud.includes(BRIDGE_ACCESS_AUD)) ||
      typeof claims.exp !== "number" || claims.exp <= now ||
      (typeof claims.nbf === "number" && claims.nbf > now)
    ) return null;

    const keys = await getAccessKeys();
    const jwk = keys.find(k => k.kid === header.kid && k.kty === "RSA");
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(parts[0] + "." + parts[1])
    );
    return ok ? { token, claims } : null;
  } catch {
    return null;
  }
}

async function boundedText(response) {
  if (!response.body) return { body: "", truncated: false };
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = MAX_BODY_BYTES - total;
      if (remaining <= 0) {
        truncated = true;
        await reader.cancel();
        break;
      }
      if (value.length > remaining) {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
      total += value.length;
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return { body: new TextDecoder().decode(joined), truncated };
}

async function fetchTarget(input, method, accessJwt) {
  if (method !== "GET" && method !== "HEAD") throw new Error("Only GET and HEAD are allowed");
  let url = validateTarget(input);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const response = await fetch(url.toString(), {
      method,
      redirect: "manual",
      headers: {
        "Cf-Access-Token": accessJwt,
        "Accept": "text/html,text/plain,application/json,application/xml;q=0.9,*/*;q=0.1"
      },
      signal: AbortSignal.timeout(TARGET_TIMEOUT_MS)
    });

    if ([301,302,303,307,308].includes(response.status) && response.headers.has("location")) {
      if (redirects === MAX_REDIRECTS) throw new Error("Too many redirects");
      url = validateTarget(new URL(response.headers.get("location"), url).toString());
      continue;
    }

    const contentType = response.headers.get("content-type") || "";
    const headers = Object.fromEntries(
      SAFE_HEADERS.flatMap(name => response.headers.has(name) ? [[name, response.headers.get(name)]] : [])
    );
    const readable = method === "GET" && TEXT_TYPES.test(contentType);
    const content = readable ? await boundedText(response) : { body: "", truncated: false };
    return {
      status: response.status,
      final_url: url.toString(),
      content_type: contentType,
      ...content,
      headers
    };
  }
  throw new Error("Too many redirects");
}

function rpc(id, result) {
  return json({ jsonrpc: "2.0", id, result });
}

function rpcError(id, code, message) {
  return json({ jsonrpc: "2.0", id, error: { code, message } });
}

async function mcp(request, access, env) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, { allow: "POST" });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return json({ error: "JSON required" }, 415);
  }
  if (Number(request.headers.get("content-length") || 0) > 16384) {
    return json({ error: "Request too large" }, 413);
  }

  const raw = await request.text();
  if (raw.length > 16384) return json({ error: "Request too large" }, 413);

  let message;
  try { message = JSON.parse(raw); }
  catch { return rpcError(null, -32700, "Invalid JSON"); }

  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(message?.id ?? null, -32600, "Invalid request");
  }

  if (message.method === "notifications/initialized") {
    return new Response(null, { status: 202 });
  }

  const id = message.id ?? null;

  if (message.method === "initialize") {
    return rpc(id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "loew-inspector", version: VERSION }
    });
  }

  if (message.method === "ping") return rpc(id, {});

  if (message.method === "tools/list") {
    return rpc(id, {
      tools: [
        {
          name: "fetch_loew_url",
          title: "Fetch a protected loew.fi page",
          description: "Read an HTTPS page on loew.fi or a loew.fi subdomain through the authenticated inspector. Redirects are revalidated and text responses are bounded.",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "HTTPS loew.fi URL" },
              method: { type: "string", enum: ["GET","HEAD"], default: "GET" }
            },
            required: ["url"],
            additionalProperties: false
          },
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
        },
        {
          name: "browser_screenshot",
          title: "Capture loew.fi visual evidence",
          description: "Render an HTTPS loew.fi page in Cloudflare Browser Run, persist the PNG in inspector evidence storage, and return a compact evidence record.",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "HTTPS loew.fi URL" },
              request_id: { type: "string", description: "Optional safe correlation id" },
              full_page: { type: "boolean", default: false },
              selector: { type: "string", description: "Optional CSS selector to capture" },
              viewport: {
                type: "object",
                properties: {
                  width: { type: "number", minimum: 320, maximum: 3840 },
                  height: { type: "number", minimum: 240, maximum: 2160 },
                  deviceScaleFactor: { type: "number", minimum: 1, maximum: 2 }
                },
                additionalProperties: false
              }
            },
            required: ["url"],
            additionalProperties: false
          },
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
        },
        {
          name: "browser_snapshot",
          title: "Capture loew.fi browser snapshot",
          description: "Render an HTTPS loew.fi page and persist screenshot evidence while returning HTTP status plus rendered DOM and accessibility summaries.",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "HTTPS loew.fi URL" },
              request_id: { type: "string", description: "Optional safe correlation id" },
              full_page: { type: "boolean", default: false },
              viewport: {
                type: "object",
                properties: {
                  width: { type: "number", minimum: 320, maximum: 3840 },
                  height: { type: "number", minimum: 240, maximum: 2160 },
                  deviceScaleFactor: { type: "number", minimum: 1, maximum: 2 }
                },
                additionalProperties: false
              }
            },
            required: ["url"],
            additionalProperties: false
          },
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
        }
      ]
    });
  }

  if (message.method === "tools/call") {
    try {
      const name = message.params?.name;
      const args = message.params?.arguments || {};

      if (name === "fetch_loew_url") {
        const target = validateTarget(args.url);
        const method = args.method || "GET";
        const result = await fetchTarget(target.toString(), method, access.token);
        return rpc(id, {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result
        });
      }

      if (name === "browser_screenshot") {
        const target = validateTarget(args.url);
        const options = browserRequestOptions({
          url: target,
          accessJwt: access.token,
          viewport: args.viewport,
          selector: args.selector,
          fullPage: args.full_page
        });
        const started = Date.now();
        const response = await runQuickAction(env.BROWSER, "screenshot", options);
        const browserMs = Number(response.headers.get("x-browser-ms-used") || 0) || null;
        const png = new Uint8Array(await response.arrayBuffer());
        const metadata = await storeEvidence(env.EVIDENCE, {
          requestId: args.request_id,
          targetUrl: target.toString(),
          kind: "screenshot",
          screenshotBytes: png,
          browserMs,
          viewport: options.viewport,
          selector: options.selector ?? null,
          fullPage: Boolean(args.full_page),
          durationMs: Date.now() - started
        });
        return rpc(id, {
          content: [{ type: "text", text: JSON.stringify(metadata) }],
          structuredContent: metadata
        });
      }

      if (name === "browser_snapshot") {
        const target = validateTarget(args.url);
        const probe = await fetchTarget(target.toString(), "GET", access.token);
        const options = browserRequestOptions({
          url: target,
          accessJwt: access.token,
          viewport: args.viewport,
          fullPage: args.full_page
        });
        options.formats = ["content", "screenshot", "accessibilityTree"];
        const started = Date.now();
        const response = await runQuickAction(env.BROWSER, "snapshot", options);
        const browserMs = Number(response.headers.get("x-browser-ms-used") || 0) || null;
        const payload = await response.json();
        const result = payload?.result ?? payload;
        const screenshotBytes = decodeBase64Bytes(result?.screenshot);
        const summary = summarizeSnapshot(result);
        const metadata = await storeEvidence(env.EVIDENCE, {
          requestId: args.request_id,
          targetUrl: target.toString(),
          kind: "snapshot",
          screenshotBytes,
          browserMs,
          viewport: options.viewport,
          fullPage: Boolean(args.full_page),
          durationMs: Date.now() - started,
          extra: {
            http_status: probe.status,
            final_url: probe.final_url,
            title: summary.title,
            dom: summary.dom,
            accessibility: summary.accessibility,
            console_errors: { supported: false, reason: "Quick Actions do not expose a console event stream; interactive Browser Run sessions add this in Gen 2 Batch 3." },
            failed_requests: { supported: false, reason: "Quick Actions do not expose request-failure events; interactive Browser Run sessions add this in Gen 2 Batch 3." }
          }
        });
        return rpc(id, {
          content: [{ type: "text", text: JSON.stringify(metadata) }],
          structuredContent: metadata
        });
      }

      return rpcError(id, -32602, "Unknown tool");
    } catch (error) {
      return rpc(id, {
        content: [{ type: "text", text: error instanceof Error ? error.message : "Inspector action failed" }],
        isError: true
      });
    }
  }

  return rpcError(id, -32601, "Method not found");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "loew-inspector",
        version: VERSION,
        auth: "cloudflare-managed-oauth",
        downstream_auth: "linked-app-token",
        browser_runtime: Boolean(env?.BROWSER)
      });
    }

    const access = await verifyAccessJwt(request);
    if (!access) {
      return json(
        { error: "Authentication required" },
        401,
        {
          "WWW-Authenticate": 'Bearer resource_metadata="https://inspector.loew.fi/.well-known/oauth-protected-resource"'
        }
      );
    }

    if (url.pathname === "/mcp") return mcp(request, access, env);

    if (url.pathname === "/setup") {
      return json({
        error: "Deprecated",
        message: "Service-token setup is no longer used. Authentication is handled by Cloudflare Managed OAuth."
      }, 410);
    }

    if (url.pathname === "/" && request.method === "GET") {
      return json({
        ok: true,
        service: "loew-inspector",
        version: VERSION,
        authenticated: true
      });
    }

    return json({ error: "Not found" }, 404);
  }
};
