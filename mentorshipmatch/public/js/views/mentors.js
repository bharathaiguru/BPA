/* views/mentors.js — mentor discovery (spec §11), mentor & student profiles (§12),
   and the relationship views "My mentors" / "My mentees" (§6). */
'use strict';

// ---------- Directory (used logged-in at #/mentors and publicly at #/explore) ----------
let dirAbort = null;
async function directoryView({ publicView = false } = {}) {
  const isMentee = MM.state.user?.role === 'mentee';
  const q = MM.query();
  const state = { q: q.get('q') || '', industry: q.get('industry') || '', format: q.get('format') || '', available: q.get('available') === '1',
    sort: q.get('sort') || (isMentee ? 'relevance' : 'rating') };
  const industries = await api('/public/industries').catch(() => []);
  const sortOptions = [...(isMentee ? [['relevance', 'Best match for you']] : []), ['rating', 'Highest rated'], ['experience', 'Most experienced'], ['soonest', 'Earliest availability']];

  $('#main').innerHTML = html`<div class="${publicView ? 'container' : ''}" style="${publicView ? 'padding:48px 0 96px' : ''}">
    ${pageHead('Find your mentor', 'Discover professionals who can help you take your next step.',
      isMentee ? html`<button class="btn btn-tertiary" data-action="explain-match">${icon('help')}How matching works</button>` : '')}
    ${publicView ? html`<div class="alert alert-info" style="margin-bottom:24px">${icon('info')}<p>You’re browsing as a visitor. <a href="#/register">Create a free student account</a> to request mentorship and see personalized matches.</p></div>` : ''}
    <form id="dirForm" role="search" aria-label="Search mentors">
      <div class="search-bar"><div class="field search-field"><label for="dirQ">Search by career, skill, or expertise</label>
        <div style="position:relative">${icon('search')}<input id="dirQ" name="q" type="search" value="${state.q}" placeholder="e.g. software engineering, pre-med, marketing" autocomplete="off" style="padding-left:2.6rem"></div></div></div>
      <div class="filter-bar">
        ${field({ name: 'industry', label: 'Industry', options: [['', 'All industries'], ...industries.map(i => [i.industry, `${i.industry} (${i.count})`])], value: state.industry, required: true })}
        ${field({ name: 'format', label: 'Session type', options: [['', 'Video or chat'], ['video', 'Video calls'], ['chat', 'Chat sessions']], value: state.format, required: true })}
        ${field({ name: 'sort', label: 'Sort by', options: sortOptions, value: state.sort, required: true })}
        <label class="check"><input type="checkbox" name="available" value="1" ${raw(state.available ? 'checked' : '')}> Accepting requests with open times</label>
      </div>
    </form>
    <div class="result-bar"><p class="mb-0" id="dirCount" role="status" aria-live="polite"></p><div class="active-filters" id="activeFilters"></div></div>
    <div id="dirResults">${skeletonCards(4)}</div>
  </div>`;
  $$('#dirForm .field label').forEach(l => l.querySelector('.t-meta')?.remove());

  const form = $('#dirForm');
  const load = async () => {
    const v = Object.fromEntries(new FormData(form));
    Object.assign(state, { q: v.q.trim(), industry: v.industry, format: v.format, sort: v.sort, available: !!v.available });
    const params = new URLSearchParams(Object.entries({ q: state.q, industry: state.industry, format: state.format, sort: state.sort, available: state.available ? '1' : '' }).filter(([, x]) => x));
    const newHash = `#${MM.path()}${params.toString() ? '?' + params : ''}`;
    history.replaceState(null, '', newHash);                      // keep filters in the URL (shareable, survives Back)
    sessionStorage.setItem('mm-lastDirectory', newHash);
    renderChips();
    dirAbort?.abort(); dirAbort = new AbortController();          // ignore superseded searches
    $('#dirResults').setAttribute('aria-busy', 'true');
    try {
      const list = await api(`${publicView ? '/public/mentors' : '/mentors'}?${params}`, { signal: dirAbort.signal });
      $('#dirCount').textContent = `${fmt.plural(list.length, 'mentor')} found`;
      $('#dirResults').innerHTML = list.length ? html`<div class="mentor-grid">${list.map(m => mentorCard(m, { publicView }))}</div>`
        : emptyState({ ic: 'search', title: 'No mentors match these filters', body: 'Try a broader search term, another industry, or remove a filter.',
          action: html`<button class="btn btn-secondary" data-action="clear-filters">Clear all filters</button>` });
    } catch (e) { if (e.name !== 'AbortError') $('#dirResults').innerHTML = html`<div class="alert alert-error">${icon('alert')}<p>${e.message}</p></div>`; }
    finally { $('#dirResults').removeAttribute('aria-busy'); }
  };
  const renderChips = () => {
    const chips = [];
    if (state.q) chips.push(['q', `“${state.q}”`]);
    if (state.industry) chips.push(['industry', state.industry]);
    if (state.format) chips.push(['format', state.format === 'video' ? 'Video calls' : 'Chat sessions']);
    if (state.available) chips.push(['available', 'Accepting requests']);
    $('#activeFilters').innerHTML = chips.length ? html`<span class="t-meta">Active filters:</span>${chips.map(([k, l]) => html`<button type="button" class="chip-remove" data-remove-filter="${k}" aria-label="Remove filter ${l}">${l}${icon('x')}</button>`)}
      <button type="button" class="btn btn-tertiary btn-sm" data-action="clear-filters">Clear all</button>` : '';
  };
  let timer;
  form.addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(load, e.target.name === 'q' ? 300 : 0); });
  form.addEventListener('submit', e => { e.preventDefault(); load(); });
  $('#main').addEventListener('click', e => {
    const rm = e.target.closest('[data-remove-filter]');
    if (rm) { const k = rm.dataset.removeFilter; if (k === 'available') form.available.checked = false; else form[k].value = ''; load(); form.q.focus(); }
    if (e.target.closest('[data-action="clear-filters"]')) { form.q.value = ''; form.industry.value = ''; form.format.value = ''; form.available.checked = false; load(); form.q.focus(); }
  });
  await load();
}
MM.route('/mentors', () => directoryView(), { auth: true, roles: ['mentee'], title: 'Find mentors' });

