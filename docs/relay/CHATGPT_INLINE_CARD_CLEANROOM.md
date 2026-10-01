# ChatGPT inline card clean-room

Research date: 2026-10-01

## What ChatGPT supports

Inline MCP App UI is a normal ChatGPT conversation surface. The model-visible render tool links itself to a registered UI resource with `_meta.ui.resourceUri`. The resource is served as `text/html;profile=mcp-app`; ChatGPT mounts it in an iframe alongside the conversation and sends tool lifecycle data over the MCP Apps JSON-RPC bridge.

Current OpenAI references:
- https://developers.openai.com/plugins/build/chatgpt-ui
- https://developers.openai.com/plugins/build/app-quickstart
- https://developers.openai.com/plugins/concepts/ui-guidelines
- https://developers.openai.com/plugins/reference
- https://developers.openai.com/plugins/changelog
- https://developers.openai.com/plugins/deploy/troubleshooting

## Clean contract

1. `relay_render_context_card` remains the dedicated model-visible render tool.
2. Its `_meta.ui.resourceUri` points to one immutable card resource identity.
3. The card resource is `text/html;profile=mcp-app`.
4. The iframe always sends `ui/initialize`, then `ui/notifications/initialized`.
5. Tool input normally comes from `ui/notifications/tool-input`; on a ChatGPT remount Relay may also hydrate the already-persisted invocation from `window.openai.toolInput`.
6. Tool output normally comes from `ui/notifications/tool-result`; when ChatGPT remounts historical UI without replaying that notification, Relay may hydrate the persisted `window.openai.toolOutput` and subscribe to `openai:set_globals` as compatibility fallbacks.
7. Widget helper actions use standard `tools/call`.
8. `window.openai` is additive compatibility only: it never replaces the MCP Apps `ui/initialize` / `ui/notifications/initialized` handshake. ChatGPT-only helpers such as `requestModal` remain optional enhancements.
9. If a historical remount provides input but no output through either path, Relay performs one bounded read-only `relay_runner_progress` recovery call and renders current canonical state instead of leaving an empty iframe.
10. UI resource URIs are immutable cache identities. Any HTML, JS, or CSS change rotates both Relay card resource URIs before deployment.

## What was wrong with v6

The v6 widget treated the presence of `window.openai` as a reason to skip the standard `ui/initialize` handshake and instead depended on compatibility globals such as `window.openai.toolOutput` and `openai:set_globals`. OpenAI's current guidance is standards-first, so v7 correctly made the MCP Apps bridge primary. However, OpenAI issue #195 documents a separate remount failure: ChatGPT can recreate a historical MCP App iframe without replaying `ui/notifications/tool-result`, while the compatibility globals still retain the historical tool data. Removing every compatibility hydration path therefore made v7 spec-clean but vulnerable to a known host lifecycle gap.

## Why v8 / status-card v2 exists

The remount hotfix keeps the standard MCP Apps bridge primary and restores only additive hydration fallbacks. Relay first accepts standard tool input/result notifications, then checks persisted ChatGPT compatibility globals, listens for `openai:set_globals`, and finally performs one bounded canonical progress read if the host supplies invocation input but no historical output. The card shell must never remain blank while Relay has enough project context to recover. The resource identities rotate to `context-card/v8.html` and `status-card/v2.html` so ChatGPT cannot reuse stale widget code from cache.

The separate later symptom—no iframe appearing when Relay is invoked through a nested orchestration/Code Mode tool path—must not be confused with the blank-frame bug. MCP App UI metadata belongs to the model-visible MCP tool call. A nested Relay call is not accepted as consumer UI-mount proof unless ChatGPT explicitly surfaces the nested tool's UI metadata.

## Preserved

This reset intentionally preserves the approved card CSS, feature marks/art, state/tone mappings, staff presentation, progress/check/PR modes, technical-evidence disclosure, and Inspector QA-media behavior. The transport/bootstrap is replaced; the visual design is not redesigned.

## Consumer gate

After merge/deploy and plugin refresh, acceptance requires direct ordinary-ChatGPT tool invocations, not nested orchestration evidence. In browser: render at least three cards in one conversation, reload or leave/revisit that same conversation, and verify the historical cards repaint rather than becoming blank frames. In native desktop: directly invoke the Relay render tool and verify an inline MCP App surface mounts; desktop non-mount is tracked as a separate client compatibility gate rather than treated as unsupported by definition. A successful server call observed only inside an outer orchestration tool is insufficient.
