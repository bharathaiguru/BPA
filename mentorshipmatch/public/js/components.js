/* components.js — reusable UI pieces (spec §25): avatar, status/category labels, mentor card,
   session card, empty state, skeletons, page header, tag input, repeatable rows, and the
   shared request / review / report dialogs. */
'use strict';

// ---------- Avatar (deterministic color; all colors pass 4.5:1 with white text) ----------
const AVATAR_COLORS = ['#174C3C', '#7A3E1D', '#3B4F8A', '#6A3D7C', '#2F5F6B', '#8A3B4E', '#4E5A2A'];
const initials = n => String(n || '?').replace(/^(Dr|Mr|Ms|Mrs)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const avatar = (name, id, size = '') => html`<span class="avatar ${size}" style="background:${AVATAR_COLORS[(Number(id) || 0) % AVATAR_COLORS.length]}" aria-hidden="true">${initials(name)}</span>`;

// ---------- Status labels (state) — always text + icon, never color alone ----------
const STATUS = {
  request_mentee: { pending: ['Awaiting response', 'warn', 'clock'], accepted: ['Accepted', 'ok', 'check'], declined: ['Declined', 'bad', 'x'] },
  request_mentor: { pending: ['New request', 'info', 'inbox'], accepted: ['Active connection', 'ok', 'check'], declined: ['Declined', 'neutral', 'x'] },
  session: { requested: ['Awaiting confirmation', 'warn', 'clock'], confirmed: ['Confirmed', 'ok', 'check'], completed: ['Completed', 'neutral', 'check-circle'], cancelled: ['Cancelled', 'bad', 'x'] },
  approval: { pending: ['Awaiting approval', 'warn', 'clock'], approved: ['Approved', 'ok', 'check'], rejected: ['Not approved', 'bad', 'x'] },
  flag: { open: ['Open', 'warn', 'flag'], resolved: ['Resolved', 'ok', 'check'], dismissed: ['Dismissed', 'neutral', 'x'] },
  account: { active: ['Active', 'ok', 'check'], suspended: ['Suspended', 'bad', 'lock'] },
};
const statusLabel = (kind, value) => {
  const [text, tone, ic] = STATUS[kind]?.[value] || [value, 'neutral', 'info'];
  return html`<span class="status status-${tone}">${icon(ic)}${text}</span>`;
};
const category = name => (name ? html`<span class="category">${name}</span>` : '');
const starRow = r => html`<span class="stars" aria-hidden="true">${[1, 2, 3, 4, 5].map(i => icon('star', i <= Math.round(r || 0) ? 'filled' : ''))}</span>`;
const ratingText = (rating, count) => count
  ? html`${starRow(rating)} <strong>${Number(rating).toFixed(1)}</strong> <span class="t-muted">(${fmt.plural(count, 'review')})</span><span class="sr-only">Rated ${rating} out of 5</span>`
  : html`<span class="status status-info">New mentor</span>`;

const pageHead = (title, sub = '', actions = '') => html`<div class="page-head"><div><h1 class="t-app-title">${title}</h1>${sub ? html`<p>${sub}</p>` : ''}</div>${actions ? html`<div class="row">${actions}</div>` : ''}</div>`;

const emptyState = ({ ic = 'info', title, body = '', action = '' }) =>
  html`<div class="empty">${icon(ic)}<h3>${title}</h3>${body ? html`<p>${body}</p>` : ''}${action ? html`<div class="row" style="justify-content:center">${action}</div>` : ''}</div>`;

const skeletonCards = (n = 4) => html`<div class="mentor-grid" aria-hidden="true">${Array.from({ length: n }, () => html`
  <div class="mentor-card"><div class="mc-head"><span class="skel skel-circle"></span><div><div class="skel skel-line" style="width:55%"></div><div class="skel skel-line" style="width:75%"></div></div></div>
  <div class="skel skel-line" style="width:90%"></div><div class="skel skel-line" style="width:70%"></div><div class="skel skel-line" style="width:40%;height:36px;margin-top:16px"></div></div>`)}</div>`;

// ---------- Mentor card (directory, recommendations, saved, public explore) ----------
function mentorCard(c, { publicView = false } = {}) {
  const link = publicView ? `#/mentor/${c.id}` : `#/users/${c.id}`;
  const top = tags(c.interests).slice(0, 3);
  const reasons = c.match?.reasons || [];
  return html`<article class="mentor-card" aria-labelledby="mc-${c.id}">
    <div class="mc-head">${avatar(c.name, c.id)}
      <div><h3 id="mc-${c.id}"><a href="${link}">${c.name}</a></h3><p class="role">${c.headline}${c.organization ? ` · ${c.organization}` : ''}</p></div>
      ${'saved' in c ? html`<button class="icon-btn" data-action="save" data-id="${c.id}" aria-pressed="${c.saved}" aria-label="${c.saved ? 'Remove' : 'Save'} ${c.name} ${c.saved ? 'from' : 'to'} saved mentors" title="${c.saved ? 'Saved' : 'Save mentor'}">${icon('bookmark', c.saved ? 'filled' : '')}</button>` : ''}
    </div>
    <div class="row">${category(c.industry)}
      ${c.accepting ? html`<span class="status status-ok">${icon('check')}Accepting requests</span>` : html`<span class="status status-neutral">${icon('pause')}Not accepting new requests</span>`}</div>
    <div class="facts">
      <span>${ratingText(c.rating, c.reviewCount)}</span>
      ${c.years_experience ? html`<span>${icon('briefcase')}${fmt.plural(c.years_experience, 'year')} experience</span>` : ''}
      <span>${c.offers_video ? icon('video') : ''}${c.offers_chat ? icon('chat') : ''}<span class="sr-only">Offers</span>${[c.offers_video && 'Video', c.offers_chat && 'Chat'].filter(Boolean).join(' & ')}</span>
      ${c.nextAvailable ? html`<span>${icon('calendar')}Next opening ${fmt.date(c.nextAvailable)}</span>` : html`<span>${icon('calendar')}No open times in the next 3 weeks</span>`}
    </div>
    ${c.summary ? html`<p class="summary">${c.summary}${c.summary.length >= 160 ? '…' : ''}</p>` : ''}
    ${top.length ? html`<ul class="tags" aria-label="Mentoring topics">${top.map(t => html`<li class="tag">${t}</li>`)}</ul>` : ''}
    ${reasons.length ? html`<div class="why"><strong>Why this match</strong> <span class="t-muted">· ${c.match.score}% relevance</span>
      <ul>${reasons.map(r => html`<li>${r}</li>`)}</ul></div>` : ''}
    <div class="mc-foot">
      <span>${c.relationship && c.relationship !== 'none' ? statusLabel('request_mentee', c.relationship) : ''}</span>
      <a class="btn btn-secondary btn-sm" href="${link}">View profile<span class="sr-only"> of ${c.name}</span> ${icon('arrow-right')}</a>
    </div>
  </article>`;
}

// ---------- Session card ----------
function sessionCard(s) {
  const d = new Date(s.starts_at);
  const acts = [];
  if (s.canConfirm) acts.push(html`<button class="btn btn-primary btn-sm" data-action="session-confirm" data-id="${s.id}">Confirm</button>`);
  if (s.canJoin) acts.push(html`<a class="btn btn-primary btn-sm" href="${s.meeting_url}" target="_blank" rel="noopener">${icon('video')}Join video call</a>`);
  if (s.canChat) acts.push(html`<a class="btn ${s.status === 'confirmed' ? 'btn-primary' : 'btn-secondary'} btn-sm" href="#/sessions/${s.id}">${icon('chat')}${s.status === 'confirmed' ? 'Open chat' : 'View chat'}</a>`);
  if (s.canReview) acts.push(html`<button class="btn btn-primary btn-sm" data-action="review" data-id="${s.id}" data-name="${s.other.name}" data-role="${s.myRole}">${icon('star')}Leave review</button>`);
  if (s.canComplete) acts.push(html`<button class="btn btn-secondary btn-sm" data-action="session-complete" data-id="${s.id}">Mark complete</button>`);
  if (s.canCancel) acts.push(html`<button class="btn btn-tertiary btn-sm" data-action="session-cancel" data-id="${s.id}" data-who="${s.other.name}" data-mentor="${s.myRole === 'mentor' && s.status === 'requested'}">${s.myRole === 'mentor' && s.status === 'requested' ? 'Decline' : 'Cancel'}</button>`);
  const joinNote = s.type === 'video' && s.status === 'confirmed' && !s.canJoin && Date.parse(s.joinOpensAt) > Date.now()
    ? html`<span>${icon('lock')}Video link opens ${fmt.time(s.joinOpensAt)} on ${fmt.date(s.joinOpensAt)}</span>` : '';
  return html`<article class="session-card" aria-labelledby="s-${s.id}">
    <div class="date-chip" aria-hidden="true"><span class="m">${d.toLocaleString(undefined, { month: 'short' })}</span><span class="d">${d.getDate()}</span></div>
    <div>
      <div class="row" style="gap:8px"><h3 id="s-${s.id}">${s.topic}</h3>${statusLabel('session', s.status)}</div>
      <div class="meta">
        <span>${icon('user')}with <a href="#/users/${s.other.id}">${s.other.name}</a>${s.other.detail ? ` · ${s.other.detail}` : ''}</span>
        <span>${icon('clock')}${fmt.when(s.starts_at)} · ${s.duration} min</span>
        <span>${icon(s.type === 'video' ? 'video' : 'chat')}${s.type === 'video' ? 'Video call' : 'Chat session'}</span>
        ${joinNote}
        ${s.status === 'cancelled' && s.cancel_reason ? html`<span>${icon('info')}${s.cancelledByMe ? 'You' : s.other.name} noted: “${s.cancel_reason}”</span>` : ''}
        ${s.status === 'requested' && s.myRole === 'mentee' ? html`<span>${icon('info')}Your mentor needs to confirm this time</span>` : ''}
        ${s.status === 'confirmed' && !s.canComplete ? html`<span class="sr-only">You can mark it complete after it starts.</span>` : ''}
      </div>
    </div>
    <div class="actions">${acts}</div>
  </article>`;
}

// ---------- Tag input: chips you can add/remove; stores a hidden comma-separated value ----------
function tagInput({ name, label, values = [], hint = '', suggestions = [], required = false, max = 12 }) {
  const id = `ti-${name}-${++fieldSeq}`;
  return html`<div class="field" data-field="${name}" data-taginput="${name}" data-max="${max}">
    <label for="${id}">${label}${required ? '' : html` <span class="t-meta">(optional)</span>`}</label>
    <div class="tag-input"><span class="tag-list" role="list" aria-label="${label}">${values.map(v => tagChip(v))}</span>
      <input id="${id}" type="text" autocomplete="off" aria-describedby="${id}-hint ${id}-err" placeholder="Type and press Enter"></div>
    <input type="hidden" name="${name}" value="${values.join(',')}">
    <p class="hint" id="${id}-hint">${hint || 'Press Enter or comma to add. Use the × to remove.'}</p>
    ${suggestions.length ? html`<div class="suggestions" aria-label="Suggestions">${suggestions.map(s => html`<button type="button" data-suggest="${s}">+ ${s}</button>`)}</div>` : ''}
    <p class="field-error" id="${id}-err" aria-live="polite"></p></div>`;
}
const tagChip = v => html`<span class="tag" role="listitem">${v}<button type="button" aria-label="Remove ${v}">${icon('x')}</button></span>`;
function enhanceTagInputs(root = document) {
  $$('[data-taginput]', root).forEach(wrap => {
    if (wrap.dataset.ready) return; wrap.dataset.ready = '1';
    const hidden = wrap.querySelector('input[type=hidden]'), input = wrap.querySelector('.tag-input input'), list = wrap.querySelector('.tag-list');
    const max = Number(wrap.dataset.max) || 12;
    const values = () => $$('.tag', list).map(t => t.firstChild.textContent);
    const sync = () => { hidden.value = values().join(','); };
    const add = raw => {
      const v = String(raw).replace(/,/g, ' ').trim().slice(0, 40);
      if (!v || values().some(x => x.toLowerCase() === v.toLowerCase()) || values().length >= max) return;
      list.insertAdjacentHTML('beforeend', tagChip(v).s); sync();
    };
    input.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) { e.preventDefault(); add(input.value); input.value = ''; }
      else if (e.key === 'Enter') e.preventDefault();
      else if (e.key === 'Backspace' && !input.value && values().length) { list.lastElementChild.remove(); sync(); }
    });
    input.addEventListener('blur', () => { if (input.value.trim()) { add(input.value); input.value = ''; } });
    list.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { b.parentElement.remove(); sync(); input.focus(); } });
    wrap.addEventListener('click', e => { const s = e.target.closest('[data-suggest]'); if (s) { add(s.dataset.suggest); s.remove(); } });
  });
}

