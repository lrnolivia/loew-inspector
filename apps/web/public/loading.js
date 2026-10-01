// Decorative placeholders share the space and rhythm of the content they replace.
export function loadingMarkup(kind = "rows", label = "Loading content") {
  const line = width => `<span class="skeleton-block skeleton-line" style="--skeleton-width:${width}%"></span>`;
  const row = `<div class="skeleton-row"><span class="skeleton-block skeleton-icon"></span><div class="skeleton-copy">${line(52)}${line(82)}${line(36)}</div></div>`;
  const card = `<div class="skeleton-card"><span class="skeleton-block skeleton-thumbnail"></span><div class="skeleton-copy">${line(48)}${line(80)}${line(60)}</div></div>`;
  const shapes = kind === "tabs" ? Array(3).fill('<span class="skeleton-block skeleton-tab"></span>').join("")
    : kind === "review" ? card + card
    : kind === "preview" ? '<span class="skeleton-block skeleton-preview"></span>'
    : kind === "project" ? `<div class="skeleton-heading">${line(30)}${line(62)}</div>${row}${row}`
    : row + row;
  return `<div class="content-skeleton skeleton-${kind}" role="status" aria-label="${label}"><div aria-hidden="true">${shapes}</div></div>`;
}
export function showLoading(target, kind, label) {
  if (target) target.innerHTML = loadingMarkup(kind, label);
}
