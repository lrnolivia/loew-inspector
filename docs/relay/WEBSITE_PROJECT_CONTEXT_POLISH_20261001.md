# Current website fixes — Julian-PM implementation

Assignment: `relay-website-project-context-polish-20261001`.
Branch: `relay/website-project-context-polish-20261001`.
This is a draft review batch; merge and production deployment require further authorization.

The approved desktop/tablet visual language remains the baseline. Today, Runner,
Night Shift and Inspector now place the project context between the page heading
and telemetry. No project query means All Projects; an explicit hash query scopes
content and survives existing document navigation, reload and history. No new
project-selection persistence policy was introduced.

Telemetry is a shared, ordered responsive mosaic. Every summary remains present,
with semantic SVGs from the existing rounded family, neutral surfaces in the five
approved roles, and no colored card-edge strips. The global multicolor strip and
canonical page/header brand images remain. Inspector work-item screenshot cards
and conversational MCP cards were not rebuilt.

The collapsed sidebar keeps a small stacked Relay icon/name tile, with a lighter
neutral surface only on that tile. Other navigation remains icon-only. Expansion
overlays a stable content rail, fixing missed clicks caused by focus-driven page
movement. The rail fills the viewport on short and long pages. Mobile shows all
four destinations together and a compact two-column overview. Theme and Refresh
Tools share one compact accessible utility menu.

Lauren's subsequent review additions are part of this same canonical acceptance.
The paintbrush provides complete presentation presets, grouped Customize options,
Custom state and reset. Preferences are local to this browser. Approved/Simple is
the default; alternative presets test bottom mobile navigation, a roomier overview
and richer count visuals. Rich shows discrete markers from actual available counts
(up to twelve), not invented timelines or progress. A finite spring entrance uses
brief movement-bound blur and settles to sharp readings. Calm and system reduced
motion disable that animation. The preset registry can accept future complete
presentation themes without shipping unfinished theme choices or workflow flags.

## Verification and evidence

Use Node 22, `npm ci`, `npm run build`,
`npm run typecheck:2.0 --workspace @relay/web`, and `npm test`.
`project-context.test.mjs` verifies the built website at 320,390,900,1024 and1440px:
project scoping, document round trips, reload/history, simultaneous metrics,
semantic glyphs, exact neutral tokens, header identity, mobile targets, full-height
rail, local presets/reset, honest pending/error states and reduced/finite motion.
Existing API, workspace, contract, React, Inspector and navigation checks remain.
PR106's bounded assignment reads, progressive startup and minute polling remain.

The exact-head draft CI runs the same aggregate checks, then builds with the PR
head as source identity. `visual-review.mjs` captures settled fixture success and
clearly labelled partial/error states at desktop/tablet/mobile widths, selected
project context and Rich/bottom variants. Every capture records head/build,
viewport, route, state, actual summary text/geometry and hash. The existing protected
CI ingest registers those bytes in Runner Visuals, checks stored-image readability,
and prepares artifact-specific questions as pending QA notes without a human
verdict. Receipts and screenshots are retained in the CI artifact.

Local fixture screenshots prove this source/layout; they are not production
acceptance. Final PR description and exact-head CI receipt identify the tested
commit, evidence IDs, test results and any remaining evidence/QA limitations.
Lauren's Library images and representative carousel frames were materialized
locally with supported helpers and inspected before implementation.

Deferred work-item view architecture, notification replacement and Nico's MCP
inline-card work remain outside this batch. No production deployment is created
for testing.
