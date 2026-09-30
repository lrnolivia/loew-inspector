# loew.fi access + control surfaces

Updated: 2026-09-30  
Status: migration in progress  
Authority: Runner operational documentation; live Cloudflare/GitHub state outranks this snapshot if they diverge.

## Purpose

This document records the canonical naming, current Cloudflare Access topology, relay plugin identity, migration state, and rollback rules for loew.fi control surfaces.

It exists because most of the current Zero Trust complexity grew out of the field pilot and the inspector/runner control path. That history must not become a rule that every loew.fi project needs its own Access application.

## Naming and product boundaries

Human-facing identities:

- `loew.fi` — parent/company
- `relay` — ChatGPT-facing control product and universal handoff surface
- `runner` — execution/orchestration/state backend
- `inspector` — runtime QA/evidence backend

Architecture:

- `loew.CONTROL` — underlying control architecture used by relay
- `source.CONTROL` — source-control subsystem
- `cloud.CONTROL` — cloud/infrastructure subsystem
- `runtime.VERIFY` — runtime/visual/deployment verification subsystem

Human-facing names stay lowercase. The `name.FUNCTION` form is for technical ownership and architectural systems.

Do not rename relay to runner merely because runner executes work. Relay is the surface a user hands work to; runner is one backend relay can use.

## Access applications are not projects

Cloudflare Access applications represent distinct authentication/trust boundaries.

They are **not** a registry of Runner-managed projects.

A new project does not get a dedicated Access app merely because it exists or is registered in Runner. Create another Access app only when the project genuinely needs a different audience, authentication method, trust relationship, or public/private boundary.

This explains why simpler/public projects such as `loewtorials` and `thetake` currently have no dedicated Access application. That absence is not itself a configuration gap.

Field has more Access surface because it was the guinea pig for private editor access, branch Preview, QA routes, inspector verification, and Runner integration.

## relay plugin

Current private ChatGPT plugin:

- product/display name: `relay`
- plugin backend ID: `plugins_6ab77ef4151c819183a37174b69ba08f`
- immutable backend/package name: `relay-github`
- current verified release: `0.4.1`
- current release ID: `pluginrel_6abc8b505c3c8191945ee8aee03e3b09`
- icon asset: `assets/relay.png` (Relay Loop mark)
- `composerIcon`: `./assets/relay.png`
- `logo`: `./assets/relay.png`

The immutable package name does not define the product identity.

Current skill/system names:

- `loew.CONTROL`
- `source.CONTROL`
- `cloud.CONTROL`
- `runtime.VERIFY`
- `field.OVERLAY` only for legacy field-specific compatibility when Runner still requires it

Some physical skill directories still use older names because Plugin Creator updates overlay files and do not delete old paths. Do not treat the directory names as canonical architecture.

Current implementation note: relay is the product-level router. GitHub/source writes are still proven through the connected Composio GitHub path; Cloudflare may use connected cloud tooling; the canonical MCP endpoint described below is still backed by the inspector gateway. Do not claim the MCP endpoint already aggregates every relay capability.

## Canonical MCP/OAuth ingress

Canonical endpoint:

`https://relay.loew.fi/mcp`

Cloudflare Access app:

- name: `relay`
- app ID: `5a1fef21-95e9-48e2-b9ab-c6f890726285`
- primary domain: `relay.loew.fi`
- compatibility destination retained: `relay-inspector.loew.fi`
- reusable human policy: `Only Me`
- Managed OAuth: enabled
- Dynamic Client Registration: enabled
- ChatGPT redirects:
  - `https://chatgpt.com/connector_platform_oauth_redirect`
  - `https://chatgpt.com/connector/oauth/*`
- access-token lifetime: 10m
- OAuth grant/session duration: 336h

Verified:

- `GET https://relay.loew.fi/mcp` returns the expected OAuth 401 challenge.
- `GET https://relay.loew.fi/.well-known/oauth-protected-resource/mcp` returns resource metadata pointing to `https://loewfi.cloudflareaccess.com`.
- ChatGPT successfully completed authentication against the relay endpoint on 2026-09-30.

Still required before old inspector OAuth removal:

- perform at least one real inspector tool invocation through the newly authenticated `relay.loew.fi/mcp`
- verify downstream protected field/runner access through the new relay-linked trust path
- inspect Access logs after the test and confirm the intended app/path was used

Observed caveat:

- `GET https://relay.loew.fi/health` currently returns a Cloudflare Access redirect from the overlapping broad `loew.fi private` app.
- Therefore, a public path override in one Access app must **not** be assumed to bypass another overlapping wildcard app.
- MCP OAuth discovery is verified despite this health-path overlap.

## Worker custom domains

Current `loew-inspector-gateway` Worker custom domains:

- `relay.loew.fi` — canonical product-facing hostname
- `relay-inspector.loew.fi` — compatibility hostname
- `inspector.loew.fi` — legacy hostname

The Worker name may remain implementation-specific. Product identity is determined by the public control surface, not the Worker script name.

Do not detach compatibility domains until clients and fallbacks have been verified idle.

## Universal private boundary

Cloudflare Access app:

- name: `loew.fi private`
- app ID: `56fc78e2-f03d-4e2b-a7ac-29be9763003a`
- destinations:
  - `loew.fi`
  - `*.loew.fi`

This is the shared private boundary for loew.fi properties that use the same trust model.

During migration it intentionally contains more than the target steady state:

- legacy reusable `loew-inspector` service-token trust
- reusable `Only Me`
- linked old `loew-inspector-mcp`
- linked `loew-inspector GitHub transport`
- linked `relay`

