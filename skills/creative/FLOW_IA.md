# Flow and information architecture

Design around the user's next decision, not the data model.

## Sequence

For each surface, define:
1. what the user needs to know on arrival;
2. the primary action or decision;
3. supporting context needed before that action;
4. what becomes available only after intent is clear;
5. the return path and preserved context.

Use progressive disclosure to keep technical evidence, history, and secondary controls available without competing with the human-facing task.

## State inventory

Before implementation, cover meaningful states: loading, empty, active, waiting, blocked, failed, stale, reconnecting, ready for review, delivered/completed, and permission/capability unavailable when relevant.

Do not design only the happy path.

## Navigation

Keep identity stable across overview -> detail -> deeper product transitions. Preserve project/work/selection context and a clear way back. A richer destination should reveal more, not reset the user's mental model.

## Content hierarchy

Lead with plain language: what is happening, why it matters, and what happens next. Subordinate hashes, branch names, transport details, raw logs, and machine IDs unless they explain a blocker or support a concrete review decision.

## Density

Prefer useful information at a glance over decorative whitespace. On narrow layouts, stack rather than hide or require horizontal scrolling unless the interaction itself is inherently horizontal.
