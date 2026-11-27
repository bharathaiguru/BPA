/* views/dashboard.js — role-specific overviews (spec §9 student, §10 mentor).
   Students: "What should I do next?"  Mentors: requests and confirmations first, then capacity. */
'use strict';

const upcomingOf = sessions => sessions.filter(s => ['requested', 'confirmed'].includes(s.status) && Date.parse(s.ends_at) > Date.now())
  .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));

function nextUpCard(s) {
  return html`<section class="next-up" aria-labelledby="next-h"><span class="mock-label">Next up</span>
    <h2 id="next-h">${s.topic}</h2>
    <div class="row">${avatar(s.other.name, s.other.id, 'sm')}<span>with <strong>${s.other.name}</strong>${s.other.detail ? ` · ${s.other.detail}` : ''}</span></div>
    <div class="row">${statusLabel('session', s.status)}<span class="t-small">${icon('clock')} ${fmt.when(s.starts_at)} · ${s.duration} min</span>
      <span class="t-small">${icon(s.type === 'video' ? 'video' : 'chat')} ${s.type === 'video' ? 'Video call' : 'Chat'}</span></div>
    <div class="row">
      ${s.canJoin ? html`<a class="btn btn-primary" href="${s.meeting_url}" target="_blank" rel="noopener">${icon('video')}Join video call</a>` : ''}
      ${s.canChat ? html`<a class="btn btn-primary" href="#/sessions/${s.id}">${icon('chat')}Open chat</a>` : ''}
      ${s.canConfirm ? html`<button class="btn btn-primary" data-action="session-confirm" data-id="${s.id}">Confirm this time</button>` : ''}
      <a class="btn btn-secondary" href="#/sessions">View details</a>
    </div>
    ${s.status === 'requested' && s.myRole === 'mentee' ? html`<p class="t-small mb-0" style="margin-top:12px">${icon('info')} ${s.other.name.split(' ')[0]} needs to confirm this time.</p>` : ''}
  </section>`;
}

MM.route('/dashboard', async () => {
  const u = MM.state.user;
  if (u.role === 'admin') return MM.go('#/admin');
  return u.role === 'mentor' ? mentorDashboard() : studentDashboard();
}, { auth: true, title: 'Overview' });

