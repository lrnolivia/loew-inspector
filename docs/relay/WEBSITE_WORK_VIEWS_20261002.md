# Combined website catch-up — 2026-10-02

## Scope and authority

Lauren requested completion of the unfinished Relay work, explicitly ordering earlier Mac polish plus the modular work viewer first, retained interactive previews second, and MCP cards last (05:35:44 UTC, Sentinel_023b7a5341e88191b2e80a5dfcf2aad5). Complete Field preview is between retained previews and MCP cards. Later instructions authorize product decisions, recoverable blocker repairs and completion/release within existing safety/access boundaries (05:46–05:48). Uncertain changes retain rollback paths.

Bulk semantics were explicitly accepted: Clear is reversible archive, Complete handles a review item without closing any task or PR. No production records are bulk-changed by this implementation or tests.

The former post-release polish branch delivered PR117 mobile repairs only; that merged branch is retired as superseded. Its remaining criteria are carried into this existing work-viewer assignment. Earlier unpublished Mac files remain on the offline Mac. This batch reconstructs missing requirements against current source, not a claim of byte-for-byte Mac recovery. Stopped workers were not restarted.

## Implementation checklist

- Shared query/filter/sort/selection/action model with optional List/Visual presentations, stable canonical item identities, source state and next action, real Inspector captures and semantic visuals elsewhere.
- Explicit selected/current-filter/all-project loaded-result scopes, review preview before applying, per-item CAS, reversible archive, restore, reopen, undo and honest partial-failure reporting. Review bookkeeping is separate from source execution and QA answers. New meaningful source revisions reopen review. Unknown priority is unranked; source activity drives time, not polls.
- Existing R2 binding stores bounded review metadata; existing authenticated operator gateway and stricter human-write guard remain in place. No credentials, access grants, billing or protection changes.
- Slimmer aligned mobile/desktop floating navigation, original sidebar unchanged, safe-area clearance and usable hit targets. Gear settings; obsolete header/roomy-overview values migrate while supported preferences survive.
- Whole notification badge is red; reduced motion and Calm retained. New-work notifications use first-success baselines and durable session identities, with exact item routes.
- Project bar alphabetic with recent meaningful unseen changes in a raised promoted row. Acknowledged revisions return to alphabetical ordering. Navigation groups subordinate platform utility work under loewOS and the unmanaged RTX dependency fork under rtxForge, without repository or coordination identity changes.
- Rich summary ratios only when both numerator and relevant denominator are known, with explicit count labels. No manufactured completion/trend.
- Inspector chat-card studio collapsed initially, preview counter removed, original art preserved.
- Available cross-origin live previews no longer silently switch to captures because DOM access is restricted. Readiness requires exact source/origin/nonce; otherwise the frame is explicitly unconfirmed with an allowed direct-preview link. Framing/auth policy stays intact.

## Verification and remaining work

Local pure model/CAS tests pass; JS parsing checked. Full exact-head build, typecheck, API/browser tests and screenshot review are still pending at this checkpoint. Not deployed or complete. Additional browser fixtures cover reversible bulk review, source-state preservation, selection/view/sort/search/reload, supported settings migration and project grouping.

Retained isolated interactive builds remain the second batch; this batch does not pretend a metadata pointer preserves deployments. MCP host parity stays last. Native iPhone / Linux-app host acceptance remains distinct from Chromium fixtures.

## Rollback

Review metadata is additive under work-review/v1 in the existing evidence bucket. This batch never modifies source task/PR status or replaces existing QA answers. Revert this PR's product commit to restore the prior UI/runtime; leave additive review metadata intact for recovery. Unsupported presentation choices migrate to approved defaults, and reset is available. Do not delete old local Mac files or snapshots.

## Motion amendment (06:22–06:24 UTC)

Lauren requested an animation research pass before motion changes in the current Relay and Field runs, then explicitly selected **Field's existing animated glyphs as the cross-product golden standard**. Preserve their forms and nearly finished animation, port them to Relay, and improve surrounding interface morphing, momentum and transition continuity. This applies to future work; add a Relay-build skill teaching the canonical reuse and verification workflow. Do not treat Relay's current bespoke glyph family as the new standard. Exact Field source inspection and cross-repository package/provenance plan are pending while the shared GitHub App quota resets.

Research basis: Apple's spring API preserves velocity under interruption (https://developer.apple.com/documentation/swiftui/animation/spring); HIG Motion requires purposeful brief, cancellable feedback (https://developer.apple.com/design/human-interface-guidelines/motion?changes=l_9_3); Apple Reduce Motion criteria explicitly call out animated blur/depth effects (https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria); web.dev recommends measuring paint/composite cost and notes blur is expensive (https://web.dev/articles/animations-guide). Follow Field's real source and runtime before choosing tokens or introducing a library.