// ---------- Saving mentors (works on cards and profiles) ----------
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-action="save"]');
  if (b) {
    const saved = b.getAttribute('aria-pressed') === 'true';
    try {
      await api(`/saved/${b.dataset.id}`, { method: saved ? 'DELETE' : 'PUT' });
      b.setAttribute('aria-pressed', String(!saved));
      const name = b.closest('[aria-labelledby]')?.querySelector('h1, h3')?.textContent || 'mentor';
      b.setAttribute('aria-label', `${saved ? 'Save' : 'Remove'} ${name} ${saved ? 'to' : 'from'} saved mentors`);
      b.innerHTML = (b.dataset.label ? html`${icon('bookmark', saved ? '' : 'filled')}${saved ? 'Save' : 'Saved'}` : icon('bookmark', saved ? '' : 'filled')).s;
      toast(saved ? 'Removed from saved mentors.' : 'Saved. Find it under My mentors.');
    } catch (err) { toast(err.message, 'error'); }
  }
  if (e.target.closest('[data-action="explain-match"]')) matchingExplainer();
});

// ---------- Mentor profile (spec §12): built around choosing a mentor ----------
function connectPanel(p, publicView) {
  const me = MM.state.user;
  const first = p.name.replace(/^Dr\.\s+/, '').split(' ')[0];
  let action = '';
  if (publicView) action = html`<a class="btn btn-primary btn-block" href="#/register">Sign up to request mentorship</a>
    <p class="t-meta" style="margin-top:8px">Already have an account? <a href="#/login?next=/users/${p.id}">Log in</a></p>`;
  else if (me?.role === 'mentee') {
    const rel = p.relationship;
    if (rel === 'accepted') action = html`${statusLabel('request_mentee', 'accepted')}<p class="t-small" style="margin:8px 0 12px">${first} is your mentor. Pick a time that works for both of you.</p>
      <a class="btn btn-primary btn-block" href="#/book/${p.id}">${icon('calendar')}Book a session with ${first}</a>`;
    else if (rel === 'pending') action = html`${statusLabel('request_mentee', 'pending')}<p class="t-small" style="margin:8px 0 12px">${first} hasn’t responded yet. You’ll be able to book once they accept.</p>
      <a class="btn btn-secondary btn-block" href="#/requests">View pending request</a>`;
    else if (rel === 'declined') action = html`${statusLabel('request_mentee', 'declined')}<p class="t-small" style="margin:8px 0 12px">${first} isn’t able to mentor you right now. Many other mentors may be a great fit.</p>
      <a class="btn btn-primary btn-block" href="#/mentors?industry=${encodeURIComponent(p.industry || '')}">Discover mentors in ${p.industry || 'this field'}</a>`;
    else if (!p.accepting) action = html`<span class="status status-neutral">${icon('pause')}${p.paused ? 'Not accepting new requests right now' : 'At capacity right now'}</span>
      <p class="t-small" style="margin:8px 0 12px">You can save ${first} and check back later.</p>
      <a class="btn btn-secondary btn-block" href="#/mentors?industry=${encodeURIComponent(p.industry || '')}">See similar mentors</a>`;
    else action = html`<button class="btn btn-primary btn-block btn-lg" data-action="request" data-id="${p.id}" data-name="${p.name}">Request mentorship</button>
      <p class="t-meta" style="margin-top:8px">A mentor must accept your request before you can book.</p>`;
  } else if (me?.role === 'admin') action = html`<a class="btn btn-secondary btn-block" href="#/admin/users/${p.id}">Open in admin</a>`;
  return html`<aside class="card connect-panel" aria-labelledby="connect-h">
    <h2 id="connect-h" class="t-card">Free mentorship</h2>
    <ul>
      <li>${icon('clock')}${p.durations_list.map(d => `${d}`).join(', ')} minute sessions</li>
      ${p.offers_video ? html`<li>${icon('video')}Video calls</li>` : ''}${p.offers_chat ? html`<li>${icon('chat')}Chat sessions</li>` : ''}
      <li>${icon('shield')}Conversations stay on MentorshipMatch</li>
    </ul>${action}
    ${me?.role === 'mentee' && 'saved' in p ? html`<button class="btn btn-tertiary btn-block" style="margin-top:8px" data-action="save" data-label="1" data-id="${p.id}" aria-pressed="${p.saved}" aria-label="${p.saved ? 'Remove' : 'Save'} ${p.name} ${p.saved ? 'from' : 'to'} saved mentors">${icon('bookmark', p.saved ? 'filled' : '')}${p.saved ? 'Saved' : 'Save'}</button>` : ''}
  </aside>`;
}

