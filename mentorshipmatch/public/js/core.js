/* core.js — shared foundation used by every page.
   - html`` template tag: escapes every value (prevents XSS)
   - api(): fetch wrapper with field-level errors and request cancellation
   - icon(): inline SVG icons (Feather Icons, MIT License)
   - dialogs: openDialog / confirmDialog (native <dialog>, focus restored on close)
   - router: MM.route(pattern, view, options)
   - formatting: dates/times in the viewer's own time zone */
'use strict';

const MM = window.MM = { state: { user: null, config: { mode: 'demo' } }, routes: [] };
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Safe HTML ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = s => new Raw(s);
function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    const piece = v instanceof Raw ? v.s : Array.isArray(v) ? v.map(x => (x instanceof Raw ? x.s : esc(x))).join('')
      : v === false || v === null || v === undefined ? '' : esc(v);
    out += piece + strings[i + 1];
  });
  return raw(out);
}

// ---------- Icons (Feather Icons, MIT License — https://feathericons.com) ----------
const ICONS = {
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  'chevron-right': '<polyline points="9 18 15 12 9 6"/>', 'chevron-left': '<polyline points="15 18 9 12 15 6"/>',
  'chevron-down': '<polyline points="6 9 12 15 18 9"/>',
  'arrow-right': '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  'arrow-left': '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  trending: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  droplet: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  pen: '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  'user-check': '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  edit: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  pause: '<circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  award: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
};
const icon = (name, cls = '') => raw(`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`);

const INDUSTRY_ICONS = { Technology: 'code', Healthcare: 'activity', Engineering: 'tool', 'Business & Marketing': 'trending',
  'Law & Government': 'file', 'Science & Research': 'droplet', Finance: 'dollar', Education: 'book', 'Arts & Media': 'pen', 'Skilled Trades': 'tool' };
const INDUSTRIES = ['Technology', 'Healthcare', 'Engineering', 'Business & Marketing', 'Law & Government', 'Science & Research', 'Finance', 'Education', 'Arts & Media', 'Skilled Trades'];

// ---------- API ----------
async function api(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, { method, signal, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    const err = new Error('Could not reach the server. Check that it is running and try again.'); err.network = true; throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Something went wrong.'); e.status = res.status; e.field = data.field; throw e; }
  return data;
}

// ---------- Feedback ----------
let toastTimer;
function toast(message, type = 'ok') {
  const t = $('#toast');
  t.className = 'toast show' + (type === 'error' ? ' error' : '');
  t.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 4000);
}
// Show an API error next to the right field (falls back to a form-level alert).
function showFormError(form, err) {
  clearFormErrors(form);
  const field = err.field && form.querySelector(`[data-field="${err.field}"]`);
  if (field) {
    field.classList.add('has-error');
    const msg = field.querySelector('.field-error');
    if (msg) msg.innerHTML = html`${icon('alert')}<span>${err.message}</span>`;
    const input = field.querySelector('input, select, textarea');
    if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
    return;
  }
  const box = form.querySelector('.form-alert');
  if (box) { box.hidden = false; box.innerHTML = html`${icon('alert')}<p>${err.message}</p>`; box.focus?.(); }
  else toast(err.message, 'error');
}
function clearFormErrors(form) {
  $$('.has-error', form).forEach(f => f.classList.remove('has-error'));
  $$('.field-error', form).forEach(e => { e.innerHTML = ''; });
  $$('[aria-invalid]', form).forEach(e => e.removeAttribute('aria-invalid'));
  const box = form.querySelector('.form-alert'); if (box) box.hidden = true;
}
// Prevent duplicate submissions and show progress on a button.
async function withBusy(btn, fn) {
  if (!btn || btn.getAttribute('aria-busy') === 'true') return;
  btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
  try { return await fn(); } finally { btn.removeAttribute('aria-busy'); btn.disabled = false; }
}

// ---------- Field helper: label + input + hint + error slot, all linked for screen readers ----------
let fieldSeq = 0;
function field({ name, label, type = 'text', value = '', hint = '', required = false, attrs = '', options, rows, cls = '' }) {
  const id = `f-${name}-${++fieldSeq}`;
  const describedBy = `${id}-err${hint ? ` ${id}-hint` : ''}`;
  let control;
  if (options) control = html`<select id="${id}" name="${name}" ${raw(required ? 'required' : '')} aria-describedby="${describedBy}" ${raw(attrs)}>${options.map(o => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return html`<option value="${v}" ${raw(String(v) === String(value) ? 'selected' : '')}>${l}</option>`;
  })}</select>`;
  else if (type === 'textarea') control = html`<textarea id="${id}" name="${name}" rows="${rows || 4}" ${raw(required ? 'required' : '')} aria-describedby="${describedBy}" ${raw(attrs)}>${value}</textarea>`;
  else control = html`<input id="${id}" name="${name}" type="${type}" value="${value}" ${raw(required ? 'required' : '')} aria-describedby="${describedBy}" ${raw(attrs)}>`;
  return html`<div class="field ${cls}" data-field="${name}">
    <label for="${id}">${label}${required ? '' : html` <span class="t-meta">(optional)</span>`}</label>
    ${control}
    ${hint ? html`<p class="hint" id="${id}-hint">${hint}</p>` : ''}
    <p class="field-error" id="${id}-err" aria-live="polite"></p></div>`;
}

