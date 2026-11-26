/* views/admin.js — administration (spec §17): overview, moderation queue with case view,
   user management with search/filters, mentor approvals, and an audit log that records
   who acted, when, and why. Serious actions always ask for a reason and confirmation. */
'use strict';

const ADMIN = { auth: true, roles: ['admin'] };

MM.route('/admin', async () => {
  const [s, flags, approvals, audit] = await Promise.all([api('/admin/stats'), api('/admin/flags?status=open'), api('/admin/approvals'), api('/admin/audit')]);
  $('#main').innerHTML = html`${pageHead('Moderation center', 'Outstanding work first. Everything here comes from the live database.')}
    <div class="metrics" style="margin-bottom:32px" aria-label="Summary">
      <div class="metric"><strong>${s.openFlags}</strong><span><a href="#/admin/reports">Open reports</a></span></div>
      <div class="metric"><strong>${s.pendingApprovals}</strong><span><a href="#/admin/approvals">Pending mentor approvals</a></span></div>
      <div class="metric"><strong>${s.suspended}</strong><span><a href="#/admin/users?status=suspended">Suspended accounts</a></span></div>
      <div class="metric"><strong>${s.mentees}</strong><span>Students</span></div>
      <div class="metric"><strong>${s.mentors}</strong><span>Approved mentors</span></div>
      <div class="metric"><strong>${s.completed}</strong><span>Completed sessions</span></div>
    </div>
    <div class="dash-grid"><div>
      <div class="section-title" style="margin-top:0"><h2>Reports requiring review</h2><a href="#/admin/reports">Open queue</a></div>
      ${flags.length ? reportsTable(flags.slice(0, 5)) : html`<p class="t-muted">No open reports right now. New reports from users will appear here.</p>`}
      <div class="section-title"><h2>Mentor applications</h2><a href="#/admin/approvals">Review all</a></div>
      ${approvals.length ? html`<ul class="task-list">${approvals.slice(0, 4).map(a => html`<li>${icon('user-check')}<div style="flex:1"><strong>${a.name}</strong> · ${a.headline}${a.organization ? `, ${a.organization}` : ''} <span class="t-meta">· applied ${fmt.ago(a.created_at)}</span></div><a class="btn btn-secondary btn-sm" href="#/admin/approvals">Review</a></li>`)}</ul>`
        : html`<p class="t-muted">No applications waiting.</p>`}
    </div>
    <aside><div class="section-title" style="margin-top:0"><h2>Recent admin actions</h2><a href="#/admin/audit">Audit log</a></div>
      ${audit.length ? html`<ul class="task-list">${audit.slice(0, 6).map(a => html`<li>${icon('list')}<div><strong>${a.action}</strong>${a.target ? html` <span class="t-meta">(${a.target})</span>` : ''}<div class="t-meta">${a.admin} · ${fmt.ago(a.created_at)}</div></div></li>`)}</ul>`
        : html`<p class="t-muted">No actions recorded yet.</p>`}</aside></div>`;
}, { ...ADMIN, title: 'Admin overview' });

const reportsTable = rows => html`<div class="table-wrap"><table><caption class="sr-only">Reports</caption>
  <thead><tr><th scope="col">Report</th><th scope="col">Type</th><th scope="col">Reason</th><th scope="col">Reported content</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
  <tbody>${rows.map(f => html`<tr><td>#${f.id}<div class="t-meta">${fmt.ago(f.created_at)}</div></td><td style="text-transform:capitalize">${f.target_type === 'user' ? 'Profile' : f.target_type}</td>
    <td>${f.reason}</td><td style="max-width:280px"><span style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${f.preview}</span>${f.author ? html`<div class="t-meta">by ${f.author.name}</div>` : ''}</td>
    <td>${statusLabel('flag', f.status)}</td><td><a class="btn btn-secondary btn-sm" href="#/admin/reports/${f.id}" aria-label="View details for report ${f.id}">Details</a></td></tr>`)}</tbody></table></div>`;