// ---------- Repeatable rows (structured résumé entries) ----------
function experienceRows(items = []) {
  const rows = items.length ? items : [{ title: '', org: '', years: '' }];
  return html`<div class="repeat-list" data-repeat="experience">${rows.map((e, i) => experienceRow(e, i))}</div>
    <button type="button" class="btn btn-tertiary btn-sm" data-add-row="experience">${icon('plus')}Add another position</button>`;
}
const experienceRow = (e, i) => html`<div class="repeat-row" data-row>
  <div class="field"><label for="xt${i}${fieldSeq}">Job title</label><input id="xt${i}${fieldSeq}" data-k="title" value="${e.title}" maxlength="80"></div>
  <div class="field"><label for="xo${i}${fieldSeq}">Organization</label><input id="xo${i}${fieldSeq}" data-k="org" value="${e.org}" maxlength="80"></div>
  <div class="field"><label for="xy${i}${fieldSeq}">Years</label><input id="xy${i}${fieldSeq}" data-k="years" value="${e.years}" maxlength="30" placeholder="2020–present"></div>
  <button type="button" class="icon-btn" data-remove-row aria-label="Remove this position">${icon('trash')}</button></div>`;
function lineRows(name, items = [], label, placeholder = '') {
  const rows = items.length ? items : [''];
  return html`<div class="repeat-list" data-repeat="${name}" data-label="${label}" data-placeholder="${placeholder}">${rows.map((v, i) => lineRow(v, i, label, placeholder))}</div>
    <button type="button" class="btn btn-tertiary btn-sm" data-add-row="${name}">${icon('plus')}Add another</button>`;
}
const lineRow = (v, i, label, placeholder) => html`<div class="repeat-row single" data-row>
  <div class="field"><label for="lr${i}${++fieldSeq}" class="sr-only">${label} ${i + 1}</label><input id="lr${i}${fieldSeq}" data-k="value" value="${v}" maxlength="160" placeholder="${placeholder}"></div>
  <button type="button" class="icon-btn" data-remove-row aria-label="Remove">${icon('trash')}</button></div>`;
