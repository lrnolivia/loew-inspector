# Live amendment sync and caught-up recovery

Workers keep a monotonic amendment cursor. They check only at bounded synchronization points: start/resume, before major source/commit/PR/deploy transitions, after external waits, and normal heartbeat cadence.

If nothing changed, inject nothing. Never replay the full amendment history.

New changes are classified:
- informational;
- plan-adjusting;
- scope-changing;
- blocking.

Scope-changing/blocking updates require canonical reconciliation before conflicting work continues. A cursor older than retained amendment history also forces reconciliation instead of guessed replay.

Caught-up recovery may resume from the latest valid checkpoint when Relay has evidence of a stale/frozen worker or sustained no-progress. It must not fire through real external waits, human review, authorization/tool-schema/client blockers, destructive ambiguity, or scope conflicts. Recovery attempts are bounded to prevent loops.

A successful recovery may emit a capability/tool lesson for future planning. It never emits staff productivity rankings.