MM.route('/admin/reports', async () => {
  const q = MM.query();
  const status = q.get('status') ?? 'open', type = q.get('type') || '', search = q.get('q') || '';
  const rows = await api(`/admin/flags?status=${status}&type=${type}&q=${encodeURIComponent(search)}`);
  $('#main').innerHTML = html`${pageHead('Moderation queue', 'Open a report to see its context before deciding.')}
    <form id="rf" class="filter-bar" role="search" aria-label="Filter reports">
      <div class="field" style="flex:1;min-width:220px"><label for="rq">Search reports</label><input id="rq" name="q" type="search" value="${search}" placeholder="Reason, content, name, or report number"></div>
      ${field({ name: 'status', label: 'Status', required: true, options: [['open', 'Open'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed'], ['', 'All']], value: status })}
      ${field({ name: 'type', label: 'Type', required: true, options: [['', 'All types'], ['user', 'Profiles'], ['review', 'Reviews'], ['message', 'Messages']], value: type })}
      <button class="btn btn-secondary" type="submit">Apply</button></form>
    <p role="status">${fmt.plural(rows.length, 'report')}</p>
    ${rows.length ? reportsTable(rows) : emptyState({ ic: 'flag', title: 'No reports match', body: status === 'open' ? 'There are no open reports. An empty queue doesn’t prove nothing is wrong, so keep an eye on new reports.' : 'Try a different filter.' })}`;
  $('#rf').addEventListener('submit', e => { e.preventDefault(); const v = new URLSearchParams(Object.fromEntries(new FormData(e.target))); MM.go(`#/admin/reports?${v}`); });
  $('#rf').addEventListener('change', e => { if (e.target.tagName === 'SELECT') e.target.form.requestSubmit(); });
}, { ...ADMIN, title: 'Moderation queue' });

const ACTION_COPY = {
  resolve: ['Mark resolved', 'Use when the issue has been handled and no further action is needed.', false, false],
  dismiss: ['Dismiss report', 'Use when the content does not break the community guidelines.', false, false],
  hide_content: ['Remove content', 'Hides the review or replaces the message with “[removed by a moderator]”.', true, true],
  suspend_author: ['Suspend author', 'The account is blocked immediately. You can reactivate it later from Users.', true, true],
};