function enhanceRepeaters(root = document) {
  root.addEventListener('click', e => {
    const add = e.target.closest('[data-add-row]');
    if (add) {
      const list = $(`[data-repeat="${add.dataset.addRow}"]`, root);
      const html_ = add.dataset.addRow === 'experience' ? experienceRow({ title: '', org: '', years: '' }, list.children.length) : lineRow('', list.children.length, list.dataset.label, list.dataset.placeholder);
      list.insertAdjacentHTML('beforeend', html_.s);
      list.lastElementChild.querySelector('input').focus();
    }
    const rm = e.target.closest('[data-remove-row]');
    if (rm) {
      const list = rm.closest('[data-repeat]'), row = rm.closest('[data-row]');
      if (list.children.length > 1) row.remove(); else $$('input', row).forEach(i => { i.value = ''; });
      list.querySelector('input')?.focus();
    }
  });
}
const readRepeat = (root, name) => $$(`[data-repeat="${name}"] [data-row]`, root).map(row =>
  name === 'experience' ? Object.fromEntries($$('input', row).map(i => [i.dataset.k, i.value.trim()])) : row.querySelector('input').value.trim())
  .filter(v => (typeof v === 'string' ? v : v.title));

// ---------- Shared dialogs ----------
const REPORT_REASONS = ['Inappropriate or offensive content', 'Harassment or bullying', 'Asking for personal contact info', 'Spam or fake profile', 'Other'];
function reportDialog(type, id) {
  const what = { user: 'profile', review: 'review', message: 'message' }[type];
  const d = openDialog(html`${dialogHead(`Report this ${what}`)}
    <form class="dialog-body form" novalidate>
      <p class="t-muted mb-0">Reports are confidential. An administrator reviews every report and decides what to do. If someone is in immediate danger, contact a trusted adult or call 911.</p>
      <div class="alert alert-error form-alert" role="alert" hidden tabindex="-1"></div>
      <fieldset class="field" data-field="reason"><legend>Reason</legend>
        ${REPORT_REASONS.map((r, i) => html`<label class="check"><input type="radio" name="reason" value="${r}" ${raw(i === 0 ? 'autofocus' : '')}>${r}</label>`)}
        <p class="field-error" aria-live="polite"></p></fieldset>
      ${field({ name: 'details', label: 'What happened?', type: 'textarea', rows: 3, hint: 'Add anything that will help an administrator understand the problem.' })}
      <div class="dialog-foot" style="padding:0"><button type="button" class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-danger" type="submit">${icon('flag')}Submit report</button></div>
    </form>`);
  const form = d.querySelector('form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    if (!v.reason) return showFormError(form, { field: 'reason', message: 'Choose a reason.' });
    try {
      await withBusy(form.querySelector('[type=submit]'), () => api('/flags', { method: 'POST', body: { targetType: type, targetId: id, ...v } }));
      d.innerHTML = html`${dialogHead('Report submitted')}<div class="dialog-body"><div class="alert alert-ok">${icon('check-circle')}<p>Thank you. An administrator will review this report. You can keep using MentorshipMatch normally.</p></div></div>
        <div class="dialog-foot"><button class="btn btn-primary" data-close autofocus>Done</button></div>`.s;
      d.querySelector('[autofocus]').focus();
    } catch (err) { showFormError(form, err); }
  });
}

