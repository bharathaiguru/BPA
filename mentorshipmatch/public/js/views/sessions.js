/* views/sessions.js — session management (spec §14.3), availability-based booking (§14.1),
   chat (§15), and the shared session actions (confirm / cancel / complete / review). */
'use strict';

// ---------- Sessions list ----------
MM.route('/sessions', async () => {
  const u = MM.state.user;
  const all = await api('/sessions');
  const now = Date.now();
  const awaiting = all.filter(s => s.status === 'requested' && Date.parse(s.ends_at) > now);
  const upcoming = all.filter(s => s.status === 'confirmed' && Date.parse(s.ends_at) > now - 60 * 60000 || (s.status === 'confirmed' && s.canComplete));
  const past = all.filter(s => !awaiting.includes(s) && !upcoming.includes(s)).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const groups = [['awaiting', 'Awaiting confirmation', awaiting], ['upcoming', 'Upcoming', upcoming], ['past', 'Past sessions', past]];
  const tab = groups.find(g => g[0] === MM.query().get('tab'))?.[0] || (awaiting.length && u.role === 'mentor' ? 'awaiting' : upcoming.length ? 'upcoming' : awaiting.length ? 'awaiting' : 'past');
  const items = groups.find(g => g[0] === tab)[2];
  const conns = u.role === 'mentee' ? await api('/connections') : [];
  const empty = {
    awaiting: u.role === 'mentor' ? 'No sessions waiting for your confirmation.' : 'No session requests waiting for a mentor to confirm.',
    upcoming: 'No confirmed sessions coming up.', past: 'Completed and cancelled sessions will appear here.',
  }[tab];
  $('#main').innerHTML = html`${pageHead('Sessions', `Times are shown in your time zone (${fmt.tzName()}).`,
      u.role === 'mentee' && conns.length ? html`<a class="btn btn-primary" href="#/book/${conns[0].id}">${icon('plus')}Book a session</a>` : '')}
    ${linkTabs('Session status', groups.map(([k, l, arr]) => [`#/sessions?tab=${k}`, l, arr.length, k === tab]))}
    ${tab === 'upcoming' && items.some(s => s.type === 'video') ? html`<p class="t-small t-muted">${icon('info')} Video links open 15 minutes before a session starts. Sessions can be marked complete once they have started.</p>` : ''}
    ${items.length ? items.map(sessionCard) : emptyState({ ic: 'calendar', title: empty,
      action: u.role === 'mentee' && tab !== 'past' ? (conns.length ? html`<a class="btn btn-primary" href="#/book/${conns[0].id}">Book with ${conns[0].name}</a>` : html`<a class="btn btn-primary" href="#/mentors">Find a mentor</a>`) : '' })}
    ${u.role === 'mentee' && conns.length > 1 ? html`<div class="section-title"><h2>Book with another mentor</h2></div><div class="row">${conns.map(c => html`<a class="btn btn-secondary btn-sm" href="#/book/${c.id}">${c.name}</a>`)}</div>` : ''}`;
}, { auth: true, roles: ['mentee', 'mentor'], title: 'Sessions' });

// ---------- Shared session actions ----------
document.addEventListener('click', async e => {
  const c = e.target.closest('[data-action="session-confirm"]');
  if (c) {
    try { await withBusy(c, () => api(`/sessions/${c.dataset.id}`, { method: 'PATCH', body: { status: 'confirmed' } })); toast('Session confirmed. The student has been updated.'); refreshCounts(); MM.render(); }
    catch (err) { toast(err.message, 'error'); }
  }
  const x = e.target.closest('[data-action="session-cancel"]');
  if (x) {
    const decline = x.dataset.mentor === 'true';
    const ok = await confirmDialog({
      title: decline ? 'Decline this session time?' : 'Cancel this session?', danger: true, confirmLabel: decline ? 'Decline time' : 'Cancel session',
      body: html`<p>${x.dataset.who} will see that this session was ${decline ? 'declined' : 'cancelled'}. This can’t be undone, but you can book or offer another time.</p>`,
      reason: { label: `Note for ${x.dataset.who}`, required: false, hint: 'Optional. For example, “Something came up. Could we try next week?”' },
      action: v => api(`/sessions/${x.dataset.id}`, { method: 'PATCH', body: { status: 'cancelled', reason: v.reason } }) });
    if (ok) { toast(decline ? 'Session time declined.' : 'Session cancelled.'); refreshCounts(); MM.render(); }
  }
  const done = e.target.closest('[data-action="session-complete"]');
  if (done) {
    const ok = await confirmDialog({ title: 'Mark this session complete?', confirmLabel: 'Mark complete',
      body: html`<p>Only mark it complete if the session actually took place. Afterward, both of you can leave a review.</p>`,
      action: () => api(`/sessions/${done.dataset.id}`, { method: 'PATCH', body: { status: 'completed' } }) });
    if (ok) { toast('Marked complete. You can leave a review now.'); MM.render(); }
  }
  const rv = e.target.closest('[data-action="review"]');
  if (rv) reviewDialog({ sessionId: Number(rv.dataset.id), name: rv.dataset.name, role: rv.dataset.role, onDone: () => { refreshCounts(); MM.render(); } });
});

// ---------- Booking: duration → date → time → format & topic → summary ----------
const localDay = iso => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

MM.route('/book/:id', async ({ id }) => {
  const m = await api(`/users/${id}`);
  const first = m.name.replace(/^Dr\.\s+/, '').split(' ')[0];
  if (m.relationship !== 'accepted') {
    $('#main').innerHTML = html`<a class="back-link" href="#/users/${id}">${icon('arrow-left')}Back to ${m.name}</a>
      ${pageHead('Book a session')}${emptyState({ ic: 'lock', title: 'A mentor must accept your request before you can book.', body: m.relationship === 'pending' ? `Your request to ${m.name} is awaiting a response.` : `Send ${m.name} a mentorship request first.`, action: html`<a class="btn btn-primary" href="#/users/${id}">Go to ${first}’s profile</a>` })}`;
    return;
  }
  const st = { duration: m.durations_list[0], date: null, time: null, type: m.offers_video ? 'video' : 'chat', topic: '', slots: [], month: null };
  const tz = fmt.tzName();

  $('#main').innerHTML = html`<a class="back-link" href="#/users/${id}">${icon('arrow-left')}Back to ${m.name}</a>
    <div class="page-head"><div class="row">${avatar(m.name, m.id, 'lg')}<div><h1 class="t-app-title mb-0">Book a session</h1><p>with <strong>${m.name}</strong> · ${m.headline}${m.organization ? `, ${m.organization}` : ''}</p></div></div></div>
    <div class="booking-layout"><form id="bookForm" novalidate>
      <div class="alert alert-error form-alert" role="alert" hidden tabindex="-1"></div>
      <section class="booking-step" aria-labelledby="b1"><h2 id="b1"><span class="num" aria-hidden="true">1</span>Session length</h2>
        <fieldset><legend class="sr-only">Session length</legend><div class="segmented">${m.durations_list.map(d => html`<label><input type="radio" name="duration" value="${d}" ${raw(d === st.duration ? 'checked' : '')}><span>${d} minutes</span></label>`)}</div></fieldset></section>
      <section class="booking-step" aria-labelledby="b2"><h2 id="b2"><span class="num" aria-hidden="true">2</span>Choose a date</h2><div id="cal" class="cal"></div></section>
      <section class="booking-step" aria-labelledby="b3"><h2 id="b3"><span class="num" aria-hidden="true">3</span>Choose a time</h2>
        <p class="t-small t-muted">Times are in your time zone: <strong>${tz}</strong>.</p><div id="slots" role="group" aria-labelledby="b3"></div>
        <p class="field-error" data-field-msg="startsAt" aria-live="polite"></p></section>
      <section class="booking-step" aria-labelledby="b4"><h2 id="b4"><span class="num" aria-hidden="true">4</span>Format and topic</h2>
        <fieldset class="field" data-field="type"><legend>Format</legend><div class="choice-grid">
          ${m.offers_video ? html`<label class="choice"><input type="radio" name="type" value="video" ${raw(st.type === 'video' ? 'checked' : '')}><span class="choice-body">${icon('video')}<span><strong>Video call</strong><small>A private link opens 15 minutes before.</small></span></span></label>` : ''}
          ${m.offers_chat ? html`<label class="choice"><input type="radio" name="type" value="chat" ${raw(st.type === 'chat' ? 'checked' : '')}><span class="choice-body">${icon('chat')}<span><strong>Chat session</strong><small>Message in a private chat room.</small></span></span></label>` : ''}
        </div><p class="field-error" aria-live="polite"></p></fieldset>
        <div style="margin-top:16px">${field({ name: 'topic', label: 'What would you like to talk about?', required: true, hint: 'For example: “Choosing between computer science and engineering.” At least 5 characters.', attrs: 'maxlength="150"' })}</div>
      </section>
    </form>
    <aside class="card summary-panel" aria-labelledby="sum-h"><h2 id="sum-h" class="t-card">Summary</h2><div id="summary"></div></aside></div>`;

  const form = $('#bookForm');
  const loadSlots = async () => {
    $('#slots').innerHTML = html`<p class="t-muted">Loading open times…</p>`;
    const r = await api(`/mentors/${id}/slots?duration=${st.duration}`);
    st.slots = r.slots;
    if (st.date && !st.slots.some(s => localDay(s) === st.date)) st.date = null;
    if (st.time && !st.slots.includes(st.time)) st.time = null;
    if (!st.month) { const d = st.slots[0] ? new Date(st.slots[0]) : new Date(); st.month = new Date(d.getFullYear(), d.getMonth(), 1); }
    renderCal(); renderSlots(); renderSummary();
  };
  const renderCal = () => {
    const byDay = st.slots.reduce((a, s) => { const k = localDay(s); a[k] = (a[k] || 0) + 1; return a; }, {});
    const y = st.month.getFullYear(), mo = st.month.getMonth();
    const firstDow = new Date(y, mo, 1).getDay(), days = new Date(y, mo + 1, 0).getDate();
    const today = localDay(new Date().toISOString());
    const last = st.slots.length ? new Date(st.slots[st.slots.length - 1]) : new Date();
    const canPrev = new Date(y, mo, 1) > new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const canNext = new Date(y, mo + 1, 1) <= last;
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(html`<span></span>`);
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, n = byDay[key] || 0;
      const label = new Date(y, mo, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
      cells.push(html`<button type="button" class="${n ? 'has-slots' : ''} ${key === today ? 'today' : ''}" data-day="${key}" ${raw(n ? '' : 'disabled')}
        aria-pressed="${st.date === key}" aria-label="${label}${key === today ? ', today' : ''}: ${n ? fmt.plural(n, 'open time') : 'no open times'}">${d}</button>`);
    }
    $('#cal').innerHTML = st.slots.length ? html`<div class="cal-head">
        <button type="button" class="icon-btn" data-month="-1" ${raw(canPrev ? '' : 'disabled')} aria-label="Previous month">${icon('chevron-left')}</button>
        <h3 aria-live="polite">${st.month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
        <button type="button" class="icon-btn" data-month="1" ${raw(canNext ? '' : 'disabled')} aria-label="Next month">${icon('chevron-right')}</button></div>
      <div class="cal-grid">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => html`<span class="dow" aria-hidden="true">${d}</span>`)}${cells}</div>
      <p class="t-meta" style="margin-top:8px">Outlined dates have open times. Today is underlined.</p>`
      : html`<div class="alert alert-warn">${icon('alert')}<p>${first} has no open ${st.duration}-minute times in the next six weeks. Try a shorter session, or check back later.</p></div>`;
  };
  const renderSlots = () => {
    if (!st.date) { $('#slots').innerHTML = html`<p class="t-muted">Choose a date to see open times.</p>`; return; }
    const day = st.slots.filter(s => localDay(s) === st.date);
    $('#slots').innerHTML = html`<p class="label">${new Date(day[0]).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      <div class="slots">${day.map(s => html`<button type="button" data-time="${s}" aria-pressed="${st.time === s}">${fmt.time(s)}</button>`)}</div>`;
  };
  const renderSummary = () => {
    const ready = st.time && st.type && st.topic.trim().length >= 5;
    $('#summary').innerHTML = html`<dl>
      <dt>Mentor</dt><dd>${m.name}</dd>
      <dt>Date</dt><dd>${st.time ? fmt.dateLong(st.time) : '—'}</dd>
      <dt>Time</dt><dd>${st.time ? `${fmt.time(st.time)}–${fmt.time(new Date(Date.parse(st.time) + st.duration * 60000).toISOString())}` : '—'}</dd>
      <dt>Time zone</dt><dd>${tz}</dd>
      <dt>Length</dt><dd>${st.duration} minutes</dd>
      <dt>Format</dt><dd>${st.type === 'video' ? 'Video call' : 'Chat session'}</dd>
      <dt>Cost</dt><dd>Free</dd></dl>
      <div class="alert alert-info" style="margin-bottom:16px">${icon('info')}<p>${first} needs to confirm this time. Nothing is final until they do.</p></div>
      <button class="btn btn-primary btn-block" type="submit" form="bookForm" ${raw(ready ? '' : 'disabled')}>Request this time</button>
      ${!ready ? html`<p class="t-meta" style="margin-top:8px">${!st.time ? 'Choose a date and time.' : 'Add a topic (at least 5 characters).'}</p>` : ''}`;
  };

  $('#main').addEventListener('click', e => {
    const day = e.target.closest('[data-day]'); if (day) { st.date = day.dataset.day; st.time = null; renderCal(); renderSlots(); renderSummary(); $('#slots button')?.focus(); }
    const t = e.target.closest('[data-time]'); if (t) { st.time = t.dataset.time; renderSlots(); renderSummary(); $(`[data-time="${st.time}"]`)?.focus(); }
    const mo = e.target.closest('[data-month]'); if (mo) { st.month = new Date(st.month.getFullYear(), st.month.getMonth() + Number(mo.dataset.month), 1); renderCal(); $('[data-month]:not([disabled])')?.focus(); }
  });
  form.addEventListener('change', e => {
    if (e.target.name === 'duration') { st.duration = Number(e.target.value); loadSlots(); }
    if (e.target.name === 'type') { st.type = e.target.value; renderSummary(); }
  });
  form.addEventListener('input', e => { if (e.target.name === 'topic') { st.topic = e.target.value; renderSummary(); } });
  form.addEventListener('submit', async e => {
    e.preventDefault(); clearFormErrors(form);
    const btn = $('#summary [type=submit]');
    try {
      const s = await withBusy(btn, () => api('/sessions', { method: 'POST', body: { mentorId: Number(id), startsAt: st.time, duration: st.duration, type: st.type, topic: st.topic } }));
      $('#main').innerHTML = html`<div class="narrow" style="margin:0">${pageHead('Session requested')}
        <div class="alert alert-ok" role="status">${icon('check-circle')}<div><p><strong>${s.topic}</strong> with ${m.name}<br>${fmt.dateLong(s.starts_at)} at ${fmt.time(s.starts_at)} (${tz}) · ${s.duration} minutes · ${s.type === 'video' ? 'Video call' : 'Chat'}</p></div></div>
        <h2 class="t-section" style="margin-top:32px">What happens next</h2>
        <ol><li>${first} confirms the time (it shows as <strong>Awaiting confirmation</strong> until then).</li>
          <li>${s.type === 'video' ? 'The private video link opens 15 minutes before the start time.' : 'Your private chat room opens once the session is confirmed.'}</li>
          <li>After you meet, either of you marks it complete and you can leave a review.</li></ol>
        <div class="row" style="margin-top:24px"><a class="btn btn-primary" href="#/sessions?tab=awaiting">View my sessions</a><a class="btn btn-secondary" href="#/dashboard">Back to overview</a></div></div>`;
      $('#main h1').setAttribute('tabindex', '-1'); $('#main h1').focus();
    } catch (err) {
      showFormError(form, err);
      if (err.status === 409) { st.time = null; await loadSlots();
        const alts = st.slots.slice(0, 3).map(s => fmt.when(s)).join('; ');
        if (alts) $('.form-alert', form).innerHTML += html`<p style="margin-top:4px">Next open times: ${alts}.</p>`.s; }
    }
  });
  await loadSlots();
}, { auth: true, roles: ['mentee'], title: 'Book a session' });

// ---------- Chat (append-only, preserves reading position and drafts) ----------
MM.route('/sessions/:id', async ({ id }) => {
  const s = await api(`/sessions/${id}`);
  const me = MM.state.user;
  const open = s.status === 'confirmed' && s.type === 'chat';
  $('#main').innerHTML = html`<a class="back-link" href="#/sessions">${icon('arrow-left')}All sessions</a>
    <div class="chat-shell">
      <header class="chat-head">${avatar(s.other.name, s.other.id)}
        <div><h1>${s.other.name}</h1><p>${s.topic} · ${fmt.when(s.starts_at)} · ${s.duration} min</p></div>
        <span class="spacer"></span>${statusLabel('session', s.status)}
        <button class="btn btn-tertiary btn-sm" data-action="report" data-type="user" data-id="${s.other.id}">${icon('flag')}<span>Report</span></button>
      </header>
      <div class="chat-log" id="chatLog" role="log" aria-live="polite" aria-label="Messages with ${s.other.name}" tabindex="0"></div>
      ${open ? html`<form class="composer" id="composer"><label for="msg" class="sr-only">Message ${s.other.name}</label>
          <textarea id="msg" rows="1" maxlength="1000" placeholder="Write a message. Enter to send, Shift+Enter for a new line."></textarea>
          <button class="btn btn-primary" type="submit">${icon('send')}<span>Send</span></button></form>`
        : html`<p class="t-small t-muted" style="padding:12px 16px;margin:0;border-top:1px solid var(--line)">${s.status === 'requested' ? 'Chat opens once the mentor confirms this session.' : s.status === 'completed' ? 'This session has ended. The conversation is kept for your records, and you can still report a message.' : 'This chat is closed.'}</p>`}
    </div>
    <p class="t-meta" style="margin-top:8px">${icon('shield')} Keep conversations here. Don’t share phone numbers, addresses, or social media accounts.</p>`;

  const log = $('#chatLog');
  let lastId = 0, lastSender = null, lastDay = null, newBelow = 0;
  const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  const bubble = (m, mine, pending) => {
    const day = fmt.sqlDate(m.created_at).toDateString();
    let out = '';
    if (day !== lastDay) { out += html`<div class="day-sep">${fmt.sqlDate(m.created_at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>`.s; lastDay = day; lastSender = null; }
    const showWho = lastSender !== m.sender_id; lastSender = m.sender_id;
    out += html`<div class="msg ${mine ? 'mine' : ''} ${pending ? 'pending' : ''}" data-mid="${m.id || ''}">
      ${showWho ? html`<span class="who">${mine ? 'You' : m.sender}</span>` : ''}
      <div class="bubble-row"><div class="bubble">${m.body}</div>
        <time datetime="${fmt.sqlDate(m.created_at).toISOString()}">${fmt.sqlDate(m.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time>
        ${!mine && m.id ? html`<button class="icon-btn report" data-action="report" data-type="message" data-id="${m.id}" aria-label="Report this message from ${m.sender}">${icon('flag')}</button>` : ''}</div></div>`.s;
    return out;
  };
  const append = (msgs, { initial = false } = {}) => {
    if (!msgs.length) return;
    const stick = initial || nearBottom();
    for (const m of msgs) { if (m.id <= lastId) continue; log.insertAdjacentHTML('beforeend', bubble(m, m.sender_id === me.id)); lastId = m.id; if (!stick && m.sender_id !== me.id) newBelow++; }
    if (stick) log.scrollTop = log.scrollHeight; else showNewButton();
  };
  const showNewButton = () => {
    let b = $('#newMsgs');
    if (!newBelow) { b?.remove(); return; }
    if (!b) { log.insertAdjacentHTML('beforeend', html`<button type="button" id="newMsgs" class="btn btn-primary btn-sm new-msgs">${icon('chevron-down')}<span></span></button>`.s); b = $('#newMsgs'); }
    log.appendChild(b); b.querySelector('span').textContent = `${fmt.plural(newBelow, 'new message')}`;
  };
  log.addEventListener('click', e => { if (e.target.closest('#newMsgs')) { newBelow = 0; $('#newMsgs')?.remove(); log.scrollTop = log.scrollHeight; } });
  log.addEventListener('scroll', () => { if (nearBottom() && newBelow) { newBelow = 0; $('#newMsgs')?.remove(); } });

  const initial = await api(`/sessions/${id}/messages`);
  if (!initial.length) log.innerHTML = html`<p class="t-muted" id="noMsgs" style="text-align:center;margin-top:32px">No messages yet.${open ? ' Say hello and share what you’d like to talk about.' : ''}</p>`.s;
  append(initial, { initial: true });

  const poll = setInterval(async () => {
    if (!document.contains(log)) return clearInterval(poll);
    try { const more = await api(`/sessions/${id}/messages?after=${lastId}`); if (more.length) { $('#noMsgs')?.remove(); append(more); } } catch { /* try again next tick */ }
  }, 4000);

  const composer = $('#composer');
  if (!composer) return;
  const ta = $('#msg');
  const draftKey = `mm-draft-${id}`;
  ta.value = sessionStorage.getItem(draftKey) || '';
  ta.addEventListener('input', () => { sessionStorage.setItem(draftKey, ta.value); ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); composer.requestSubmit(); } });
  const send = async (body, failedEl) => {
    try {
      const m = await api(`/sessions/${id}/messages`, { method: 'POST', body: { body } });
      failedEl?.remove(); $('#noMsgs')?.remove();
      append([m], { initial: true });
    } catch (err) {
      // Keep the unsent message visible with a retry button; nothing is lost.
      const el = failedEl || document.createElement('div');
      el.className = 'msg mine failed';
      el.innerHTML = html`<div class="bubble-row"><div class="bubble">${body}</div></div>
        <p class="field-error" role="alert">${icon('alert')} Not sent: ${err.message} <button type="button" class="btn btn-tertiary btn-sm" data-retry>Retry</button></p>`.s;
      el.querySelector('[data-retry]').onclick = () => send(body, el);
      if (!failedEl) { log.appendChild(el); log.scrollTop = log.scrollHeight; }
    }
  };
  composer.addEventListener('submit', e => {
    e.preventDefault();
    const body = ta.value.trim(); if (!body) return;
    ta.value = ''; ta.style.height = ''; sessionStorage.removeItem(draftKey);
    send(body);
  });
}, { auth: true, roles: ['mentee', 'mentor'], title: 'Session chat' });