function mentorProfile(p, { publicView = false } = {}) {
  const me = MM.state.user;
  const back = sessionStorage.getItem('mm-lastDirectory') || (publicView ? '#/explore' : '#/mentors');
  const tzLabel = new Intl.DateTimeFormat('en-US', { timeZone: p.timezone || 'America/Chicago', timeZoneName: 'long' }).formatToParts(new Date()).find(x => x.type === 'timeZoneName')?.value;
  const byDay = WEEKDAYS.map((d, i) => [d, p.availability.filter(w => w.weekday === i)]).filter(([, w]) => w.length);
  return html`<article aria-labelledby="pname">
    ${me?.role !== 'mentor' ? html`<a class="back-link" href="${back}">${icon('arrow-left')}Back to mentors</a>` : ''}
    <header class="profile-head">${avatar(p.name, p.id, 'xl')}
      <div style="flex:1;min-width:240px"><h1 id="pname" class="t-app-title">${p.name}</h1>
        <p class="role">${p.headline}${p.organization ? ` · ${p.organization}` : ''}</p>
        <div class="row">${category(p.industry)}<span>${ratingText(p.rating, p.reviewCount)}</span>
          ${p.years_experience ? html`<span class="t-small t-muted">${icon('briefcase')} ${fmt.plural(p.years_experience, 'year')} experience</span>` : ''}</div></div>
      ${me && me.id !== p.id ? html`<button class="btn btn-tertiary btn-sm" data-action="report" data-type="user" data-id="${p.id}">${icon('flag')}Report profile</button>` : ''}
    </header>
    <div class="profile-layout">
      <div>
        ${p.bio ? html`<section><h2>How I can help</h2><p>${p.bio}</p></section>` : ''}
        ${p.interests || p.skills ? html`<section><h2>Areas of expertise</h2>
          ${p.interests ? html`<p class="label">Mentoring topics</p><ul class="tags" style="margin-bottom:16px">${tags(p.interests).map(x => html`<li class="tag">${x}</li>`)}</ul>` : ''}
          ${p.skills ? html`<p class="label">Skills</p><ul class="tags">${tags(p.skills).map(x => html`<li class="tag">${x}</li>`)}</ul>` : ''}</section>` : ''}
        ${p.experience_list.length ? html`<section><h2>Professional experience</h2><ul class="xp">${p.experience_list.map(x => html`<li><strong>${x.title}</strong><span>${[x.org, x.years].filter(Boolean).join(' · ')}</span></li>`)}</ul></section>` : ''}
        ${p.education_list.length ? html`<section><h2>Education</h2><ul>${p.education_list.map(x => html`<li>${x}</li>`)}</ul></section>` : ''}
        ${p.achievements_list.length ? html`<section><h2>Achievements &amp; certifications</h2><ul>${p.achievements_list.map(x => html`<li>${x}</li>`)}</ul>
          <p class="t-meta">Listed by the mentor. MentorshipMatch administrators review applications but do not independently verify every credential.</p></section>` : ''}
        ${p.mentoring_style ? html`<section><h2>Mentoring style</h2><p>${p.mentoring_style}</p></section>` : ''}
        <section><h2>Weekly availability</h2>
          ${byDay.length ? html`<dl class="week">${byDay.map(([d, ws]) => html`<dt>${d}</dt><dd>${ws.map(w => `${to12h(w.start)}–${to12h(w.end)}`).join(', ')}</dd>`)}</dl>
            <p class="t-meta">Shown in the mentor’s time zone (${tzLabel}). When you book, open times are shown in your own time zone.</p>`
            : html`<p class="t-muted">This mentor hasn’t set weekly availability yet.</p>`}</section>
        <section><h2>Reviews</h2>
          ${p.reviews.length ? p.reviews.map(r => html`<div class="review"><div class="row-between"><div>${starRow(r.rating)} <strong>${r.rating}/5</strong> <span class="t-meta">· ${r.reviewer} · ${fmt.ago(r.created_at)}</span></div>
            ${me ? html`<button class="icon-btn" data-action="report" data-type="review" data-id="${r.id}" aria-label="Report this review" title="Report review">${icon('flag')}</button>` : ''}</div><p class="mb-0" style="margin-top:6px">${r.comment}</p></div>`)
            : html`<p class="t-muted">No reviews yet. This is a new mentor.</p>`}
          <p class="t-meta">Reviews come from completed sessions. Student names are never shown.</p></section>
      </div>
      ${connectPanel(p, publicView)}
    </div>
  </article>`;
}