const RATING_LABELS = ['Very unhelpful', 'Somewhat unhelpful', 'Okay', 'Helpful', 'Very helpful'];
function reviewDialog({ sessionId, name, role, onDone }) {
  const identity = role === 'mentee'
    ? html`Your review will appear on ${name}'s profile as <strong>“Student mentee${MM.state.profile?.grade_level ? ` · ${MM.state.profile.grade_level}` : ''}”</strong>. Your name is never shown.`
    : html`Your feedback is private. It is shared with ${name} and administrators, and is never shown publicly.`;
  const d = openDialog(html`<div class="dialog-head"><div><h2 id="dialogTitle">How was your mentorship session?</h2><p class="t-muted mb-0">Your feedback helps improve future mentoring experiences.</p></div>
    <button type="button" class="icon-btn dlg-close" data-close aria-label="Close dialog">${icon('x')}</button></div>
    <form class="dialog-body form" novalidate>
      <div class="alert alert-error form-alert" role="alert" hidden tabindex="-1"></div>
      <fieldset class="field" data-field="rating"><legend>Rating for your session with ${name}</legend>
        <div class="rating-input">${RATING_LABELS.map((l, i) => html`<label><input type="radio" name="rating" value="${i + 1}" aria-label="${i + 1} out of 5: ${l}"><span class="r-body">${icon('star')}<span>${i + 1}</span><span>${l}</span></span></label>`)}</div>
        <p class="hint" id="rating-state" aria-live="polite">Select a rating</p>
        <p class="field-error" aria-live="polite"></p></fieldset>
      ${field({ name: 'comment', label: 'What was helpful, and what could improve?', type: 'textarea', rows: 4, required: true,
        hint: 'At least one sentence. Please don’t include phone numbers, emails, addresses, or other private details.' })}
      <div class="alert alert-info">${icon('eye')}<p>${identity}</p></div>
      <div class="dialog-foot" style="padding:0"><button type="button" class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" type="submit" disabled>Submit review</button></div>
    </form>`);
  const form = d.querySelector('form'), submit = form.querySelector('[type=submit]');
  const check = () => {
    const v = Object.fromEntries(new FormData(form));
    $('#rating-state', d).textContent = v.rating ? `Selected: ${v.rating} out of 5, ${RATING_LABELS[v.rating - 1]}` : 'Select a rating';
    submit.disabled = !(v.rating && String(v.comment || '').trim().length >= 10);
  };
  form.addEventListener('input', check); form.addEventListener('change', check);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    try {
      await withBusy(submit, () => api('/reviews', { method: 'POST', body: { sessionId, rating: Number(v.rating), comment: v.comment } }));
      closeDialog(); toast('Thanks, your review was submitted.'); onDone?.();
    } catch (err) { showFormError(form, err); }
  });
}

