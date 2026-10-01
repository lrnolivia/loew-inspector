# Visual performance

Keep rich visual behavior GPU-friendly and bounded.

Prefer transform/opacity animation. Be cautious with large animated blur, backdrop-filter, box-shadow, masks, filters, and continuously repainted regions. Limit simultaneous ambient animations and pause nonessential motion when the surface is hidden or reduced motion is requested.

Charts/data visualization should render only the resolution the user can perceive. Avoid redrawing unchanged data.

Images should use appropriate dimensions/formats and avoid shipping oversized assets merely to downscale them in CSS.

If an effect is expensive, first seek a cheaper implementation that preserves the same visual idea. Remove or simplify the effect only when measurement shows the experience still fails its budget.
