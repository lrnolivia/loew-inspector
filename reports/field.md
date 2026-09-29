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

## 2026-09-29 — field mobile Focus editor

- report/chat name: `field mobile Focus editor` (chosen from the primary goal because this chat's UI title is not available here).
- primary goal: make Focus the first-class phone editor without creating a mobile fork — same document graph, selection, commands, undo, source, and Preview, with touch-first operation and no persistent-keyboard requirement.
- implementation track: draft PR #123, branch `field/mobile-focus-touch-camera-20260929`.
- exact resume point: branch head `2d7ec772ca98ae9270c48a3ef31ff5cd936708da`, synced from current `main` `64fa810a66fc54d73c2f46ed2e352a8c3a3e568d`; PR remains open/draft with 8 commits and 11 changed files.
- batch 1 — two-finger camera: two fingers own pan + pinch; midpoint motion pans, finger-distance ratio zooms around the live midpoint, one finger remains free for direct manipulation, and touch end/cancel resets ownership.
- batch 2 — one-finger direct manipulation: tap routes through the existing selection model; dragging an object reuses `DragCoordinator`; dragging empty canvas becomes camera pan after threshold; empty tap still deselects; touch no longer starts desktop marquee; adding a second finger cancels/reverts pending one-finger state before camera takeover; desktop mouse/trackpad/marquee paths remain unchanged.
- batch 3 — portrait toolbar: compact portrait widths collapse the full bottom toolbar to one floating active-tool launcher that expands the existing command surface; safe-area-aware bottom spacing is included; landscape/wider Focus keeps the accepted traditional toolbar.
- batch 4 — mobile text keyboard: the canonical double-tap text-edit path remains in place; a synchronous parent-frame editable primer is focused on the trusted second tap so iOS can raise the software keyboard before sandbox TipTap takes over. No duplicate mobile text editor or persistent keyboard was introduced.
- branch continuity: the synced branch still contains the critical resume code in `src/canvas/hooks/useCanvasTouchInteraction.ts`, `src/canvas/transform/InputHandler.ts`, and the compact portrait implementation in `src/editor/BottomToolbar.tsx`. No mobile implementation is stranded only in chat/local state.
- latest exact-head validation: `Media tests + editor build` passed on `2d7ec772ca98ae9270c48a3ef31ff5cd936708da`. Physical-phone runtime QA is still required; do not claim touch or keyboard behavior is runtime-verified yet.
- remaining work: real-iPhone QA/fixes; portrait bottom-sheet host for Layers/Insert/Properties; landscape edge-anchored floating overlays; touch marquee/context gesture; enlarged invisible touch targets/precision polish; orientation and Safari safe-area/browser-gesture cleanup.
- panel constraint: do not bulldoze through active shared chrome/panel ownership. Take sheets/overlays when those files are free or coordinate explicitly; Focus itself should not be redesigned.
- next resume action: test the exact branch Preview on physical iPhone first. Fix any touch arbitration/keyboard defects found there before adding sheets. Then implement adaptive panel presentation using existing panel content: portrait = bottom sheet, landscape phone = floating edge overlay, wide enough = dock.
