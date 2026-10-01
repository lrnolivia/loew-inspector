import { glyph } from './glyphs.js';
// Presets are complete presentation settings; future themes can extend this registry.
const presets = { approved: { label: 'Approved · default', settings: { nav: 'top', overview: 'compact', brand: 'compact', richness: 'simple', motion: 'full' } }, bottom: { label: 'Mobile bottom navigation', settings: { nav: 'bottom', overview: 'compact', brand: 'compact', richness: 'simple', motion: 'full' } }, roomy: { label: 'Roomy mobile overview', settings: { nav: 'top', overview: 'roomy', brand: 'roomy', richness: 'simple', motion: 'full' } } };
presets.rich = { label: 'Rich telemetry', settings: { ...presets.approved.settings, richness: 'rich' } };
const defaults = presets.approved.settings;
const choices = { nav: ['top', 'bottom'], overview: ['compact', 'roomy'], brand: ['compact', 'roomy'], richness: ['simple', 'rich'], motion: ['full', 'calm'] };
const brush = '<svg class="relay-glyph" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m13 12 7-8a2 2 0 0 0-3-3l-8 7Z"/><path d="M11 13c2 5-3 8-8 7 2-1 0-5 3-7 2-1 3-1 5 0Z"/></svg>';
export function presentationMenu() {
  return `<details class="presentation-menu"><summary aria-label="Presentation and tools" title="Presentation and tools">${brush}</summary><div class="presentation-panel"><strong>presentation</strong><p>Only this browser · <span data-presentation-state>Approved</span></p><label>Presentation preset<select name="preset">${Object.entries(presets).map(([id,preset]) => `<option value="${id}">${preset.label}</option>`).join('')}<option value="custom" disabled>Custom</option></select></label><details class="presentation-customize"><summary>Customize</summary><fieldset><legend>Mobile</legend><label>Navigation<select name="nav"><option value="top">Top · default</option><option value="bottom">Bottom · try it</option></select></label><label>Mobile overview<select name="overview"><option value="compact">Compact · default</option><option value="roomy">Roomy</option></select></label></fieldset><fieldset><legend>Desktop / tablet</legend><label>Sidebar brand<select name="brand"><option value="compact">Small tile · default</option><option value="roomy">Roomier tile</option></select></label></fieldset><fieldset><legend>Telemetry / motion</legend><label>Data visuals<select name="richness"><option value="simple">Simple · default</option><option value="rich">Rich · count markers</option></select></label><label>Motion<select name="motion"><option value="full">Spring · default</option><option value="calm">Calm</option></select></label></fieldset></details><button type="button" data-presentation-reset>Reset presentation</button><div class="presentation-tools"><button id="theme-toggle" class="utility-button" type="button"><span class="utility-icon" aria-hidden="true">${glyph('sun')}</span><span class="utility-label">Light mode</span></button><a id="app-settings" class="utility-button" href="https://chatgpt.com/settings/plugins-settings/plugin_asdk_app_6abe234861d881919e30db65d656492f" target="_blank" rel="noreferrer"><span class="utility-icon" aria-hidden="true">${glyph('refresh')}</span><span class="utility-label">Refresh tools</span><span class="utility-arrow" aria-hidden="true">↗</span></a></div></div></details>`;
}
export function bindPresentation() {
  const menu = document.querySelector('.presentation-menu');
  if (!menu) return () => {};
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('relay-presentation') || '{}'); } catch {}
  let prefs = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, choices[key].includes(saved?.[key]) ? saved[key] : value]));
  const apply = () => {
    const preset = Object.entries(presets).find(([, preset]) => Object.keys(defaults).every(key => preset.settings[key] === prefs[key]));
    menu.querySelector('[name="preset"]').value = preset?.[0] || 'custom';
    menu.querySelector('[data-presentation-state]').textContent = preset?.[1].label || 'Custom';
    for (const [key, value] of Object.entries(prefs)) {
      document.documentElement.dataset['presentation' + key[0].toUpperCase() + key.slice(1)] = value;
      menu.querySelector(`[name="${key}"]`).value = value;
    }
  };
  const change = event => {
    const { name, value } = event.target;
    if (name === 'preset' && presets[value]) prefs = { ...presets[value].settings };
    else if (choices[name]?.includes(value)) prefs[name] = value;
    else return;
    apply();
    try { localStorage.setItem('relay-presentation', JSON.stringify(prefs)); } catch {}
  };
  const reset = () => { prefs = { ...defaults }; apply(); try { localStorage.removeItem('relay-presentation'); } catch {} };
  const escape = event => { if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); } };
  const outside = event => { if (!menu.contains(event.target)) menu.open = false; };
  document.addEventListener('pointerdown', outside);
  apply(); menu.addEventListener('change', change); menu.querySelector('[data-presentation-reset]').addEventListener('click', reset); document.addEventListener('keydown', escape);
  return () => { document.removeEventListener('pointerdown', outside); menu.removeEventListener('change', change); menu.querySelector('[data-presentation-reset]').removeEventListener('click', reset); document.removeEventListener('keydown', escape); };
}

// Discrete units, never a fabricated timeline, percentage or trend.
export function countVisual(value) {
  if (!/^\d+\+?$/.test(String(value))) return '';
  const count = Number.parseInt(value, 10);
  return '<span class="signal-data-visual" aria-hidden="true" title="One marker per item; up to twelve shown">' + Array.from({length: Math.min(count, 12)}, (_, i) => '<i style="--unit:' + i + '"></i>').join('') + '</span>';
}
