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
5. Tool input comes from `ui/notifications/tool-input`.
6. Tool output comes from `ui/notifications/tool-result`.
7. Widget helper actions use standard `tools/call`.
8. `window.openai` is optional and is used only for ChatGPT-specific features that MCP Apps does not cover, such as `requestModal`.
9. The visible card renders from the render-tool result. QA-media helper calls may enrich it later but cannot gate first paint.

## What was wrong with v6

The v6 widget treated the presence of `window.openai` as a reason to skip the standard `ui/initialize` handshake and instead depended on compatibility globals such as `window.openai.toolOutput` and `openai:set_globals`. OpenAI's current guidance is standards-first, and the May 2026 lifecycle update explicitly moved some input delivery into MCP Apps notifications. That old branch is a concrete explanation for the historical symptom where ChatGPT mounted an iframe but the card could stay blank.

The separate later symptom—no iframe appearing when Relay is invoked through a nested orchestration/Code Mode tool path—must not be confused with the blank-frame bug. MCP App UI metadata belongs to the model-visible MCP tool call. A nested Relay call is not accepted as consumer UI-mount proof unless ChatGPT explicitly surfaces the nested tool's UI metadata.

## Preserved

This reset intentionally preserves the approved card CSS, feature marks/art, state/tone mappings, staff presentation, progress/check/PR modes, technical-evidence disclosure, and Inspector QA-media behavior. The transport/bootstrap is replaced; the visual design is not redesigned.

## Consumer gate

After merge/deploy and plugin refresh, acceptance requires a fresh ordinary ChatGPT conversation where Relay is selected and ChatGPT directly invokes `relay_render_context_card`. The card must visibly mount populated in the conversation. A successful server call observed only inside an outer orchestration tool is insufficient.
