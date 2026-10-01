# Relay release pipeline

## Canonical path

Relay uses GitHub as the source of truth and Cloudflare Workers Builds as the normal production transport.

1. Work happens on an admitted branch and is reviewed through a pull request.
2. GitHub Actions runs the single Relay quality gate.
3. A green pull request merges to `main`.
4. Cloudflare Workers Builds checks out that Git commit directly from `lrnolivia/relay`.
5. Workers Builds runs `npm run build`.
6. Workers Builds runs `npx wrangler deploy` against the existing `relay` Worker.
7. Relay reads Cloudflare build/deployment state and verifies runtime behavior.
8. Rollback uses a known-good Worker version when needed.

Cloudflare exposes `WORKERS_CI_COMMIT_SHA` and build metadata for the originating commit, so exact-source provenance does not require Relay to download the repository and reconstruct a Worker upload.

## What Relay should not do in the normal release path

The following are recovery or diagnostic mechanisms, not the default publication path:

- downloading source files back out of GitHub through the Contents API in order to upload them to Cloudflare;
- splitting generated application payloads solely to fit a source-read transport limit;
- calling `relay_cloud_upload_version` for every ordinary release;
- repeating the same full test matrix after an exact head has already passed the canonical quality gate;
- holding branch capacity for completed, superseded, or missing-branch assignments.

`relay_cloud_upload_version` and explicit version deployment remain useful for rollback, bisecting, emergency recovery, and isolated diagnostics.

## CI contract

The Relay quality gate intentionally uses one runner for the normal test matrix:

- one repository checkout;
- one `npm ci`;
- one Chromium installation;
- `npm run build`;
- Relay 2.0 typecheck;
- the existing workspace, Runner, Inspector, contract, API, browser, and React tests;
- deterministic generated-bridge readback.

The Inspector visual-review job remains separate and only runs for the narrow review branch class that needs screenshot evidence.

## Workers Builds configuration

Connect the existing Cloudflare Worker `relay` to GitHub repository `lrnolivia/relay` with:

- production branch: `main`
- root directory: `/`
- build command: `npm run build`
- deploy command: `npx wrangler deploy`
- preview builds: optional; keep off until the production path is proven

Cloudflare's Git integration should own normal production transport. Relay owns orchestration, status, verification, recovery and rollback.

## Follow-up after the first successful Git-native production build

Once Workers Builds has deployed an exact `main` commit successfully, stop treating generated web payloads as publication artifacts. Move them fully to build time, remove them from version control, and ignore them in Git. That removes the remaining generated-file churn and permanently eliminates the file-size failure mode that exposed the old uploader bottleneck.
