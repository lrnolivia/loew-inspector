---
name: relay-planning-planning-routing
description: Select a bounded next action from current resume, amendment and finding records while preserving acceptance and ownership.
---

# Planning and ledger routing

Relay planning starts from canonical state, not chat archaeology.

1. Read the latest valid resume checkpoint first.
2. Read only amendments newer than the worker's consumed cursor.
3. Scan relevant open findings and classify each as adopt, defer, reject, or supersede.
4. Prefer amending the best existing assignment when the finding belongs to work already in flight.
5. Create a successor only when independent ownership or a clean release boundary is genuinely required.
6. Keep ledger linkage/status current after the decision.

Assignment taxonomy is routing metadata, not authority. Category, labels, tags, primary role, and supporting roles inform filtering and skill selection while Runner owner/path/resource policy remains authoritative.

No-change amendment reads add no model context. Scope-changing or blocking changes force canonical reconciliation before more conflicting work.

## Inputs and outcome

Read live project/assignment registration, current claim, valid resume checkpoint, amendment cursor and relevant findings. Compare findings with existing open work before deciding to amend, defer, reject or propose an independently owned successor. Record the decision, evidence, acceptance linkage and next executable action through supported canonical tools.

Verify scope and ownership before implementation; planning metadata is not admission. If the cursor/history or owner disagrees with local memory, refresh and reconcile instead of continuing the stale plan. When the next action requires unavailable capability or human authority, park that path and select another admitted useful action. Never treat elapsed time as a released claim.