async function studentDashboard() {
  const u = MM.state.user;
  const [profile, sessions, requests, conns, recs] = await Promise.all([api('/profile'), api('/sessions'), api('/requests'), api('/connections'), api('/recommendations?limit=3')]);
  MM.state.profile = profile;
  const upcoming = upcomingOf(sessions);
  const toReview = sessions.filter(s => s.canReview);
  const pending = requests.filter(r => r.status === 'pending');
  const acceptedNoSession = conns.filter(c => !c.nextSession);
  const completed = sessions.filter(s => s.status === 'completed').length;
  const comp = profile.completion;
  const isNew = !conns.length && !pending.length;

  const tasks = [
    ...toReview.map(s => html`<li>${icon('star')}<div style="flex:1">Your session “${s.topic}” with ${s.other.name} is complete. How did it go?</div><button class="btn btn-secondary btn-sm" data-action="review" data-id="${s.id}" data-name="${s.other.name}" data-role="mentee">Leave review</button></li>`),
    ...acceptedNoSession.map(c => html`<li>${icon('check-circle')}<div style="flex:1"><strong>${c.name}</strong> is your mentor. You don’t have a session scheduled.</div><a class="btn btn-secondary btn-sm" href="#/book/${c.id}">Book a session</a></li>`),
    ...pending.map(r => html`<li>${icon('clock')}<div style="flex:1">Awaiting a response from <strong>${r.other_name}</strong> (sent ${fmt.ago(r.created_at)}).</div><a class="btn btn-tertiary btn-sm" href="#/requests">View</a></li>`),
  ];

  $('#main').innerHTML = html`
    ${pageHead('Your mentorship journey', isNew ? `Welcome, ${u.name.split(' ')[0]}. Let’s find your first mentor.` : 'Here’s what’s coming up and what to do next.')}
    <div class="dash-grid"><div>
      ${comp && comp.percent < 100 ? html`<section class="card" style="margin-bottom:24px" aria-labelledby="comp-h">
        <div class="row-between"><h2 id="comp-h" class="t-card mb-0">Your profile is ${comp.percent}% complete</h2><a class="btn btn-secondary btn-sm" href="#/profile">Finish profile</a></div>
        <div class="progress" style="margin:12px 0" role="progressbar" aria-valuenow="${comp.percent}" aria-valuemin="0" aria-valuemax="100" aria-label="Profile completion"><span style="width:${comp.percent}%"></span></div>
        <p class="t-small mb-0">Mentors read your profile before accepting. Still missing: ${comp.missing.map(m => m.label.toLowerCase()).join(', ')}.</p></section>` : ''}

      ${upcoming.length ? nextUpCard(upcoming[0]) : html`<section class="next-up" aria-labelledby="next-h"><span class="mock-label">Next step</span>
        ${conns.length ? html`<h2 id="next-h">Book your next session</h2><p>You have ${fmt.plural(conns.length, 'mentor')}. Pick a time from their availability.</p><a class="btn btn-primary" href="#/book/${conns[0].id}">${icon('calendar')}Book with ${conns[0].name}</a>`
          : pending.length ? html`<h2 id="next-h">Waiting on your request</h2><p>Mentors usually reply within a few days. While you wait, you can save other mentors to compare.</p><a class="btn btn-primary" href="#/mentors">Browse more mentors</a>`
          : html`<h2 id="next-h">Find your first mentor</h2><p>Search by career or interest, read reviews, then send a short introduction.</p><a class="btn btn-primary" href="#/mentors">${icon('search')}Find a mentor</a>`}</section>`}

      <div class="metrics" style="margin:32px 0" aria-label="Summary">
        <div class="metric"><strong>${conns.length}</strong><span>Active ${conns.length === 1 ? 'mentor' : 'mentors'}</span></div>
        <div class="metric"><strong>${upcoming.length}</strong><span>Upcoming ${upcoming.length === 1 ? 'session' : 'sessions'}</span></div>
        <div class="metric"><strong>${completed}</strong><span>Completed ${completed === 1 ? 'session' : 'sessions'}</span></div>
      </div>

      ${tasks.length ? html`<div class="section-title"><h2>Needs your attention</h2></div><ul class="task-list">${tasks}</ul>` : ''}
      ${upcoming.length > 1 ? html`<div class="section-title"><h2>Also coming up</h2><a href="#/sessions">All sessions</a></div>${upcoming.slice(1, 3).map(sessionCard)}` : ''}
    </div>

    <aside aria-labelledby="rec-h">
      <div class="section-title" style="margin-top:0"><h2 id="rec-h">Recommended for you</h2><button class="btn btn-tertiary btn-sm" data-action="explain-match">How?</button></div>
      ${recs.missing.length ? html`<div class="alert alert-info" style="margin-bottom:12px">${icon('info')}<p>Add your ${recs.missing.join(', ')} on <a href="#/profile">My profile</a> to get more relevant suggestions.</p></div>` : ''}
      ${recs.mentors.length ? html`<div class="card" style="padding-block:8px">${recs.mentors.map(m => html`<div class="rec">${avatar(m.name, m.id)}
          <div><a href="#/users/${m.id}"><strong>${m.name}</strong></a><div class="t-meta">${m.headline} · ${m.industry}</div>
            ${m.match.reasons[0] ? html`<p class="why">${icon('check')} ${m.match.reasons[0]}</p>` : ''}</div>
          <span class="match-score" title="Relevance score">${m.match.score}%<span class="sr-only"> relevance</span></span></div>`)}</div>
          <p class="t-meta" style="margin-top:8px">Scores show relevance to your profile, not a guarantee. <a href="#/mentors">See all matches</a></p>`
        : html`<p class="t-muted">No new recommendations right now. <a href="#/mentors">Browse all mentors</a>.</p>`}
    </aside></div>`;
}