function requestDialog({ mentorId, name, onDone }) {
  const d = openDialog(html`${dialogHead(`Request mentorship from ${name}`)}
    <form class="dialog-body form" novalidate>
      <div class="alert alert-error form-alert" role="alert" hidden tabindex="-1"></div>
      ${field({ name: 'message', label: 'Introduce yourself', type: 'textarea', rows: 5, required: true,
        hint: 'Share what you’re studying, what you hope to learn, and why you chose this mentor. At least 20 characters. Keep personal contact details out; you can talk on MentorshipMatch.' })}
      <p class="t-meta mb-0">${name} will see your name, grade or year, school, interests, and goals. Mentors must accept before you can book a session.</p>
      <div class="dialog-foot" style="padding:0"><button type="button" class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" type="submit">Send request</button></div>
    </form>`);
  const form = d.querySelector('form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await withBusy(form.querySelector('[type=submit]'), () => api('/requests', { method: 'POST', body: { mentorId, message: new FormData(form).get('message') } }));
      closeDialog(); toast(`Request sent to ${name}.`); onDone?.();
    } catch (err) { showFormError(form, err); }
  });
}

function matchingExplainer() {
  openDialog(html`${dialogHead('How recommendations work')}
    <div class="dialog-body prose">
      <p>MentorshipMatch suggests mentors using a simple, transparent relevance score. It is <strong>not</strong> a prediction of how well a mentorship will go.</p>
      <ul><li><strong>35%</strong> — shared academic interests</li><li><strong>25%</strong> — same industry as your field of interest</li>
        <li><strong>25%</strong> — mentor experience related to your career goals</li><li><strong>15%</strong> — offers your preferred session format</li></ul>
      <p>Only mentors who are approved and currently accepting requests are recommended. If your profile is missing interests, a field, or goals, that part is skipped and we tell you what to add.</p>
    </div><div class="dialog-foot"><button class="btn btn-primary" data-close autofocus>Got it</button></div>`);
}

// Link-based tabs (each tab is a real URL, so Back works and filters are shareable).
const linkTabs = (label, items) => html`<nav class="tabs" aria-label="${label}">${items.map(([href, text, n, active]) =>
  html`<a href="${href}" ${raw(active ? 'aria-current="page"' : '')}>${text}${n !== undefined ? html` <span class="count">${n}</span>` : ''}</a>`)}</nav>`;
