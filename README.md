# runner

The loew.fi control plane for project work, repository coordination, scheduled automations and Inspector evidence.

Runner 3.0 is the approved next release. The current implementation is still the **0.6 worker/visual dashboard**. Projects, first-class Team, assignment management, overlap, repo hygiene and consolidation are not shipped yet.

## Start here

- [AGENTS.md](AGENTS.md): mandatory agent bootstrap and assignment routing.
- [docs/STATE.md](docs/STATE.md): current implementation, ownership and cleanup ledger.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): durable technical structure.
- [Runner 3.0 spec](docs/RUNNER_3_0_HUMAN_CONTROL_PLANE.md): approved product direction and tranche acceptance criteria.
- [Runner 3.0 assignment](assignments/runner-3-human-control-plane.json): executable work.
- [Field cleanup assignment](assignments/field-repo-cleanup-reorg.json): separate field repository reorganization; not owned by the Runner UI worker.

## Run locally

Node 22 or newer; no package installation is required for the current application.

```sh
npm run dashboard
npm run check
npm test
```

The dashboard opens at `http://localhost:4242`. Existing local controls support automation enable/pause, run-now and field dependency Doctor/Repair dispatch. Hosted Cloudflare controls additionally support runtime settings and R2 visual evidence. These are separate adapters; local parity must be verified before claiming a new feature works in both.

## Credentials and cost

`RUNNER_GITHUB_TOKEN` is required for hosted GitHub controls and workflow dispatch. Production controls require Cloudflare Access. Secrets stay on the server.

`OPENAI_API_KEY` is needed only for model-backed scheduler execution. ChatGPT subscription allowances do not fund API inference. Runner 3.0's project management, overlap, hygiene, status consolidation and handoffs must work without paid inference.

Current scheduled automations live in `workers/`; they are not first-class PJM/Master/Worker chats and cannot wake arbitrary ChatGPT/Codex threads. They remain available while 3.0 moves them under Infrastructure → Automations.

## Deployment and safety

The hosted Worker entry point is `src/cloudflare-worker.mjs`, assets are `dashboard/`, and configuration is `wrangler.jsonc`. See `scripts/deploy-cloudflare.sh` for the source deployment path.

Target product repositories remain authoritative for code and product truth. Runner owns execution policy and durable coordination. Runtime/control truth is intended to converge on `control`; current legacy worker settings/state still use `main`. Do not imply that migration has happened.

No force push, promotion bypass, invented QA pass or deletion of unaccounted unique commits. Provider/harness failure is distinct from product failure. Existing Runner/Inspector infrastructure work is protected active ownership.

Historical pilot instructions are preserved in [the 0.6 README archive](docs/archive/README-0.6-baseline.md); they are provenance, not current operational state.