function studentProfile(p) {
  return html`<article aria-labelledby="pname">
    <a class="back-link" href="#/requests">${icon('arrow-left')}Back to requests</a>
    <header class="profile-head">${avatar(p.name, p.id, 'xl')}<div style="flex:1"><h1 id="pname" class="t-app-title">${p.name}</h1>
      <p class="role">${[p.grade_level, p.organization].filter(Boolean).join(' · ') || 'Student'}</p>
      <div class="row">${category(p.industry)}${p.relationship ? statusLabel('request_mentor', p.relationship) : ''}</div></div>
      ${MM.state.user.id !== p.id ? html`<button class="btn btn-tertiary btn-sm" data-action="report" data-type="user" data-id="${p.id}">${icon('flag')}Report profile</button>` : ''}</header>
    <div class="alert alert-info" style="margin-bottom:24px">${icon('lock')}<p>Student profiles are private. You can see this profile because ${p.name.split(' ')[0]} sent you a mentorship request.</p></div>
    <div style="max-width:720px">
      ${p.bio ? html`<section><h2 class="t-section">About</h2><p>${p.bio}</p></section>` : ''}
      ${p.career_goals ? html`<section><h2 class="t-section">Goals</h2><p>${p.career_goals}</p></section>` : ''}
      ${p.interests ? html`<section><h2 class="t-section">Academic interests</h2><ul class="tags">${tags(p.interests).map(x => html`<li class="tag">${x}</li>`)}</ul></section>` : ''}
      <p class="t-small" style="margin-top:16px">Preferred session format: <strong>${{ video: 'Video', chat: 'Chat', either: 'No preference' }[p.preferred_format || 'either']}</strong></p>
    </div></article>`;
}

MM.route('/users/:id', async ({ id }) => {
  const p = await api(`/users/${id}`);
  document.title = `${p.name} · MentorshipMatch`;
  $('#main').innerHTML = p.role === 'mentee' ? studentProfile(p) : mentorProfile(p);
}, { auth: true, title: 'Profile' });

