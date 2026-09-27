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

### Normal ChatGPT field Preview QA

`qa-preview.yml` is one `workflow_dispatch` call from the same connected GitHub/Composio transport. Supply the full field PR head SHA, a correlation ID, and the matching **immutable** editor and Canvas deployment URLs in the Cloudflare Preview comment on that PR. The workflow calls `inspect.yml` for a protected runner read, then checks both Preview hosts from GitHub Actions and opens them in Chromium. It reports `LOEW_INSPECTOR_RESULT=` in the runner job and `LOEW_QA_RESULT=` in the Preview job, with browser screenshots attached to the run.

In a normal ChatGPT conversation, ask the connected GitHub tool to read the field PR head SHA and latest Cloudflare Preview comment, dispatch `lrnolivia/loew-inspector` workflow `qa-preview.yml` on `main` with `editor_url`, `canvas_url`, `head_sha`, and `request_id`, wait for completion, then read both job logs and the screenshot artifact. The two Preview URLs must have the same eight-character deployment prefix. A new PR commit requires a new Cloudflare deployment and a fresh QA run.

This is a Preview preflight: it verifies editor reachability, Canvas routing and isolation headers, and browser document load. Feature-specific interaction QA still follows field's browser Preview QA protocol. The inspector Worker itself currently receives Cloudflare `400` / `error code: 1053` when it fetches Worker Preview hosts, even though direct GitHub/browser requests can reach them. Therefore the workflow uses the inspector for the protected runner and a direct browser check for branch Previews. This limitation is explicit in the QA evidence; it does not weaken Access or make the inspector result appear green for a failed Preview.

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