async function mentorDashboard() {
  const u = MM.state.user;
  const [profile, sessions, requests, conns] = await Promise.all([api('/profile'), api('/sessions'), api('/requests'), api('/connections')]);
  MM.state.profile = profile;
  const cap = profile.capacityInfo;
  const newReqs = requests.filter(r => r.status === 'pending');
  const toConfirm = sessions.filter(s => s.canConfirm);
  const upcoming = upcomingOf(sessions).filter(s => s.status === 'confirmed');
  const completed = sessions.filter(s => s.status === 'completed').length;
  const comp = profile.completion;
  const approval = profile.approval_status;

  $('#main').innerHTML = html`
    ${pageHead('Your mentoring overview', 'Requests and confirmations first, then your upcoming sessions.')}
    ${approval === 'pending' ? html`<div class="alert alert-warn" style="margin-bottom:24px">${icon('clock')}<div><p><strong>Your mentor application is being reviewed.</strong> Students can’t find you until an administrator approves it. Meanwhile, finish your profile and set your availability so you’re ready.</p></div></div>` : ''}
    ${approval === 'rejected' ? html`<div class="alert alert-error" style="margin-bottom:24px">${icon('alert')}<div><p><strong>Your application was not approved.</strong> ${profile.approval_note || ''}</p></div></div>` : ''}
    <div class="dash-grid"><div>
      <div class="section-title" style="margin-top:0"><h2>Needs your attention</h2></div>
      ${!newReqs.length && !toConfirm.length ? html`<p class="t-muted">You’re all caught up. New requests and session confirmations will appear here.</p>` : ''}
      ${newReqs.slice(0, 3).map(r => html`<div class="req-card">${avatar(r.other_name, r.other_id)}
        <div><h3>${r.other_name}</h3><p class="meta">${[r.grade_level, r.industry].filter(Boolean).join(' · ')} · requested ${fmt.ago(r.created_at)}</p><blockquote>${r.message}</blockquote></div>
        <div class="actions"><a class="btn btn-primary btn-sm" href="#/requests">Review request</a></div></div>`)}
      ${newReqs.length > 3 ? html`<p><a href="#/requests">See all ${newReqs.length} new requests</a></p>` : ''}
      ${toConfirm.map(sessionCard)}

      <div class="section-title"><h2>Upcoming sessions</h2><a href="#/sessions">All sessions</a></div>
      ${upcoming.length ? upcoming.slice(0, 4).map(sessionCard) : html`<p class="t-muted">No confirmed sessions yet.</p>`}
    </div>

    <aside class="stack">
      <section class="card" aria-labelledby="cap-h">
        <h2 id="cap-h" class="t-card">Capacity</h2>
        <p class="mb-0"><strong>${cap.active} of ${cap.capacity}</strong> mentee spots in use</p>
        <div class="progress" style="margin:8px 0 16px" aria-hidden="true"><span style="width:${Math.min(100, Math.round(cap.active / cap.capacity * 100))}%"></span></div>
        <div class="switch-row"><span class="switch-label" id="acc-l">Accepting new requests<small>${cap.full ? 'You’re at capacity, so students can’t send new requests.' : 'Turn off to pause new requests. Current mentees are not affected.'}</small></span>
          <span class="switch"><input type="checkbox" id="acceptToggle" role="switch" aria-labelledby="acc-l" ${raw(profile.accepting ? 'checked' : '')}><span></span></span></div>
        <p class="t-meta mb-0"><a href="#/profile">Change capacity</a></p>
      </section>
      <section class="card" aria-labelledby="av-h"><h2 id="av-h" class="t-card">Availability</h2>
        ${profile.availability.length ? html`<p class="t-small">${fmt.plural(profile.availability.length, 'weekly window')} set. Students can book open times inside them.</p>`
          : html`<div class="alert alert-warn">${icon('alert')}<p>No availability set. Students can’t book sessions with you yet.</p></div>`}
        <a class="btn btn-secondary btn-sm" href="#/availability">Edit availability</a></section>
      ${comp.percent < 100 ? html`<section class="card" aria-labelledby="pc-h"><h2 id="pc-h" class="t-card">Profile ${comp.percent}% complete</h2>
        <div class="progress" style="margin-bottom:8px" role="progressbar" aria-valuenow="${comp.percent}" aria-valuemin="0" aria-valuemax="100" aria-label="Profile completion"><span style="width:${comp.percent}%"></span></div>
        <p class="t-small">Missing: ${comp.missing.map(m => m.label.toLowerCase()).join(', ')}.</p><a class="btn btn-secondary btn-sm" href="#/profile">Finish profile</a></section>` : ''}
      <section class="card" aria-labelledby="ct-h"><h2 id="ct-h" class="t-card">Your contribution</h2>
        <div class="metrics" style="gap:24px"><div class="metric"><strong>${completed}</strong><span>Completed sessions</span></div>
          <div class="metric"><strong>${conns.length}</strong><span>Active mentees</span></div></div></section>
    </aside></div>`;

  $('#acceptToggle').addEventListener('change', async e => {
    try { await api('/profile/accepting', { method: 'PATCH', body: { accepting: e.target.checked } }); toast(e.target.checked ? 'You’re accepting new requests.' : 'New requests paused. Current mentees are not affected.'); }
    catch (err) { e.target.checked = !e.target.checked; toast(err.message, 'error'); }
  });
}
