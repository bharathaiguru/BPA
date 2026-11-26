/* views/requests.js — mentorship requests organized by state (spec §13).
   Students: Awaiting response · Accepted · Declined.   Mentors: New requests · Active connections · Past. */
'use strict';

MM.route('/requests', async () => {
  const u = MM.state.user;
  const mentor = u.role === 'mentor';
  const list = await api('/requests');
  const groups = mentor
    ? [['new', 'New requests', list.filter(r => r.status === 'pending')], ['active', 'Active connections', list.filter(r => r.status === 'accepted')], ['past', 'Past requests', list.filter(r => r.status === 'declined')]]
    : [['pending', 'Awaiting response', list.filter(r => r.status === 'pending')], ['accepted', 'Accepted', list.filter(r => r.status === 'accepted')], ['declined', 'Declined', list.filter(r => r.status === 'declined')]];
  const tab = groups.find(g => g[0] === MM.query().get('tab'))?.[0] || groups[0][0];
  const [, , items] = groups.find(g => g[0] === tab);
  const cap = mentor ? (await api('/profile')).capacityInfo : null;
  const flash = sessionStorage.getItem('mm-flash'); sessionStorage.removeItem('mm-flash');

  const card = r => {
    const ctx = mentor ? [r.grade_level, r.organization, r.industry].filter(Boolean).join(' · ') : [r.headline, r.organization].filter(Boolean).join(' · ');
    let actions;
    if (mentor && r.status === 'pending') actions = html`
      <a class="btn btn-tertiary btn-sm" href="#/users/${r.other_id}">View student profile</a>
      <button class="btn btn-danger-outline btn-sm" data-req-decline="${r.id}" data-name="${r.other_name}">Decline</button>
      ${cap.full ? html`<span class="t-meta">At capacity: <a href="#/profile">raise your limit</a> to accept</span>` : html`<button class="btn btn-primary btn-sm" data-req-accept="${r.id}" data-name="${r.other_name}">${icon('check')}Accept request</button>`}`;
    else if (mentor && r.status === 'accepted') actions = html`<a class="btn btn-secondary btn-sm" href="#/users/${r.other_id}">View student profile</a>`;
    else if (!mentor && r.status === 'pending') actions = html`<button class="btn btn-tertiary btn-sm" data-req-withdraw="${r.id}" data-name="${r.other_name}">Withdraw request</button>`;
    else if (!mentor && r.status === 'accepted') actions = html`<a class="btn btn-primary btn-sm" href="#/book/${r.other_id}">${icon('calendar')}Book a session</a>`;
    else if (!mentor) actions = html`<a class="btn btn-secondary btn-sm" href="#/mentors?industry=${encodeURIComponent(r.industry || '')}">Discover other mentors</a>`;
    return html`<article class="req-card" aria-labelledby="rq-${r.id}">${avatar(r.other_name, r.other_id)}
      <div><div class="row" style="gap:8px"><h3 id="rq-${r.id}"><a href="#/users/${r.other_id}">${r.other_name}</a></h3>${statusLabel(mentor ? 'request_mentor' : 'request_mentee', r.status)}</div>
        <p class="meta">${ctx ? `${ctx} · ` : ''}sent ${fmt.ago(r.created_at)}${r.responded_at ? ` · answered ${fmt.ago(r.responded_at)}` : ''}</p>
        <blockquote>${r.message}</blockquote>
        ${mentor && r.status === 'pending' && r.career_goals ? html`<p class="t-small mb-0"><strong>Goal:</strong> ${r.career_goals}</p>` : ''}
        ${mentor && r.status === 'pending' && r.interests ? html`<ul class="tags" style="margin-top:8px">${tags(r.interests).slice(0, 4).map(x => html`<li class="tag">${x}</li>`)}</ul>` : ''}
        ${!mentor && r.status === 'declined' ? html`<p class="t-small mb-0">This mentor isn’t able to take you on right now. That’s common, and it isn’t about you. Try another mentor in the same field.</p>` : ''}
      </div><div class="actions">${actions}</div></article>`;
  };

  const empty = {
    new: ['inbox', 'No new requests', 'When a student asks you to be their mentor, their request appears here.'],
    active: ['users', 'No active connections yet', 'Students you accept appear here.'],
    past: ['list', 'No past requests', 'Requests you decline are kept here for reference.'],
    pending: ['clock', 'Nothing awaiting a response', 'Requests you send appear here until the mentor answers.'],
    accepted: ['check-circle', 'No accepted requests yet', 'When a mentor accepts, you can book sessions with them.'],
    declined: ['x', 'No declined requests', ''],
  }[tab];

  $('#main').innerHTML = html`${pageHead(mentor ? 'Requests' : 'My requests', mentor ? 'Review students who asked you to mentor them.' : 'Track the mentorship requests you’ve sent.',
      !mentor ? html`<a class="btn btn-primary" href="#/mentors">${icon('search')}Find mentors</a>` : '')}
    ${flash ? html`<div class="alert alert-ok" role="status" style="margin-bottom:24px">${icon('check-circle')}<p>${raw(flash)}</p></div>` : ''}
    ${mentor && cap ? html`<p class="t-small">You’re mentoring <strong>${cap.active} of ${cap.capacity}</strong> students${cap.paused ? ' · new requests are paused' : ''}.</p>` : ''}
    ${linkTabs('Request status', groups.map(([k, label, arr]) => [`#/requests?tab=${k}`, label, arr.length, k === tab]))}
    ${items.length ? items.map(card) : emptyState({ ic: empty[0], title: empty[1], body: empty[2], action: !mentor && tab === 'pending' ? html`<a class="btn btn-primary" href="#/mentors">Find a mentor</a>` : '' })}`;
}, { auth: true, roles: ['mentee', 'mentor'], title: 'Requests' });

document.addEventListener('click', async e => {
  const acc = e.target.closest('[data-req-accept]');
  if (acc) {
    try {
      await withBusy(acc, () => api(`/requests/${acc.dataset.reqAccept}`, { method: 'PATCH', body: { status: 'accepted' } }));
      sessionStorage.setItem('mm-flash', esc(`You accepted ${acc.dataset.name}. They can now book sessions within your availability, and they appear under My mentees.`));
      refreshCounts(); MM.go('#/requests?tab=active');
    } catch (err) { toast(err.message, 'error'); }
  }
  const dec = e.target.closest('[data-req-decline]');
  if (dec) {
    const ok = await confirmDialog({ title: `Decline ${dec.dataset.name}’s request?`, confirmLabel: 'Decline request', danger: true,
      body: html`<p>${dec.dataset.name} will see that the request was declined and will be encouraged to find another mentor. This can’t be undone.</p>`,
      action: () => api(`/requests/${dec.dataset.reqDecline}`, { method: 'PATCH', body: { status: 'declined' } }) });
    if (ok) { sessionStorage.setItem('mm-flash', esc(`Request from ${dec.dataset.name} declined.`)); refreshCounts(); MM.go('#/requests?tab=past'); }
  }
  const wd = e.target.closest('[data-req-withdraw]');
  if (wd) {
    const ok = await confirmDialog({ title: 'Withdraw this request?', confirmLabel: 'Withdraw request',
      body: html`<p>${wd.dataset.name} will no longer see your request. You can send a new one later.</p>`,
      action: () => api(`/requests/${wd.dataset.reqWithdraw}`, { method: 'DELETE' }) });
    if (ok) { sessionStorage.setItem('mm-flash', esc(`Your request to ${wd.dataset.name} was withdrawn.`)); MM.render(); }
  }
});