MM.route('/admin/reports/:id', async ({ id }) => {
  const f = await api(`/admin/flags/${id}`);
  $('#main').innerHTML = html`<a class="back-link" href="#/admin/reports">${icon('arrow-left')}Back to queue</a>
    ${pageHead(`Report #${f.id}`, `${f.reason} · reported ${fmt.ago(f.created_at)} by ${f.reporter} (${f.reporter_role === 'mentee' ? 'student' : f.reporter_role})`, statusLabel('flag', f.status))}
    <div class="case-grid"><div class="stack-lg">
      <section><h2 class="t-section">Reported ${f.target_type === 'user' ? 'profile' : f.target_type}</h2>
        ${f.target_type === 'message' && f.context ? html`<p class="t-small t-muted">Conversation in session “${f.session?.topic}” between ${f.session?.mentee} (student) and ${f.session?.mentor} (mentor). The reported message is highlighted.</p>
          ${f.context.map(m => html`<div class="context-msg ${m.id === f.target_id ? 'target' : ''}"><strong>${m.sender}</strong> <span class="t-meta">${fmt.ago(m.created_at)}</span><div>${m.body}</div></div>`)}`
        : f.target_type === 'review' && f.review ? html`<div class="card"><p class="mb-0">${starRow(f.review.rating)} ${f.review.rating}/5 by <strong>${f.review.reviewer}</strong> about <strong>${f.review.reviewee}</strong> · ${fmt.ago(f.review.created_at)}${f.review.hidden ? ' · currently hidden' : ''}</p><p class="mb-0" style="margin-top:8px">${f.review.comment}</p></div>`
        : html`<div class="card"><p class="mb-0"><a href="#/users/${f.target_id}">${f.preview}</a></p></div>`}
      </section>
      ${f.details ? html`<section><h2 class="t-section">Reporter’s note</h2><blockquote class="card mb-0">${f.details}</blockquote></section>` : ''}
      ${f.status !== 'open' ? html`<section><h2 class="t-section">Outcome</h2><p>${statusLabel('flag', f.status)} ${f.resolved_at ? `on ${fmt.sqlDate(f.resolved_at).toLocaleString()}` : ''}</p>${f.resolution_note ? html`<p>Reason: ${f.resolution_note}</p>` : ''}</section>` : ''}
    </div>
    <aside class="stack">
      ${f.author ? html`<section class="card"><h2 class="t-card">Author account</h2><dl class="kv">
        <dt>Name</dt><dd><a href="#/admin/users/${f.author.id}">${f.author.name}</a></dd><dt>Role</dt><dd>${f.author.role === 'mentee' ? 'Student' : f.author.role}</dd>
        <dt>Status</dt><dd>${statusLabel('account', f.author.status)}</dd><dt>Joined</dt><dd>${f.authorHistory?.created_at ? fmt.ago(f.authorHistory.created_at) : '—'}</dd>
        <dt>Open reports on profile</dt><dd>${f.authorHistory?.openReports ?? 0}</dd></dl></section>` : ''}
      ${f.allowedActions.length ? html`<section class="card"><h2 class="t-card">Decide</h2><div class="stack">
        ${f.allowedActions.map(a => html`<div><button class="btn ${ACTION_COPY[a][2] ? 'btn-danger-outline' : 'btn-secondary'} btn-block" data-flag-act="${a}">${ACTION_COPY[a][0]}</button><p class="t-meta mb-0" style="margin-top:4px">${ACTION_COPY[a][1]}</p></div>`)}
      </div></section>` : ''}
    </aside></div>`;
  $('#main').addEventListener('click', async e => {
    const b = e.target.closest('[data-flag-act]'); if (!b) return;
    const a = b.dataset.flagAct, [label, explain, serious, needReason] = ACTION_COPY[a];
    const ok = await confirmDialog({ title: `${label}?`, confirmLabel: label, danger: serious, body: html`<p>${explain}</p>`,
      reason: { name: 'note', label: needReason ? 'Reason (saved in the audit log)' : 'Note (optional, saved in the audit log)', required: needReason },
      action: v => api(`/admin/flags/${id}`, { method: 'PATCH', body: { action: a, note: v.note } }) });
    if (ok) { toast('Report updated.'); refreshCounts(); MM.render(); }
  });
}, { ...ADMIN, title: 'Report details' });

// ---------- Users ----------
MM.route('/admin/users', async () => {
  const q = MM.query();
  const params = new URLSearchParams({ q: q.get('q') || '', role: q.get('role') || '', status: q.get('status') || '' });
  const rows = await api(`/admin/users?${params}`);
  $('#main').innerHTML = html`${pageHead('Users', 'Search, filter, and open an account to inspect it.')}
    <form id="uf" class="filter-bar" role="search" aria-label="Filter users">
      <div class="field" style="flex:1;min-width:220px"><label for="uq">Search by name or email</label><input id="uq" name="q" type="search" value="${params.get('q')}"></div>
      ${field({ name: 'role', label: 'Role', required: true, options: [['', 'All roles'], ['mentee', 'Students'], ['mentor', 'Mentors'], ['admin', 'Admins']], value: params.get('role') })}
      ${field({ name: 'status', label: 'Status', required: true, options: [['', 'Any status'], ['active', 'Active'], ['suspended', 'Suspended']], value: params.get('status') })}
      <button class="btn btn-secondary" type="submit">Apply</button></form>
    <p role="status">${fmt.plural(rows.length, 'account')}</p>
    ${rows.length ? html`<div class="table-wrap"><table><caption class="sr-only">Users</caption>
      <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Open reports</th><th scope="col">Joined</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${rows.map(r => html`<tr><td><strong>${r.name}</strong><div class="t-meta">${r.email}</div></td>
        <td>${r.role === 'mentee' ? 'Student' : r.role === 'mentor' ? 'Mentor' : 'Admin'}${r.role === 'mentor' && r.approval_status !== 'approved' ? html`<div>${statusLabel('approval', r.approval_status)}</div>` : ''}</td>
        <td>${statusLabel('account', r.status)}</td><td>${r.open_flags ? html`<span class="status status-warn">${r.open_flags}</span>` : '0'}</td><td>${fmt.ago(r.created_at)}</td>
        <td><a class="btn btn-secondary btn-sm" href="#/admin/users/${r.id}" aria-label="Inspect ${r.name}">Inspect</a></td></tr>`)}</tbody></table></div>`
      : emptyState({ ic: 'users', title: 'No accounts match', body: 'Try a different search or filter.' })}`;
  $('#uf').addEventListener('submit', e => { e.preventDefault(); MM.go(`#/admin/users?${new URLSearchParams(Object.fromEntries(new FormData(e.target)))}`); });
  $('#uf').addEventListener('change', e => { if (e.target.tagName === 'SELECT') e.target.form.requestSubmit(); });
}, { ...ADMIN, title: 'Users' });

