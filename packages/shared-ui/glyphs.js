// A 24px family with deliberately heavy, rounded geometry. Motion is CSS-only.
const shapes = {
  today: '<rect x="4" y="5" width="16" height="16" rx="5"/><path d="M8 3v4m8-4v4M4 11h16"/><circle cx="12" cy="16" r="1.8" fill="currentColor" stroke="none"/>',
  projects: '<rect x="3" y="3" width="7" height="7" rx="2.5"/><rect x="14" y="3" width="7" height="7" rx="2.5"/><rect x="3" y="14" width="7" height="7" rx="2.5"/><rect x="14" y="14" width="7" height="7" rx="2.5"/>',
  review: '<path d="M3 12c4-8 14-8 18 0-4 8-14 8-18 0Z"/><circle class="glyph-detail" cx="12" cy="12" r="3"/>',
  moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  previous: '<path d="m15 5-7 7 7 7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  more: '<g class="glyph-detail" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/></g>',
  move: '<path d="M3 8h18m-4-4 4 4-4 4M21 16H3m4-4-4 4 4 4"/>',
  minimize: '<path d="M5 12h14"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  pause: '<path d="M8 5v14m8-14v14"/>',
  repair: '<path d="M14 4a6 6 0 0 0-7 7l-4 4a3 3 0 0 0 6 6l4-4a6 6 0 0 0 7-7l-4 4-4-4Z"/>',
  save: '<path d="M5 3h12l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  neutral: '<rect x="4" y="4" width="16" height="16" rx="5"/><path d="M9 12h6"/>'
};
export function glyph(name) {
  const kind = Object.hasOwn(shapes, name) ? name : "neutral";
  return '<svg class="relay-glyph glyph-' + kind + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' + shapes[kind] + '</svg>';
}
