# loew-inspector

Canonical source and compatibility transport for the protected, read-only loew.fi inspector.

## Architecture

The canonical inspector protocol is the deployed MCP gateway at:

`https://inspector.loew.fi/mcp`

The gateway is protected by Cloudflare Access and exposes one read-only tool:

`fetch_loew_url`

It may read only `https://loew.fi` and HTTPS subdomains ending in `.loew.fi`.

## Normal ChatGPT compatibility

Normal ChatGPT on the current personal plan cannot directly register this private MCP as a callable app. The compatibility path is:

```text
normal ChatGPT
  -> Composio
  -> GitHub workflow_dispatch
  -> loew-inspector MCP
  -> protected loew.fi target
```

This GitHub Actions bridge is a transport shim, not the canonical inspector architecture.

## QA stance

Preview is runtime truth.

Do not create a second preview/runtime engine inside loew-runner or loew-inspector.

Inspector QA is optional external verification around Preview. It is useful for:

- protected-route reachability
- HTTP status / final URL checks
- Access-vs-origin failure isolation
- content marker checks
- deployment smoke tests
- later DOM/screenshot evidence and parity checks

That improves confidence without competing with Preview itself.

## Secrets

The compatibility workflow expects these GitHub Actions secrets:

- `CF_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET`

Never commit their values.
