# field runner report

## 2026-09-26 — pilot initialized

- target: `lrnolivia/field`
- mode: read-only
- schedule: hourly when enabled
- model: `gpt-6-sol`, medium reasoning
- live web search: enabled
- current state: disabled
- first gate: dependency doctor

## 2026-09-28 — interrupted editor batch recovered and shipped

- source truth: `lrnolivia/field@main`
- current field main after recovery: `0cca7b65cbcc9a1e5ce7d5805ec96860aa5522b1`
- PR #43 → `d9c580f33d8d81be0aca15c2ba7135996e8b3982`: fresh HTML-shell cache behavior; selection-color locate preserves workspace mode; floating/Compact Docked title-pill and document-identity transition.
- PR #44 → `f7754f22d918af3106c433a242f92ae0c7381f97`: Selection colors locate temporarily fits affected nodes and restores the pre-focus camera after the locate pulse; repeated locates preserve the original camera.
- PR #45 → `0cca7b65cbcc9a1e5ce7d5805ec96860aa5522b1`: Inspector auto-hide persists across workspace modes and now has Default/Floating/Compact/Compact Docked behavior; empty-canvas arrows map ↑ Floating, ↓ Default, ← auto-hide, → Compact Docked while selected-object arrow nudge remains intact.
- validation: Cloudflare `Workers Builds: field` succeeded on exact PR heads for #43, #44, and #45 before merge.
- visual QA: pending Lauren's browser pass for motion, temporary camera focus/restore, auto-hide timing, and arrow feel.
- scope note: PR #44 implements the concrete Selection-colors locate path. No separate Effects-row locate UI was invented because no corresponding effect-locate interaction exists in current source.
- record note: `state/field.json` still describes the legacy enabled API-backed Runner worker's blocked 429 state. It is not current Night Shift progress and was intentionally not rewritten as healthy.
