# loew-runner agent bootstrap

Before doing project-execution work, read:

1. `contracts/manifest.json`
2. `LOEW_CHAT_BIBLE_CURRENT.md`
3. `LOEW_CHAT_BIBLE.md` (base law incorporated by the current authority file)
4. the applicable local Runner/Night Shift contract
5. the target project's own `AGENTS.md` / product instructions
6. live Git/runtime/control state

`LOEW_CHAT_BIBLE_CURRENT.md` is the current universal entry authority and incorporates `LOEW_CHAT_BIBLE.md` as base law. This repository owns universal execution process; target repositories own product truth.

Resolve the current repository from Runner project records and the target repository's live bootstrap before following historical handoffs. For field, the current target is **`lrnolivia/field`**. Do not fall back to historical `revyme-loewfi` / `revyme-loew` / `revyme-löew` repository names or old local checkout paths.

## Active field reorganization assignment

If the user asks to pick up the field cleanup/re-org, repository normalization, branch cleanup, or worker-silo reorganization task, read these before mutating field:

1. `assignments/field-repo-cleanup-reorg.json`
2. `docs/FIELD_REPOSITORY_REORGANIZATION.md`
3. `projects/field.json`
4. current field reports in `reports/`
5. fresh `lrnolivia/field` branch/PR/check state

The assignment is intentionally a reconciliation/migration task, not a license to absorb all field implementation. Mobile Focus and Runner/Inspector infrastructure are protected active ownership lanes. Fresh Git/Runner state outranks the assignment's snapshot.

Project QA files are overlays only. Bible section 11 controls QA engine routing, retry/watchdog behavior, classifications, fallbacks, danger-zone handoff, and promotion. A project may add paths and criteria; it may not silently replace Runner-first QA law.

If the Bible is temporarily unavailable, follow the emergency invariants embedded in the target repository bootstrap and avoid destructive or ambiguous mutations until canonical authority is restored.

## QA escape discipline

QA is bounded verification, not an infinite search for green.

Before runtime QA, read Bible section 11 plus the target project's QA overlay. Bind every result to the exact artifact/SHA actually tested.

Use the cheapest capable evidence path first:

1. HTTP/read-only inspection for reachability, status, headers, JSON, and redirects.
2. deterministic project checks and GitHub Chromium/Inspector recipes for routine web-visible QA.
3. Browser Run only when exploratory interaction or a live browser session adds unique value.
4. project-native or authenticated harnesses where the acceptance criterion requires them.

A Browser Run capacity error such as HTTP 429 is a harness-capacity state, not a product failure. Honor its retry metadata and use a deterministic fallback when one can prove the same criterion. Do not hammer the scarce engine.

For one acceptance criterion:

- the same failure fingerprint may occur at most twice without new evidence
- a clearly harness-owned defect gets at most one bounded repair cycle before the original check is retried
- a clearly local product defect may be self-corrected only from the first evidenced divergence, not by weakening assertions or hiding symptoms
- after a bounded repair, use at most one materially independent fallback path unless the project explicitly requires more
- if automated QA still cannot converge, stop the loop and classify the uncertainty

When automation is exhausted but the artifact is safe for human inspection, hand it to the **danger zone preview** instead of continuing speculative QA.

A danger zone handoff must be exact-SHA, isolated from production writes, excluded from automatic promotion, and accompanied by a compact human-QA packet containing the PR/branch/SHA, preview URL, acceptance criterion, known failures or uncertainty, evidence IDs/screenshots, exact reproduction steps, and the specific question the user needs to answer.

Do not use danger zone to bypass a repeatable product failure, security/auth boundary, destructive migration, data-integrity risk, required deterministic check, or missing authority. Those remain blockers.

After a danger zone handoff, stop mutating the product merely to chase QA. Resume only from new evidence, a user verdict, or a materially new hypothesis.

## Runner 3.0 human control plane

If the user asks to pick up Runner 3.0, the project-management dashboard, assignment UI, project overview, agent/worker topology, overlap management, repo hygiene, notes/tracker consolidation, handoff generation, or the human control-plane work, read:

1. `assignments/runner-3-human-control-plane.json`
2. `docs/RUNNER_3_0_HUMAN_CONTROL_PLANE.md`
3. fresh Runner main/dashboard/server state
4. current Runner/Inspector infrastructure ownership before changing capacity/execution logic

Runner 3.0 core workflows must not depend on paid model inference. Preserve existing visual evidence and scheduler controls while migrating to the project-first UI.