document.addEventListener('click', e => {
  const r = e.target.closest('[data-action="request"]');
  if (r) requestDialog({ mentorId: Number(r.dataset.id), name: r.dataset.name, onDone: () => { MM.render(); } });
  const rep = e.target.closest('[data-action="report"]');
  if (rep) reportDialog(rep.dataset.type, Number(rep.dataset.id));
});

// ---------- My mentors (students): connected + saved ----------
MM.route('/my-mentors', async () => {
  const tab = MM.query().get('tab') === 'saved' ? 'saved' : 'connected';
  const [conns, saved] = await Promise.all([api('/connections'), api('/saved')]);
  $('#main').innerHTML = html`${pageHead('My mentors', 'Mentors who accepted your request, and mentors you saved to compare.')}
    ${linkTabs('My mentors', [['#/my-mentors', 'Connected', conns.length, tab === 'connected'], ['#/my-mentors?tab=saved', 'Saved', saved.length, tab === 'saved']])}
    ${tab === 'connected' ? (conns.length ? html`<div class="mentor-grid">${conns.map(c => html`<article class="mentor-card" aria-labelledby="cm-${c.id}">
        <div class="mc-head">${avatar(c.name, c.id)}<div><h3 id="cm-${c.id}"><a href="#/users/${c.id}">${c.name}</a></h3><p class="role">${c.headline}${c.organization ? ` · ${c.organization}` : ''}</p></div><span></span></div>
        <div class="row">${category(c.industry)}${statusLabel('request_mentee', 'accepted')}</div>
        <div class="facts"><span>${icon('check-circle')}${fmt.plural(c.completedSessions, 'completed session')}</span>
          ${c.nextSession ? html`<span>${icon('calendar')}Next: ${fmt.when(c.nextSession.starts_at)}</span>` : html`<span>${icon('calendar')}No upcoming session</span>`}</div>
        <div class="mc-foot"><a class="btn btn-tertiary btn-sm" href="#/users/${c.id}">View profile</a><a class="btn btn-primary btn-sm" href="#/book/${c.id}">${icon('calendar')}Book a session</a></div></article>`)}</div>`
      : emptyState({ ic: 'users', title: 'No mentors yet', body: 'When a mentor accepts your request, they appear here and you can book sessions with them.', action: html`<a class="btn btn-primary" href="#/mentors">Find a mentor</a>` }))
    : (saved.length ? html`<div class="mentor-grid">${saved.map(m => mentorCard(m))}</div>`
      : emptyState({ ic: 'bookmark', title: 'No saved mentors', body: 'Use the bookmark button on a mentor card to save it here and compare later.', action: html`<a class="btn btn-primary" href="#/mentors">Browse mentors</a>` }))}`;
}, { auth: true, roles: ['mentee'], title: 'My mentors' });

// ---------- My mentees (mentors) ----------
MM.route('/my-mentees', async () => {
  const conns = await api('/connections');
  $('#main').innerHTML = html`${pageHead('My mentees', 'Students you are currently mentoring.')}
    ${conns.length ? html`<div class="mentor-grid">${conns.map(c => html`<article class="mentor-card" aria-labelledby="mm-${c.id}">
      <div class="mc-head">${avatar(c.name, c.id)}<div><h3 id="mm-${c.id}"><a href="#/users/${c.id}">${c.name}</a></h3><p class="role">${c.grade_level || 'Student'}</p></div><span></span></div>
      <div class="row">${category(c.industry)}</div>
      ${c.career_goals ? html`<p class="summary"><strong>Goal:</strong> ${c.career_goals}</p>` : ''}
      ${c.interests ? html`<ul class="tags">${tags(c.interests).slice(0, 4).map(x => html`<li class="tag">${x}</li>`)}</ul>` : ''}
      <div class="facts"><span>${icon('check-circle')}${fmt.plural(c.completedSessions, 'completed session')}</span>
        ${c.nextSession ? html`<span>${icon('calendar')}Next: ${c.nextSession.topic} · ${fmt.when(c.nextSession.starts_at)}</span>` : html`<span>${icon('calendar')}No upcoming session</span>`}</div>
      <div class="mc-foot"><span></span><a class="btn btn-secondary btn-sm" href="#/users/${c.id}">View student profile</a></div></article>`)}</div>`
    : emptyState({ ic: 'users', title: 'No mentees yet', body: 'When you accept a student’s request, they appear here.', action: html`<a class="btn btn-primary" href="#/requests">Review requests</a>` })}`;
}, { auth: true, roles: ['mentor'], title: 'My mentees' });
