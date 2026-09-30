# Consolidation execution checkpoint — 2026-09-30

Assignment remains in progress. No original branch was deleted, no original PR was closed, no product change was merged, and no new worker was created. The latest user direction defers the reported panel fixes and requests instructions only; see the linked requirements addendum.

## Published validation recovery

Draft [field PR #133](https://github.com/lrnolivia/field/pull/133), branch `field/consolidation-validation-baseline-20260930`, exact head `cc38e107fedd1b33088bf64dd6534f6d3d97965f`, based on main `0ea02501704e61d5133477d69fe677ad53295a56`.

Recovered the semantically identical nested SWC helper lock entry from #129/#132 and #129's strict npm ci, dependency triggers and cancellation. Original #129/#132 remain retained.

Node 22.23.3/npm 10.9.9 results:
- Untouched main clean install: FAIL, missing `@swc/helpers@0.5.23` lock entry (dependency/lock drift).
- Candidate clean install: PASS, 424 packages installed.
- Candidate editor, Canvas and Preview production builds: PASS.
- Candidate full suite: 65 files failed, 918 passed, 2 skipped; 61 tests failed, 12,779 passed, 34 skipped, 3 todo; one unhandled error. Source is identical to main apart from the lock entry/workflow. Failure families include ProjectFS test doubles missing subscribeWrites, file URL harness errors, stale structure assertions and unresolved behavior assertions. This does not prove all failing assertions are stale or Mobile-owned.
- Candidate lint: FAIL, 113 errors and 3,010 warnings. Do not bypass required gates.
- Exact-head Media tests/editor build CI: PASS, Actions run `36671721317`.
- Exact-head Workers build: PASS, build `779ef0ba-53ac-4a07-bb99-2407601fe23f`.

## Local recovery candidates, not published

Canvas WIP is isolated at `/tmp/field-consolidation-canvas-20260930`, local branch `field/consolidation-canvas-20260930`, from the validation prerequisite. Frame click/default size, shortcut and fixtures were recovered from `stage0/figma-frame-group-parity`; no diagnostics-only workflow or parity-pass documentation was copied. 133 focused unit tests passed. Desktop Chromium first reproduced six failures. A bounded harness correction waits for stable rendered geometry and records geometry after selection/tool activation rather than across camera/pane setup; tolerances and expected behavior remain intact. The subsequent eight-test gate passed seven and retained one Group child-motion/refit failure (untouched child shifts ~78.95px). Frame click/Space tests separately passed. This is NOT Frame/Group parity completion. No touch-input claim is made from those mouse/keyboard tests. Investigate the remaining first divergence before promotion.

Workspace/Dashboard WIP is isolated at `/tmp/field-consolidation-dashboard-20260930`, local branch `field/consolidation-workspace-20260930`. Recovered project delete confirmation/menu dismissal, rename hardening, navigation/collection accessibility and empty-state coverage from #5/#8/#10/#11/#13/#14. Preserved current main's immediate new-project flow, refresh and thumbnail behavior rather than restoring the old wizard. Recovered wizard focus code remains dormant; do not claim that user-visible feature was shipped. 36 focused tests pass; the broader Dashboard sweep retains the existing placeholder-structure assertion failure. No authenticated persistence or exact-Preview QA was performed, and the candidate is not published.

Mobile panel experiments were removed from `/tmp/field-consolidation-mobile-20260930`; the working tree is clean and HEAD remains `0a4c2cef6ce9a76dcc9011466956266bd00feb73`. Desktop panel experiments were also removed from the Workspace candidate. No panel fix was committed, pushed or deployed. Discarded experimental files/logs in `/tmp/field-consolidation-20260930` are diagnostic context only, not approved implementation.

Runner introduced atomic admission during this execution. Re-read current main's Bible section 20 and `docs/WORK_COORDINATION.md` before further edits or publication. Do not publish the local recovery branches under competing claims. The live held Mobile claim owns shared shell paths and the lockfile; reconcile serial ownership before resuming a conflicted task. Keep one active branch per owner, and queue subsequent recovery work.

## Next actions

1. Preserve PR #133 and its exact evidence; coordinate the shared validation/lockfile reservation before promotion or further source edits.
2. Keep Canvas and Workspace candidates isolated. Queue/admit recovery under the new Runner policy, adopting one coherent task at a time; no new continuation branches.
3. Resolve the remaining Group motion/refit divergence, then exact-head validation and Preview QA. Recover viewport/header changes only after reconciling Mobile overlap.
4. Complete Dashboard reconciliation and authenticated/runtime gates, then continue the original ordered handoff through left-panel, Controls and Assets closeout.
5. The reported connected-panel repairs stay deferred until the user resumes them. The accepted requirements are now in Runner, not silently folded into a candidate.
6. Complete semantic and unique-merge accounting before any branch/PR retirement. Historical inventory is retained; consolidation is not complete.
