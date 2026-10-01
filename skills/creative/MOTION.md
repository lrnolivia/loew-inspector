# Motion and microinteraction

Motion communicates state, continuity, focus, and causality. It is not confetti.

## Use motion for

- working / waiting / attention / verified state;
- navigation continuity;
- expanding evidence or detail;
- new information arriving without stealing focus;
- spatial relationship between overview and detail;
- acknowledging a successful bounded action.

## Relay motion language

Prefer quick, soft motion: restrained spring/blur or opacity/scale transitions, subtle icon glow/pulse for liveness, and low-amplitude ambient behavior. Avoid gradients-as-motion, looping decorative sweeps, excessive parallax, or animation that makes a system look active when evidence is stale.

A connected transport is not proof of active work. Never animate progress merely because time passes.

## Timing

Default interaction transitions should feel immediate. Use roughly 180-300ms for common UI transitions, longer only when the motion explains a meaningful spatial change.

## Accessibility

Respect reduced motion. Every animation must have a static state that preserves the same meaning. Live updates must not move the user's reading position or steal keyboard focus.

## Performance

Prefer transforms and opacity for frequent animation. Avoid effects that force expensive layout/paint on large regions. Coordinate with the performance pack for ambitious motion.