MM.route('/admin/users/:id', async ({ id }) => {
  const u = await api(`/admin/users/${id}`);
  const p = u.profile || {};
  const isAdmin = u.role === 'admin';
  $('#main').innerHTML = html`<a class="back-link" href="#/admin/users">${icon('arrow-left')}Back to users</a>
    <div class="page-head"><div class="row">${avatar(u.name, u.id, 'lg')}<div><h1 class="t-app-title mb-0">${u.name}</h1><p>${u.email} · ${u.role === 'mentee' ? 'Student' : u.role} · joined ${fmt.ago(u.created_at)}</p></div></div>
      <div class="row">${statusLabel('account', u.status)}${u.role === 'mentor' ? statusLabel('approval', u.approval_status) : ''}</div></div>
    <div class="case-grid"><div class="stack">
      <section class="card"><h2 class="t-card">Profile</h2><dl class="kv">
        ${u.role === 'mentor' ? html`<dt>Job title</dt><dd>${p.headline || '—'}</dd><dt>Employer</dt><dd>${p.organization || '—'}</dd>` : html`<dt>Grade or year</dt><dd>${p.grade_level || '—'}</dd><dt>School</dt><dd>${p.organization || '—'}</dd>`}
        <dt>Industry</dt><dd>${p.industry || '—'}</dd><dt>Interests</dt><dd>${tags(p.interests).join(', ') || '—'}</dd>
        ${u.role === 'mentee' ? html`<dt>Guardian acknowledgment</dt><dd>${p.guardian_ack_at ? fmt.ago(p.guardian_ack_at) : 'Not required or not recorded'}</dd>` : ''}
      </dl>${u.role !== 'admin' ? html`<p class="mb-0" style="margin-top:12px"><a href="#/users/${u.id}">Open full profile</a></p>` : ''}</section>
      <section class="card"><h2 class="t-card">Activity</h2><dl class="kv"><dt>Sessions</dt><dd>${u.counts.sessions}</dd><dt>Reports against</dt><dd>${u.counts.reportsAgainst}</dd><dt>Reports filed</dt><dd>${u.counts.reportsFiled}</dd></dl></section>
      <section><h2 class="t-section">Admin history for this account</h2>
        ${u.history.length ? html`<ul class="task-list">${u.history.map(h => html`<li>${icon('list')}<div><strong>${h.action}</strong>${h.reason ? ` — “${h.reason}”` : ''}<div class="t-meta">${fmt.ago(h.created_at)}</div></div></li>`)}</ul>` : html`<p class="t-muted">No admin actions yet.</p>`}</section>
    </div>
    <aside>${isAdmin ? html`<p class="t-muted">Administrator accounts can’t be suspended or deleted here.</p>` : html`<section class="card stack"><h2 class="t-card">Actions</h2>
      ${u.status === 'active' ? html`<button class="btn btn-danger-outline btn-block" data-user-act="suspended">${icon('lock')}Suspend account</button>` : html`<button class="btn btn-secondary btn-block" data-user-act="active">Reactivate account</button>`}
      <button class="btn btn-danger btn-block" data-user-delete>${icon('trash')}Delete account permanently</button>
      <p class="t-meta mb-0">Deleting removes the account, its sessions, messages, and reviews. This cannot be undone. Prefer suspension when unsure.</p></section>`}</aside></div>`;
  $('#main').addEventListener('click', async e => {
    const s = e.target.closest('[data-user-act]');
    if (s) {
      const suspend = s.dataset.userAct === 'suspended';
      const ok = await confirmDialog({ title: suspend ? `Suspend ${u.name}?` : `Reactivate ${u.name}?`, danger: suspend, confirmLabel: suspend ? 'Suspend account' : 'Reactivate account',
        body: html`<p>${suspend ? 'They will be logged out of every action immediately and hidden from students.' : 'They will be able to log in and use MentorshipMatch again.'}</p>`,
        reason: { label: 'Reason (saved in the audit log)', required: true },
        action: v => api(`/admin/users/${id}`, { method: 'PATCH', body: { status: s.dataset.userAct, reason: v.reason } }) });
      if (ok) { toast(suspend ? 'Account suspended.' : 'Account reactivated.'); MM.render(); }
    }
    if (e.target.closest('[data-user-delete]')) {
      const ok = await confirmDialog({ title: `Permanently delete ${u.name}?`, danger: true, confirmLabel: 'Delete permanently',
        body: html`<p>This removes the account and all of its sessions, messages, and reviews. <strong>It cannot be undone.</strong></p>`,
        reason: { label: 'Reason (saved in the audit log)', required: true }, typeToConfirm: u.name,
        action: v => api(`/admin/users/${id}`, { method: 'DELETE', body: { reason: v.reason, confirmName: v.confirmName } }) });
      if (ok) { toast('Account deleted.'); MM.go('#/admin/users'); }
    }
  });
}, { ...ADMIN, title: 'User details' });

