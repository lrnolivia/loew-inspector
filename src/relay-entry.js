import { uiApiTool, callUiApi } from "../apps/web/api.js";
import legacy from "./index.js";
import { callSourceLifecycleTool } from "./source-lifecycle.js";
import { sourceTextMutationTools, isSourceTextMutationTool, validateSourceTextMutationArguments, callSourceTextMutationTool } from "./source-text-mutation.js";
import { runnerCleanupTool, callRunnerCleanup, validateRunnerCleanupArguments } from "./runner-cleanup.js";
import { cloudUploadTool, callCloudUpload, validateCloudUploadArguments } from "./cloud-upload.js";
import { QA_SKILL_URI, qaSkillCatalogEntry, qaSkillResourceDescriptor, qaSkillResource } from "./qa-skill.js";
import { LOEW_NAMING_SKILL_URI, loewNamingSkillCatalogEntry, loewNamingSkillResourceDescriptor, loewNamingSkillResource } from "./loew-naming-skill.js";
import { RELAY_CONTEXT_CARD_URI, relayContextCardDescriptor, relayContextCardResource, contextualizeRelayTool } from "./relay-chat-ui.js";

export const RELAY_EXTENSION_VERSION = "1.9.2";

const createBranch = {
  name: "relay_source_create_branch",
  title: "Create a GitHub branch",
  description: "Create a branch through relay.SOURCE from a branch name or exact 40-character commit SHA, with readback reconciliation.",
  inputSchema: {
    type: "object",
    properties: {
      owner: { type: "string" },
      repo: { type: "string" },
      branch: { type: "string" },
      base: { type: "string", default: "main", description: "Base branch name or exact 40-character commit SHA." }
    },
    required: ["repo", "branch"],
    additionalProperties: false
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
};

const lifecycle = [
  {
    name: "relay_source_inventory",
    title: "Inspect GitHub branches and PR heads",
    description: "Read bounded paginated branch and open-PR inventory with exact head SHAs through relay.SOURCE.",
    inputSchema: {
      type: "object",
      properties: { owner: { type: "string" }, repo: { type: "string" } },
      required: ["repo"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: "relay_source_pull_request_action",
    title: "Act on an exact-head pull request",
    description: "Update metadata, mark ready, or merge only while the PR head matches the supplied SHA. Merge requires green check runs and commit statuses and never requests a protection bypass.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        number: { type: "integer", minimum: 1, maximum: 1000000 },
        action: { type: "string", enum: ["update", "ready", "merge"] },
        expected_head_sha: { type: "string", pattern: "^[a-fA-F0-9]{40}$" },
        title: { type: "string" },
        body: { type: "string" },
        base: { type: "string" },
        merge_method: { type: "string", enum: ["merge", "squash", "rebase"], default: "squash" }
      },
      required: ["repo", "number", "action", "expected_head_sha"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
  }
];

export function augmentToolList(tools) {
  const list = Array.isArray(tools) ? tools : [];
  const old = list.find(tool => tool.name === createBranch.name);
  const schemes = old?.securitySchemes || list[0]?.securitySchemes || [{ type: "oauth2", scopes: [] }];
  const replacement = {
    ...(old || {}),
    ...createBranch,
    securitySchemes: schemes,
    _meta: { ...(old?._meta || {}), securitySchemes: schemes }
  };
  const extensionTools = [...lifecycle, ...sourceTextMutationTools, runnerCleanupTool, cloudUploadTool, uiApiTool];
  const names = new Set(extensionTools.map(tool => tool.name));
  const sourceDescriptions = {
    relay_source_update_file: "Create or replace one UTF-8 file on a non-default branch through relay.SOURCE using configured GitHub source auth (GitHub App preferred). Direct default-branch writes are intentionally blocked; coordination control state must use relay.RUNNER.",
    relay_source_open_pull_request: "Open a pull request through relay.SOURCE using configured GitHub source auth (GitHub App preferred)."
  };
  const kept = list
    .filter(tool => tool.name !== createBranch.name && !names.has(tool.name))
    .map(tool => sourceDescriptions[tool.name] ? { ...tool, description: sourceDescriptions[tool.name] } : tool)
    .map(contextualizeRelayTool);
  return [
    ...kept,
    contextualizeRelayTool(replacement),
    ...extensionTools.map(tool => contextualizeRelayTool({
      ...tool,
      securitySchemes: schemes,
      _meta: { ...(tool._meta || {}), securitySchemes: schemes }
    }))
  ];
}

export function augmentResourceList(resources) {
  const list = Array.isArray(resources) ? [...resources] : [];
  if (!list.some(resource => resource?.uri === RELAY_CONTEXT_CARD_URI)) list.push(relayContextCardDescriptor());
  if (!list.some(resource => resource?.uri === QA_SKILL_URI)) list.push(qaSkillResourceDescriptor());
  if (!list.some(resource => resource?.uri === LOEW_NAMING_SKILL_URI)) list.push(loewNamingSkillResourceDescriptor());
  return list;
}

export function augmentSkillList(skills) {
  const list = Array.isArray(skills) ? [...skills] : [];
  if (!list.some(skill => skill?.uri === QA_SKILL_URI)) list.push(qaSkillCatalogEntry());
  if (!list.some(skill => skill?.uri === LOEW_NAMING_SKILL_URI)) list.push(loewNamingSkillCatalogEntry());
  return list;
}

function rpcResult(id, result, sourceHeaders) {
  return responseJson({ jsonrpc: "2.0", id, result }, 200, sourceHeaders);
}

export function validateLifecycleArguments(name, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Tool arguments must be an object");
  const common = ["owner", "repo"];
  let allowed, required;
  if (name === "relay_source_inventory") {
    allowed = common; required = ["repo"];
  } else if (name === "relay_source_create_branch") {
    allowed = [...common, "branch", "base"]; required = ["repo", "branch"];
  } else if (name === "relay_source_pull_request_action") {
    allowed = [...common, "number", "action", "expected_head_sha", "title", "body", "base", "merge_method"];
    required = ["repo", "number", "action", "expected_head_sha"];
  } else throw new Error("Unknown source lifecycle tool");
  for (const key of Object.keys(args)) if (!allowed.includes(key)) throw new Error(`Unsupported argument: ${key}`);
  for (const key of required) if (!(key in args)) throw new Error(`Missing required argument: ${key}`);

  if (name === "relay_source_pull_request_action") {
    const action = args.action;
    if (!["update", "ready", "merge"].includes(action)) throw new Error("Unsupported pull request action");
    const supplied = key => key in args;
    if (action === "update" && !["title", "body", "base"].some(supplied)) throw new Error("Metadata update requires title, body, or base");
    if (action === "ready" && ["title", "body", "base", "merge_method"].some(supplied)) throw new Error("Ready action does not accept update or merge fields");
    if (action === "merge" && ["title", "body", "base"].some(supplied)) throw new Error("Merge action does not accept metadata fields");
  }
  return args;
}

function responseJson(payload, status = 200, sourceHeaders) {
  const headers = new Headers(sourceHeaders || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.delete("content-length");
  return new Response(JSON.stringify(payload), { status, headers });
}
async function rewrite(response, mutate) {
  const body = await response.text();
  let payload;
  try { payload = JSON.parse(body); } catch { return new Response(body, { status: response.status, headers: response.headers }); }
  mutate(payload);
  return responseJson(payload, response.status, response.headers);
}
function patchVersion(payload) {
  if (payload?.version) payload.version = RELAY_EXTENSION_VERSION;
  if (payload?.result?.serverInfo?.version) payload.result.serverInfo.version = RELAY_EXTENSION_VERSION;
  const structured = payload?.result?.structuredContent;
  if (structured?.version) structured.version = RELAY_EXTENSION_VERSION;
  const content = payload?.result?.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item?.type !== "text" || typeof item.text !== "string") continue;
      try {
        const value = JSON.parse(item.text);
        if (value?.version) {
          value.version = RELAY_EXTENSION_VERSION;
          item.text = JSON.stringify(value);
        }
      } catch {}
    }
  }
}

function isExtensionTool(name) {
  return name === uiApiTool.name || name === createBranch.name || lifecycle.some(tool => tool.name === name) || isSourceTextMutationTool(name) || name === runnerCleanupTool.name || name === cloudUploadTool.name;
}
async function authProbe(request, message, env) {
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  const probe = {
    jsonrpc: "2.0",
    id: message.id ?? null,
    method: "tools/call",
    params: { name: "__relay_extension_auth_probe__", arguments: {} }
  };
  return legacy.fetch(new Request(request.url, {
    method: "POST",
    headers,
    body: JSON.stringify(probe)
  }), env);
}
async function readMcp(request) {
  const url = new URL(request.url);
  if (url.pathname !== "/mcp" || request.method !== "POST" || !request.headers.get("content-type")?.startsWith("application/json")) return null;
  const raw = await request.clone().text();
  if (raw.length > 16384) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function toolResult(id, result) {
  return responseJson({
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result
    }
  });
}
function toolError(id, error) {
  return responseJson({
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: error instanceof Error ? error.message : "Relay extension action failed" }],
      isError: true
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const message = await readMcp(request);

    if (message?.method === "tools/call" && isExtensionTool(message.params?.name)) {
      const auth = await authProbe(request, message, env);
      if (auth.status !== 200) return auth;
      try {
        const name = message.params.name;
        let result;
        if (name === uiApiTool.name) {
          result = await callUiApi(message.params?.arguments || {}, env);
        } else if (name === runnerCleanupTool.name) {
          const args = validateRunnerCleanupArguments(message.params?.arguments || {});
          result = await callRunnerCleanup(args, env);
        } else if (name === cloudUploadTool.name) {
          const args = validateCloudUploadArguments(message.params?.arguments || {});
          result = await callCloudUpload(args, env);
        } else if (isSourceTextMutationTool(name)) {
          const args = validateSourceTextMutationArguments(name, message.params?.arguments || {});
          result = await callSourceTextMutationTool(name, args, env);
        } else {
          const args = validateLifecycleArguments(name, message.params?.arguments || {});
          result = await callSourceLifecycleTool(name, args, env);
        }
        return toolResult(message.id ?? null, result);
      } catch (error) {
        return toolError(message.id ?? null, error);
      }
    }

    const response = await legacy.fetch(request, env);

    if (url.pathname === "/health" || url.pathname === "/") {
      return rewrite(response, patchVersion);
    }
    if (!message) return response;

    if (message.method === "initialize") return rewrite(response, patchVersion);
    if (message.method === "resources/list") {
      return rewrite(response, payload => {
        patchVersion(payload);
        if (payload?.result?.resources) payload.result.resources = augmentResourceList(payload.result.resources);
      });
    }
    if (message.method === "resources/read" && response.status === 200) {
      if (message.params?.uri === RELAY_CONTEXT_CARD_URI) return rpcResult(message.id ?? null, { contents: [relayContextCardResource()] }, response.headers);
      if (message.params?.uri === QA_SKILL_URI) return rpcResult(message.id ?? null, { contents: [qaSkillResource()] }, response.headers);
      if (message.params?.uri === LOEW_NAMING_SKILL_URI) return rpcResult(message.id ?? null, { contents: [loewNamingSkillResource()] }, response.headers);
    }
    if (message.method === "skills/list") {
      return rewrite(response, payload => {
        patchVersion(payload);
        if (payload?.result?.skills) payload.result.skills = augmentSkillList(payload.result.skills);
      });
    }
    if (message.method === "skills/get" && response.status === 200) {
      if (message.params?.uri === QA_SKILL_URI) return rpcResult(message.id ?? null, { skill: qaSkillCatalogEntry() }, response.headers);
      if (message.params?.uri === LOEW_NAMING_SKILL_URI) return rpcResult(message.id ?? null, { skill: loewNamingSkillCatalogEntry() }, response.headers);
    }
    if (message.method === "tools/list") {
      return rewrite(response, payload => {
        patchVersion(payload);
        if (payload?.result?.tools) payload.result.tools = augmentToolList(payload.result.tools);
      });
    }
    if (message.method === "tools/call" && ["relay_control_status", "relay_ui_control_center"].includes(message.params?.name)) {
      return rewrite(response, patchVersion);
    }
    return response;
  }
};
