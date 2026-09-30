# runner — current state

Updated: 2026-09-29. Baseline inspected: `1fec12ce7b7271afc3eeeb9fd8b73368a25f61db`.

## Verified implementation

- Release/package: 0.6.0; hosted UI is worker-first with Visual evidence.
- `src/server.mjs` is the local adapter; `src/cloudflare-worker.mjs` is the hosted adapter. Hosted settings and Visual API are not implemented in the local adapter.
- Runner 3.0 exists as approved spec and assignment, not deployed product.
- Field reorganization is a separate assignment. Current `field/` branch enforcement remains until compatibility is proved.
- Runner/Inspector infrastructure work is protected. The 3.0 worker owns dashboard/data-model integration, not provider scheduling or capacity policy.
- No first-class Team registry exists yet. Historical reports do not prove current chat liveness.

## Baseline repository cleanup ledger

Inventory observed 2026-09-29 from fetched remote refs and GitHub's complete open-PR page (one PR). Counts below are Git ancestry, not semantic equivalence. No branches or PRs have been deleted/closed.

| Remote branch | Ahead / behind main | Unique work | Disposition |
| --- | --- | --- | --- |
| `main` | 0 / 0 | authoritative baseline | KEEP — integration truth |
| `control` | 0 / 57 | none by ancestry; old bootstrap tree | KEEP PROTECTED — designated future mutable control branch; not a stale task branch |
| `shared-repair-reconciler` | 2 / 29 | `d7189f4`, `cce07e9`; workflow, reconciler, tests, contract/project metadata | KEEP ACTIVE — open PR #4; infrastructure ownership; do not transplant or close from UI scope |
| `status/field-runner-authority-20260929` | 1 / 8 | `4d8020b`; single field authority report | QUARANTINE/REVIEW — preserve provenance, inspect source authority before transplant/archive |

Open PR #4: **Automate field shared repair reconciliation**, head `cce07e91e089d040c35db48fecd69cdc841a4028`. A historical red check alone does not condemn this branch. Its infrastructure owner must handle promotion.

Temporary local build checkpoints are separate from this remote baseline. `runner/3-a-control-plane` preserves early unshipped modules; baseline reconciliation precedes their integration.

## Documentation cleanup

- README's mixed 0.1 pilot instructions, planned deployment and dependency snapshots are superseded as the entry point; exact original preserved at `docs/archive/README-0.6-baseline.md`.
- This file owns current verified state and the cleanup ledger. README routes; architecture owns durable structure; 3.0 spec owns approved intent.
- Existing `reports/` are provenance, not canonical implementation state or Team registration. They remain intact until structured supersession/reference proof exists.
- Universal Bible/current authority and Night Shift contracts remain authoritative and unchanged.
- No speculative first-class worker identities have been created.

## Next gates

1. Finish baseline reconciliation and verify checks on its exact PR head.
2. 3.0-A: project/assignment/Team read surfaces, deterministic overlap and attention, live branch/PR inventory, notes inventory. Preserve Visual/automation controls.
3. 3.0-B: guarded writes and cleanup proof with audit events. Use optimistic concurrency; no direct target main writes.
4. 3.0-C: structured consolidation and deterministic handoffs; prose conflicts remain reviewable.
5. 3.0-D: consume existing infrastructure records; show unknown when capacity has no authoritative measurement.
6. 3.0-E: runtime/accessibility verification and final replacement cleanup. Version 3.0 only after release acceptance.
