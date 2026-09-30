# relay agent bootstrap

Universal execution authority:
- `lrnolivia/loew-runner@main/LOEW_CHAT_BIBLE.md`
- `lrnolivia/loew-runner@main/contracts/manifest.json`

Read those before project work. This repository is canonical Relay source and owns its product and implementation truth. Non-product documentation (handoffs, notes, trackers, state, decisions, research, operations, assignments, QA records, release history) lives in `lrnolivia/loew-runner` under `docs/loew-inspector/`; write new ones there, never here. See Bible section 18.

Composio is valid for remote GitHub/control-plane operations on any platform. An authorized local clone may also be used where available; local availability does not disable Composio.

If Runner is temporarily unreachable, use conservative fallback behavior: refresh live state, do not invent evidence, bound identical retries, change strategy instead of looping, verify writes, preserve authority/ownership boundaries, park only the blocked path, and persist the next safe action. Reload the canonical Bible as soon as access returns.


Consolidation rule: canonical source is `lrnolivia/relay`. Until the control-state migration batch completes, Runner authority may remain explicitly bound to `lrnolivia/loew-runner`; do not infer that the old repository is canonical Relay source.