// ---------- Dialogs ----------
const dialog = () => $('#dialog');
let lastFocus = null;
function openDialog(content, { wide = false, label = 'dialogTitle' } = {}) {
  const d = dialog();
  lastFocus = document.activeElement;
  d.className = wide ? 'wide' : '';
  d.setAttribute('aria-labelledby', label);
  d.innerHTML = content;
  d.showModal();
  const first = d.querySelector('[autofocus], input:not([type=hidden]):not([type=radio]), textarea, select, button:not(.dlg-close)');
  (first || d).focus();
  return d;
}
function closeDialog() { const d = dialog(); if (d.open) d.close(); }
document.addEventListener('DOMContentLoaded', () => {
  dialog().addEventListener('close', () => { if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); });
  dialog().addEventListener('click', e => { if (e.target.closest('[data-close]')) closeDialog(); });
});
const dialogHead = title => html`<div class="dialog-head"><h2 id="dialogTitle">${title}</h2>
  <button type="button" class="icon-btn dlg-close" data-close aria-label="Close dialog">${icon('x')}</button></div>`;

/**
 * Confirmation dialog for cancellations, moderation and deletion.
 * reason: { label, required, hint } adds a reason field; typeToConfirm: "Exact Name" requires typing it.
 * Resolves to { reason, typed } or null if cancelled. `action(values)` may throw an API error,
 * which is shown inside the dialog next to the field.
 */
function confirmDialog({ title, body = '', confirmLabel = 'Confirm', danger = false, reason, typeToConfirm, action }) {
  return new Promise(resolve => {
    const d = openDialog(html`${dialogHead(title)}
      <form class="dialog-body form" novalidate>
        ${body ? html`<div>${body}</div>` : ''}
        <div class="alert alert-error form-alert" role="alert" hidden tabindex="-1"></div>
        ${reason ? field({ name: reason.name || 'reason', label: reason.label, type: 'textarea', rows: 3, required: reason.required, hint: reason.hint || '' }) : ''}
        ${typeToConfirm ? field({ name: 'confirmName', label: html`Type <strong>${typeToConfirm}</strong> to confirm`, required: true, attrs: 'autocomplete="off"' }) : ''}
        <div class="dialog-foot" style="padding:0">
          <button type="button" class="btn btn-secondary" data-close>Go back</button>
          <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${confirmLabel}</button>
        </div>
      </form>`);
    let done = false;
    const form = d.querySelector('form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      clearFormErrors(form);
      if (reason?.required && String(values[reason.name || 'reason'] || '').trim().length < 5)
        return showFormError(form, { field: reason.name || 'reason', message: 'Write a short reason (at least 5 characters).' });
      if (typeToConfirm && values.confirmName !== typeToConfirm)
        return showFormError(form, { field: 'confirmName', message: `Type ${typeToConfirm} exactly to confirm.` });
      try {
        if (action) await withBusy(form.querySelector('[type=submit]'), () => action(values));
        done = true; closeDialog(); resolve(values);
      } catch (err) { showFormError(form, err); }
    });
    d.addEventListener('close', () => { if (!done) resolve(null); }, { once: true });
  });
}

// ---------- Formatting (always the viewer's local time zone) ----------
const fmt = {
  tzName: () => new Intl.DateTimeFormat(undefined, { timeZoneName: 'long' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || Intl.DateTimeFormat().resolvedOptions().timeZone,
  tzShort: iso => new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(iso ? new Date(iso) : new Date()).find(p => p.type === 'timeZoneName')?.value || '',
  date: iso => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
  dateLong: iso => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  time: iso => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  when: iso => `${fmt.date(iso)} · ${fmt.time(iso)} ${fmt.tzShort(iso)}`,
  sqlDate: s => new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z'),
  ago: s => {
    const d = fmt.sqlDate(s), mins = Math.round((Date.now() - d) / 60000);
    if (mins < 1) return 'just now'; if (mins < 60) return `${mins} min ago`;
    const h = Math.round(mins / 60); if (h < 24) return `${h} hr ago`;
    const days = Math.round(h / 24); if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  },
  plural: (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`,
};
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const to12h = hhmm => { const [h, m] = hhmm.split(':').map(Number); const d = new Date(2000, 0, 1, h % 24, m); return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
const tags = csv => String(csv || '').split(',').map(t => t.trim()).filter(Boolean);

// ---------- Router ----------
// MM.route('/mentors/:id', view, { auth: true, roles: ['mentee'], layout: 'app'|'public', title })
MM.route = (pattern, view, opts = {}) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  MM.routes.push({ pattern, re, keys, view, ...opts });
};
MM.go = hash => { if (location.hash === hash) MM.render(); else location.hash = hash; };
MM.query = () => new URLSearchParams(location.hash.split('?')[1] || '');
MM.path = () => (location.hash.replace(/^#/, '').split(/[?#]/)[0] || '/');
MM.anchor = () => { const m = location.hash.match(/^#[^#]*#([\w-]+)/); return m ? m[1] : ''; };
