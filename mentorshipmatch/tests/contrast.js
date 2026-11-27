// tests/contrast.js — checks every theme's color pairs against WCAG 2.2 AA.
// Run with:  npm run test:contrast
// Reads public/css/tokens.css directly, so it always tests the real values.
// Method (spec §3.5): sRGB → linear → relative luminance → (L1 + 0.05) / (L2 + 0.05).
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'tokens.css'), 'utf8');

// Collect "--name: #hex" declarations for :root and each html[data-theme="x"] block.
function block(selector) {
  const i = css.indexOf(selector + ' {');
  if (i < 0) return {};
  const body = css.slice(i, css.indexOf('}', i));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map(m => [m[1], m[2]]));
}
const base = block(':root');
const themes = { classic: base };
for (const t of ['ocean', 'dark', 'contrast']) themes[t] = { ...base, ...block(`html[data-theme="${t}"]`) };

const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = hex => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [foreground, background, minimum, description]
const TEXT = 4.5, UI = 3;
const PAIRS = [
  ['ink', 'bg', TEXT, 'body text on page'], ['ink', 'surface', TEXT, 'body text on cards'], ['ink', 'surface-2', TEXT, 'text on subtle panels'],
  ['ink', 'sage', TEXT, 'text on selected/sage'], ['muted', 'bg', TEXT, 'secondary text on page'], ['muted', 'surface', TEXT, 'secondary text on cards'],
  ['muted', 'surface-2', TEXT, 'secondary text on subtle panels'], ['muted', 'sage', TEXT, 'secondary text on sage'],
  ['brand', 'bg', TEXT, 'links on page'], ['brand', 'surface', TEXT, 'links on cards'], ['brand', 'sage', TEXT, 'active nav item'],
  ['accent', 'bg', TEXT, 'accent text on page'], ['accent', 'surface', TEXT, 'accent text on cards'],
  ['on-brand', 'brand', TEXT, 'primary button text'], ['on-brand', 'brand-hover', TEXT, 'primary button hover'],
  ['on-danger', 'danger', TEXT, 'destructive button'],
  ['ok-ink', 'ok-bg', TEXT, 'status: accepted'], ['warn-ink', 'warn-bg', TEXT, 'status: awaiting'], ['info-ink', 'info-bg', TEXT, 'status: information'],
  ['bad-ink', 'bad-bg', TEXT, 'status: cancelled/error'], ['cat-ink', 'cat-bg', TEXT, 'category label'],
  ['bad-ink', 'surface', TEXT, 'field error text'],
  ['on-band', 'hero-band', TEXT, 'text on brand band'],
  ['input-border', 'surface', UI, 'input borders (non-text)'], ['input-border', 'bg', UI, 'input borders on page'],
  ['focus', 'bg', UI, 'focus ring on page'], ['focus', 'surface', UI, 'focus ring on cards'],
];

let failures = 0;
for (const [name, t] of Object.entries(themes)) {
  console.log(`\n${name.toUpperCase()}`);
  for (const [fg, bg, min, what] of PAIRS) {
    if (!t[fg] || !t[bg]) { console.log(`  ?  missing --${fg} or --${bg}`); failures++; continue; }
    const r = ratio(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) failures++;
    console.log(`  ${ok ? '✓' : '✗'} ${r.toFixed(2).padStart(5)}:1 (needs ${min})  ${what}  [${t[fg]} on ${t[bg]}]`);
  }
}
console.log(failures ? `\n${failures} pair(s) FAIL.` : '\nAll pairs pass WCAG 2.2 AA.');
process.exit(failures ? 1 : 0);
