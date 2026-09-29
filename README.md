# loew-inspector

Canonical source, browser evidence engine, and compatibility transport for protected read-only loew.fi inspection.

## Gen 2 visual evidence

Gen 2 keeps `fetch_loew_url` for bounded HTTP/Access diagnostics and adds Cloudflare Browser Run as an independent runtime-evidence path.

```text
normal Chat / plugin / GitHub fallback
              ↓
        loew-inspector
       ↙              ↘
HTTP diagnostics    Browser Run
                         ↓
                  rendered screenshot
                  DOM/a11y snapshot
                         ↓
                 private R2 evidence
                         ↓
                    runner / visual
```

Current Gen 2 read-only tools:

- `fetch_loew_url`
- `browser_screenshot`
- `browser_snapshot`

Browser navigation is still restricted to HTTPS `loew.fi` and `*.loew.fi`. The inspector forwards its authenticated Access JWT as a browser request header; credentials are never embedded in URLs or returned in evidence metadata. Redirect validation remains in the HTTP diagnostic path.

Screenshots and their metadata are stored privately in the `loew-inspector-evidence` R2 bucket. Normal Chat receives a compact evidence id/key record rather than depending on binary MCP image relay.

The Browser Run Quick Actions used in Batches 1–2 are intentionally stateless and do not expose a console/network event stream. `browser_snapshot` marks those fields unsupported rather than pretending an empty list means no errors. Interactive Browser Run sessions in Gen 2 Batch 3 add those traces.

`capture.yml` is the normal-Chat compatibility fallback. It mirrors the existing Composio → GitHub Actions transport and prints `LOEW_INSPECTOR_RESULT=` with the durable evidence id.

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

`qa-preview.yml` is one `workflow_dispatch` call from the same connected GitHub/Composio transport. Supply the full field PR head SHA, a correlation ID, and the matching **immutable** editor and Canvas deployment URLs in the Cloudflare Preview comment on that PR. When editor behavior depends on real saved project state, also supply `project_id`; the workflow will open the branch build at `/qa/work/<project_id>` instead of the disposable `/builder/noauth` route. The workflow calls `inspect.yml` for a protected runner read, then checks both Preview hosts from GitHub Actions and opens them in Chromium. It reports `LOEW_INSPECTOR_RESULT=` in the runner job and `LOEW_QA_RESULT=` in the Preview job, with browser screenshots attached to the run.

In a normal ChatGPT conversation, ask the connected GitHub tool to read the field PR head SHA and latest Cloudflare Preview comment, dispatch `lrnolivia/loew-inspector` workflow `qa-preview.yml` on `main` with `editor_url`, `canvas_url`, `head_sha`, and `request_id`, wait for completion, then read both job logs and the screenshot artifact. The two Preview URLs must have the same eight-character deployment prefix. A new PR commit requires a new Cloudflare deployment and a fresh QA run.

This is a Preview preflight: it verifies editor reachability, Canvas routing and isolation headers, and Canvas iframe first paint in a browser. Feature-specific interaction QA still follows field's browser Preview QA protocol. The inspector Worker itself currently receives Cloudflare `400` / `error code: 1053` when it fetches Worker Preview hosts, even though direct GitHub/browser requests can reach them. Therefore the workflow uses the inspector for the protected runner and a direct browser check for branch Previews. A plain HTTP probe of the editor's `/builder/noauth` route also returned `404` while Chromium loaded the same route with `200`; the workflow records that probe but gates on browser runtime evidence. These transport differences remain visible in the QA evidence; Access was not loosened.

Verified on field PR #19 at head `c871cc9afaf7dfae517665c5c8f2eea8f37ebe77`: [QA run 36297329899](https://github.com/lrnolivia/loew-inspector/actions/runs/36297329899) was dispatched and read through the connected Composio GitHub action. Both jobs passed: protected runner returned HTTP 200 through inspector, and Chromium loaded the immutable editor/Canvas deployment `8a2a8555` with Canvas iframe first paint and all four isolation headers. The browser screenshots are attached to the run. This proves the connected GitHub action can invoke the new workflow; the earlier run 36296334657 separately proved that connection from a normal ChatGPT conversation.

`schedule-preview-qa.yml` checks all open `lrnolivia/field` PRs hourly. For each PR head, it reads the matching successful Cloudflare deployment row, takes the paired immutable editor/Canvas URLs, and dispatches `qa-preview.yml` once for that head. It uses this repository's scoped `GITHUB_TOKEN`; no new Access credential is shared with runner. Missing deployments are recorded in `LOEW_PREVIEW_SCHEDULER_RESULT=` and are never guessed. A new commit gets a new QA run. The scheduler looks back through recent QA workflow runs to avoid repeat dispatches; very old unchanged heads may eventually be rechecked after the run history window rolls over.

This scheduled check is the QA evidence producer. Runner's separate development agent is still a disabled, read-only pilot, so a green Preview run does not mean autonomous development or merge promotion is active. Normal ChatGPT can read the workflow evidence through Composio and use it when steering work.

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
