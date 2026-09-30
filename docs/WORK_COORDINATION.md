# Concurrent work admission and lifecycle

Authority: Bible section 20. All managed clients, including relay, use the same live Runner records. This contract owns execution process; product bibles remain source-authoritative in their repositories.

## Operating model

Chats and owners persist. Each coherent implementation task has one stable assignment, one isolated checkout, one temporary branch and one PR. A successor continues that same task and branch. Read-only research, reviews and queued tasks need no implementation branch. Finish and integrate useful batches before starting more; the backlog lives in Runner's queue.

Field permits **four active implementation branches total**, including imported active Mobile work. Each owner may hold one. Held and expired claims count against the limit and retain their paths/resources. Legacy recovery branches are frozen provenance outside this new-task budget; they cannot be reused to evade admission. Historical cleanup is governed by the existing consolidation ledger and is not automated by this feature.

Before edits or branch/worktree creation:

1. Read fresh Bible, project policy, coordination record and target Git state. Search claims and queue for the existing task first.
2. Acquire a SHA-checked claim in `coordination/<project>.json`. Declare exact files or directory prefixes ending in `/`, plus shared semantic resources such as `canvas-touch-input`, `mobile-shell`, `source-model` or `asset-ingest`. Claims reject conflicting paths/resources, duplicate task/owner/branch and excess concurrency.
3. Verify the committed remote claim. Only then create the claimed branch from live main and use a separate checkout. A claim does not create a branch, start a chat or promise QA.
4. Preflight current changed paths before each substantial batch, resume and publication. Renew with a next action at these checkpoints. Field's lease is 12 hours; heartbeat renews it. Leases are freshness checks, not permission to take ownership away.
5. If blocked or paused, hold the claim and preserve branch, diff and recovery action. On handoff, change the owner in the same record; keep assignment/branch/PR. Rescope atomically before touching additional files/resources.
6. Validate and merge through existing project policy, then complete with the merged PR and durable accounting of code, acceptance, QA and any explicit follow-up task IDs. Runner verifies the merged identity and cleans eligible managed branches. Local worktrees can be archived after needed files are preserved.

When slots are full or ownership conflicts, queue the next task and finish or reconcile current work. Another filename, owner alias, unpushed branch, continuation suffix or stacked PR is not an escape hatch. Sharing one checkout between concurrent writers is prohibited. Sharing a file requires serial ownership/handoff; different-file semantic overlap needs the same resource reservation.

## Deterministic tools

From an updated Runner checkout, use `node scripts/coordinate.mjs <action> field [request.json]`. It uses authenticated `gh` locally or `GH_TOKEN` in Actions. Credentials stay in the credential store/environment. No OpenAI API key or paid inference is needed.

`queue`, `claim`, `rescope`, `heartbeat`, `hold`, `handoff` and `complete` read the live remote main record and update it through GitHub Contents with its exact blob SHA. Concurrent writes cannot both replace the same revision: one loses, refreshes all claims and re-evaluates once. Do not commit a stale local coordination file to overwrite live ownership. Changes to policies and code remain normal PRs.

A claim request is a complete object like:

```json
{
  "id": "field-selection-bounds",
  "owner": "<actual persistent owner or chat id>",
  "branch": "field/selection-bounds",
  "paths": ["src/canvas/selection/SelectionBounds.ts"],
  "resources": ["selection-bounds"],
  "goal": "Correct selection bounds for rotated nodes",
  "acceptance": "Bounds match rendered geometry and preserve current resize behavior",
  "next_action": "Trace the current geometry calculation before editing"
}
```

Use actual paths; this example is not a project assignment. `queue` uses the same goal/acceptance/scope fields without a branch. `claim` captures live main SHA automatically. `rescope` requires id, owner, full replacement paths/resources and next_action. `heartbeat`/`hold` require id, owner and next_action. `handoff` also requires successor. A successor adopts the same owner ID only when they represent that actual persistent owner; otherwise use handoff.

`preflight` requires id, owner and the complete proposed/current changed file list as `paths`. Check both committed and uncommitted task changes against main; do not supply a cherry-picked subset. It verifies live ownership, lease, local declared paths and inventory findings. A passed preflight is coordination evidence, not a product or QA pass.