// ---------- Mentor approvals ----------
MM.route('/admin/approvals', async () => {
  const list = await api('/admin/approvals');
  $('#main').innerHTML = html`${pageHead('Mentor approvals', 'Review professional information before students can find a mentor. Approval means an administrator reviewed the application; it is not a background check.')}
    ${list.length ? list.map(a => html`<article class="card" style="margin-bottom:16px" aria-labelledby="ap-${a.id}">
      <div class="row-between"><div class="row">${avatar(a.name, a.id, 'lg')}<div><h2 id="ap-${a.id}" class="t-card mb-0">${a.name}</h2><p class="t-muted mb-0">${a.headline}${a.organization ? ` · ${a.organization}` : ''}</p>
        <p class="t-meta mb-0">${a.email} · applied ${fmt.ago(a.created_at)}</p></div></div>${statusLabel('approval', 'pending')}</div>
      <dl class="kv" style="margin-top:16px"><dt>Industry</dt><dd>${a.industry || '—'}</dd><dt>Experience</dt><dd>${a.years_experience ? fmt.plural(a.years_experience, 'year') : '—'}</dd>
        <dt>Topics</dt><dd>${tags(a.interests).join(', ') || '—'}</dd>
        <dt>Work history</dt><dd>${a.experience_list.length ? a.experience_list.map(x => html`<div>${x.title}${x.org ? `, ${x.org}` : ''}${x.years ? ` (${x.years})` : ''}</div>`) : '—'}</dd>
        <dt>Education</dt><dd>${a.education_list.join('; ') || '—'}</dd><dt>Introduction</dt><dd>${a.bio || '—'}</dd>
        <dt>Availability</dt><dd>${a.availability.length ? fmt.plural(a.availability.length, 'weekly window') : 'Not set yet'}</dd></dl>
      <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn btn-danger-outline" data-approve="rejected" data-id="${a.id}" data-name="${a.name}">Reject</button>
        <button class="btn btn-primary" data-approve="approved" data-id="${a.id}" data-name="${a.name}">${icon('check')}Approve mentor</button></div></article>`)
    : emptyState({ ic: 'user-check', title: 'No applications waiting', body: 'New mentor sign-ups appear here for review.' })}`;
  $('#main').addEventListener('click', async e => {
    const b = e.target.closest('[data-approve]'); if (!b) return;
    const approve = b.dataset.approve === 'approved';
    const ok = await confirmDialog({ title: approve ? `Approve ${b.dataset.name}?` : `Reject ${b.dataset.name}’s application?`, danger: !approve, confirmLabel: approve ? 'Approve mentor' : 'Reject application',
      body: html`<p>${approve ? 'They will appear in search and students can send them requests.' : 'They will see your reason on their dashboard and will not appear to students.'}</p>`,
      reason: { name: 'note', label: approve ? 'What did you check? (optional, saved in the audit log)' : 'Reason (shown to the applicant and saved in the audit log)', required: !approve },
      action: v => api(`/admin/approvals/${b.dataset.id}`, { method: 'PATCH', body: { decision: b.dataset.approve, note: v.note } }) });
    if (ok) { toast(approve ? 'Mentor approved.' : 'Application rejected.'); refreshCounts(); MM.render(); }
  });
}, { ...ADMIN, title: 'Mentor approvals' });

MM.route('/admin/audit', async () => {
  const rows = await api('/admin/audit');
  $('#main').innerHTML = html`${pageHead('Audit log', 'Every administrator action: who acted, when, on what, and why.')}
    ${rows.length ? html`<div class="table-wrap"><table><caption class="sr-only">Audit log</caption>
      <thead><tr><th scope="col">When</th><th scope="col">Administrator</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col">Reason</th></tr></thead>
      <tbody>${rows.map(a => html`<tr><td class="nowrap">${fmt.sqlDate(a.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
        <td>${a.admin || '—'}</td><td>${a.action}</td><td>${a.target || '—'}</td><td>${a.reason || html`<span class="t-muted">None given</span>`}</td></tr>`)}</tbody></table></div>`
      : emptyState({ ic: 'list', title: 'No actions recorded yet', body: 'Approvals, suspensions, deletions, and report decisions are recorded here.' })}`;
}, { ...ADMIN, title: 'Audit log' });
