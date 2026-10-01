# Performance budgets

Ambitious visual design is allowed. Performance is a design constraint, not a reason to make everything plain.

Before implementation, identify the expensive parts: large media, animation, blur/filter, shadow, canvas/WebGL, charts, long lists, live updates, network fan-out, or large client bundles.

## Budget posture

Define measurable expectations appropriate to the surface:
- initial useful content should appear quickly;
- interactions should respond without perceptible lag;
- scrolling and common motion should remain smooth;
- background/live update work should be bounded;
- hidden/offscreen UI should not keep doing expensive work;
- payloads and retained history should remain bounded.

Prefer lazy/deferred loading for secondary history/evidence. Virtualize genuinely large lists. Batch live updates and preserve reading position.

Measure before flattening the design. Optimize the expensive implementation while preserving the approved visual thesis whenever practical.
