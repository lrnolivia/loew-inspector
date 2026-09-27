# loew-inspector

Canonical source and compatibility transport for the protected, read-only loew.fi inspector.

## Architecture

The canonical inspector protocol is the deployed MCP gateway at:

`https://inspector.loew.fi/mcp`

The gateway is protected by Cloudflare Access and exposes one read-only tool:

`fetch_loew_url`

It may read only `https://loew.fi` and HTTPS subdomains ending in `.loew.fi`.

## Normal ChatGPT compatibility

The compatibility path for a normal ChatGPT conversation on the current Plus setup is:

```text
normal ChatGPT
  -> connected Composio GitHub action
  -> GitHub workflow_dispatch (inspect.yml)
  -> Access-protected workers.dev hostname
  -> the same loew-inspector MCP Worker
  -> protected loew.fi target
```

GitHub Actions calls `https://loew-inspector-gateway.lrnoliv.workers.dev/mcp`. The separate Access app on that hostname accepts only the `loew-inspector-github-bridge` service token. The Worker validates that app's Access JWT before handling the MCP request. The broad loew.fi Access app accepts a linked-app token from this authenticated inspector app for downstream reads. The user-facing `https://inspector.loew.fi/mcp` OAuth route remains available.

The workflow accepts only HTTPS loew.fi URLs and GET/HEAD, and fails unless the target response is HTTP 200. It preserves the inspector's HTML, JSON, and other supported read results in `LOEW_INSPECTOR_RESULT=` for the caller to read from the run log. This bridge transports the same MCP tool; it is not another inspector implementation.

Cloudflare Free-plan Bot Fight Mode challenged both GitHub's request and the inspector's downstream request before Access evaluated either one. Cloudflare does not support a path-specific skip for that feature, so Bot Fight Mode is off for the loew.fi zone. Browser Integrity Check, Security Level Medium, managed rules, and Access remain enabled. Revisit this if the zone moves to Super Bot Fight Mode, which supports a scoped skip.

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

The compatibility workflow uses:

- repository variable `CF_ACCESS_CLIENT_ID`
- repository secret `CF` (the matching Access client secret)

Never commit their values.