`complete` requires id, owner, pr, `work_accounted: true`, and `evidence` pointing to a durable completion/disposition record. The tool fetches the PR and records actual merged head and merge commit. An unfinished task is held; there is no blind release or expiration-based takeover operation.

When an assignment produced screenshot, image, or video QA evidence, durable work accounting also follows [Runner Visual Evidence Policy](VISUAL_EVIDENCE_POLICY.md). The completion record must reference the relevant Runner Visuals evidence/run ID(s). The producer does not wait for media transfer completion: a durable Visuals receipt in `queued` or `uploading` state is sufficient to hand off the bytes and continue. Runner owns background upload, retry, post-merge archive, storage-budget enforcement, and purge. Once the exact evidenced work is verified on the default branch and a compact archive bundle is durably committed to the configured visual archive repository, full-resolution working media is purge-eligible.

When the remaining criterion needs human judgment, populate Runner's QA helper according to [`contracts/human-qa-helper.json`](../contracts/human-qa-helper.json) and [Human QA Helper](HUMAN_QA_HELPER.md) before asking the user to review. The agent supplies the targeted questions/checklist from the assignment criteria and known uncertainty; the user is not asked to design the review. Machine-verifiable checks remain agent-owned. Human answers, notes, checklist state, and verdicts are bound to the exact reviewed artifact/evidence identity and become stale when that identity materially changes.

`audit` paginates all branches, open PRs and changed paths. It emits exact findings and exits 2 when action is needed. `cleanup` performs the same inventory and only removes completed, explicitly accounted, non-legacy managed branches whose current head exactly matches the recorded merged PR head. It re-reads ownership/head before deletion. It retains branches with new commits, active claims, excluded identities or incomplete evidence. New commits must never be pushed to a completed branch; create an admitted new task instead. GitHub's delete API lacks a conditional SHA transaction, so the final read and delete are not atomic against unauthorized concurrent writers; external writers must honor completed ownership, and branch protection remains the separate security boundary.

## Relay and remote chats

Relay clients bootstrap from current Runner authority and discover their connected source tools. They may dispatch `lrnolivia/loew-runner` workflow `coordination.yml` on main with `action`, `project`, and JSON `request`, then wait for that exact run and read its receipt. Dispatch acceptance alone is not admission. Refresh `coordination/<project>.json` to verify the actual resulting owner/state before editing.

If connected GitHub tools support Contents reads/updates, a relay client may perform the same protocol: read the live record and SHA, evaluate the complete policy against every active claim, PUT only this record with the expected SHA, refresh after conflict, and verify the result. Prefer workflow dispatch because it runs the shared rule engine instead of relying on a client's reproduction. No lock endpoint has been added to the relay MCP. Local CLI and relay share one registry.

Runner’s scheduled audit and Field’s scheduled cleanup run every 30 minutes, independent of the existing model scheduler. Runner uses its built-in repository token for atomic record writes; Field uses its own built-in token for branch deletion. Public cross-repository reads need no copied personal credential. Its summary and retained JSON receipt expose drift and cleanup results. GitHub Actions availability, scheduling delay and credentials can still block it; clients must read the live record and obey admission while that path is unavailable. Findings do not send messages to chats or create new workers.

## Enforcement and adoption

Atomic claims enforce the budget/ownership for clients using the protocol. Deterministic audits expose branches created outside it. Field’s PR workflow runs `pr-gate` against the current claim and exact PR changed paths. Install `Runner coordination admission` as a required main check after the workflow’s own setup PR passes. This blocks unregistered new task PRs from merging; frozen legacy recovery PRs retain an explicit exemption. It does not block GitHub branch creation globally or impersonate arbitrary chats. A later infrastructure integration can expose these same rules in Runner’s UI/API. Preserve existing GitHub required checks.

Field's existing Mobile #123 is imported as a held reservation with its live PR file scope and `existing-mobile-owner`. The actual owner must adopt/renew it or record an authorized handoff before further mutation. This import does not move ownership. Other legacy workers must be reconciled into current claims before they continue; updates to the legacy inventory require recovery evidence and an ordinary reviewed policy change, never a client appending a new branch to grandfather itself.

Runner 3.0 must use this engine and these records rather than introducing another queue or ownership truth. For a new project, register the coordination policy and record once. Defaults and branch prefixes remain project-specific.