Target steady state is to keep the smallest trust set that still satisfies real runtime needs, ideally human `Only Me` plus relay-linked machine trust. Remove legacy trust only after live verification and traffic observation.

## field QA exception boundary

Cloudflare Access app:

- name: `field-qa`
- app ID: `467df74e-d415-4889-b90a-4a52e3912f24`
- reusable policy: bypass `Everyone`
- destinations include:
  - `field.loew.fi/builder/noauth`
  - `field.loew.fi/assets/*`
  - `field.loew.fi/qa/work/*`
  - `canvas.field.loew.fi/*`
  - `preview.field.loew.fi/*`

Keep this while it is the proven public-path exception mechanism.

After `field-access` was removed, external probes verified:

- `field.loew.fi/` remains protected by the universal private boundary
- `field.loew.fi/builder/noauth` remains reachable without Access authentication (application currently returned 404, which is an origin/app response rather than an Access block)
- `canvas.field.loew.fi/` returned 200
- `preview.field.loew.fi/` returned 200

Do not collapse `field-qa` into another app until the exact public-path behavior is proven under the replacement configuration.

## Legacy compatibility paths still in use

### old inspector MCP

- app name: `loew-inspector-mcp`
- app ID: `c6f650d8-2f90-481f-bd1d-3ea1710c36de`
- domain: `inspector.loew.fi`

Keep until the canonical relay MCP has completed a real authenticated inspector call and dependent clients have moved.

### GitHub transport

- app name: `loew-inspector GitHub transport`
- app ID: `e03969b6-ecb4-40d5-b66d-c11ac91ce7a1`
- domain: `loew-inspector-gateway.lrnoliv.workers.dev`
- service token ID: `fdb21fea-0b00-4672-9c63-40a07d4a6a62`

This is an active compatibility bridge.

A seven-day Access-log query ending 2026-09-30 showed 199 authentication events for this app. It is not safe to delete merely because the new relay endpoint exists.

## Removed redundant applications

Removed 2026-09-30:

- `runner-access` — ID `6e1fdcaf-fc90-4232-a07a-11df984d4eab`
- `loew-runner` — ID `ec330c27-6c33-425d-9a8a-3f6c1523c769`
- `loew-runner - Cloudflare Workers` — ID `5d54bda7-e928-4efe-899e-07e13eae410f`
- `field-access` — ID `428ef374-dae0-4c25-8ca8-460e6851bf91`

The three Runner-specific apps had no recent Access events in the inspected seven-day window and were already covered by `loew.fi private`.

`field-access` had historical traffic, so it was removed only after the broad private boundary and `field-qa` paths were re-probed and showed the intended protected/public split.

Do not recreate these apps just because an old note, screenshot, or handoff names them.

## Reusable-policy cleanup candidates

At the 2026-09-30 snapshot, these reusable policies had zero application references:

- `Cloudflare account members` — `6b229391-724f-490c-8ebd-90f7dc4001a5`
- `Everyone` (allow) — `01bb0c39-5424-41ad-9ce3-75dd2854dcdb`
- `field-qa-temporary` — `a4590326-217d-4e50-b123-121a290881f7`
- `One Time Pin` — `ffa071bf-eed5-47a8-b0b9-d3e7bf4d2e2d`
- `temporary-public-wa` — `01931b25-0227-436c-87dd-9065b503946c`

These are cleanup candidates, not instructions to delete blindly. Re-check `app_count` immediately before deletion.

Policies still referenced at this snapshot include:

- `Only Me`
- bypass `Everyone` used by `field-qa`
- legacy `loew-inspector` service-token policy while migration remains incomplete

## Legacy service token

Old service token:

- name: `loew-inspector`
- token ID: `af1bebf5-cdce-4ee0-9faa-7ab21a2c1d09`

Do not remove until its reference count is zero and downstream access has been proven through relay or another approved replacement.

## Safe migration rule

All Access/control migrations use an additive-first sequence:

1. snapshot live applications, policies, service tokens, Worker domains, and relevant traffic
2. add the replacement hostname/app/trust path without removing the old one
3. verify DNS/Worker routing
4. verify OAuth challenge and discovery
5. authenticate the real client
6. run an actual end-to-end tool/action through the new path
7. verify downstream protected resources
8. inspect Access logs to identify which app and transport are actually in use
9. remove one redundant/legacy layer at a time
10. immediately re-probe the affected protected and public paths
11. delete service tokens/policies only after references are zero
12. detach legacy Worker domains only after clients are moved and fallback traffic is absent

Temporary duplication is preferable to an outage.

## Recovery / rollback

If a migration step behaves unexpectedly:

- stop deleting
- refresh live Cloudflare state rather than trusting this document
- compare the failing path with the last-known-good compatibility path
- restore/add trust before removing more configuration
- use `inspector.loew.fi/mcp` or the GitHub transport as compatibility paths while they still exist
- preserve app IDs, policy IDs, service-token IDs, and hostnames in incident notes
- distinguish Access-layer failures from Worker/origin/product failures
- query Access logs before concluding an app is unused

A successful API write is not sufficient proof. Re-read configuration and probe the actual hostname/path.

## Desired steady state

The long-term shape should stay small:

- `relay` — one canonical ChatGPT-facing OAuth/MCP control identity
- `loew.fi private` — one shared private boundary for properties with the same trust model
- narrow exception apps such as `field-qa` only when a genuinely different public/private policy is required
- no per-project Access application by default
- no legacy service-token or bridge layers once direct replacement paths are proven and idle

The goal is simple shared infrastructure, not symmetry for its own sake.
