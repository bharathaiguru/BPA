/* MentorshipMatch front end — vanilla JS single-page app.
   All data comes from the Express REST API (/api/*). Every value rendered
   into HTML passes through the `html` template tag, which escapes it to
   prevent cross-site scripting (XSS). */
'use strict';

// ---------- Utilities ----------
const $ = (sel, root = document) => root.querySelector(sel);
const main = $('#main');
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = s => new Raw(s);
function html(strings, ...vals) {
  return raw(strings.reduce((out, str, i) => {
    const v = vals[i - 1];
    const piece = v instanceof Raw ? v.s : Array.isArray(v) ? v.map(x => (x instanceof Raw ? x.s : esc(x))).join('') : esc(v);
    return out + piece + str;
  }));
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Request failed'); e.status = res.status; throw e; }
  return data;
}

let toastTimer;
function toast(msg, type = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (type === 'error' ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 3500);
}

const COLORS = ['#173b5f', '#1f7a6d', '#8a4f9e', '#b5542e', '#2b5a86', '#6b7a1f', '#a33a5a'];
const initials = n => String(n || '?').split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).slice(-2).map(w => w[0]).join('').toUpperCase();
const avatar = (name, id, size = '') =>
  html`<span class="avatar ${size}" style="background:${COLORS[(id || 0) % COLORS.length]}" aria-hidden="true">${initials(name)}</span>`;
const stars = r => raw(`<span class="stars" aria-hidden="true">${'★'.repeat(Math.round(r || 0))}${'☆'.repeat(5 - Math.round(r || 0))}</span>`);
const ratingText = (avg, n) => n ? html`${stars(avg)} <span class="rating-line">${avg} (${n} review${n === 1 ? '' : 's'})</span><span class="sr-only">Rated ${avg} out of 5</span>` : html`<span class="rating-line">New mentor — no reviews yet</span>`;
const tags = csv => html`<ul class="tags" aria-label="Interests">${(csv || '').split(',').filter(Boolean).map(t => html`<li class="tag">${t}</li>`)}</ul>`;
const fmtDate = iso => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const pill = s => html`<span class="pill ${s}">${s}</span>`;

// ---------- State ----------
const state = { user: null };

// ---------- Navigation ----------
function renderNav() {
  const nav = $('#primaryNav');
  const route = location.hash || '#/';
  const link = (href, key) => html`<a href="${href}" ${route.startsWith(href) && href !== '#/' ? raw('aria-current="page"') : ''}>${t(key)}</a>`;
  const u = state.user;
  if (!u) {
    nav.innerHTML = html`${link('#/about', 'navAbout')}${link('#/login', 'navLogin')}<a class="btn-primary" href="#/register">${t('navJoin')}</a>`;
  } else {
    nav.innerHTML = html`
      ${link('#/dashboard', 'navDashboard')}
      ${u.role === 'mentee' ? link('#/mentors', 'navMentors') : ''}
      ${link('#/requests', 'navRequests')}
      ${link('#/sessions', 'navSessions')}
      ${link('#/profile', 'navProfile')}
      ${u.role === 'admin' ? link('#/admin', 'navAdmin') : ''}
      <button class="linklike" data-action="logout">${t('navLogout')}</button>`;
  }
}
$('#navToggle').addEventListener('click', e => {
  const nav = $('#primaryNav'); const open = nav.classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', open);
});

// ---------- Router ----------
const routes = [
  [/^#\/?$/, () => (state.user ? go('#/dashboard') : viewLanding())],
  [/^#\/login$/, () => viewAuth('login')],
  [/^#\/register(\?.*)?$/, () => viewAuth('register')],
  [/^#\/about$/, viewAbout],
  [/^#\/guidelines$/, viewGuidelines],
  [/^#\/dashboard$/, viewDashboard, true],
  [/^#\/mentors$/, viewMentors, true],
  [/^#\/users\/(\d+)$/, viewUser, true],
  [/^#\/requests$/, viewRequests, true],
  [/^#\/sessions$/, viewSessions, true],
  [/^#\/sessions\/(\d+)$/, viewChat, true],
  [/^#\/profile$/, viewProfile, true],
  [/^#\/admin$/, viewAdmin, true],
];
const go = hash => { if (location.hash === hash) router(); else location.hash = hash; };

async function router() {
  const hash = location.hash || '#/';
  $('#primaryNav').classList.remove('open');
  $('#navToggle').setAttribute('aria-expanded', 'false');
  renderNav();
  translateStatic();
  for (const [re, view, needsAuth] of routes) {
    const m = hash.match(re);
    if (!m) continue;
    if (needsAuth && !state.user) return go('#/login');
    main.innerHTML = '<div class="container page"><p class="muted">Loading…</p></div>';
    try { await view(...m.slice(1)); }
    catch (err) {
      if (err.status === 401) { state.user = null; return go('#/login'); }
      main.innerHTML = html`<div class="container page"><div class="form-error">${err.message}</div></div>`;
    }
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    return;
  }
  main.innerHTML = html`<div class="container page"><h1>Page not found</h1><p><a href="#/">Go home</a></p></div>`;
}
window.addEventListener('hashchange', router);

function setTitle(t) { document.title = `${t} · MentorshipMatch`; }

// ============================================================
// VIEWS
// ============================================================
async function viewLanding() {
  setTitle('Student-to-Professional Mentorship');
  const [mentors, stats] = await Promise.all([
    api('/public/mentors?limit=4').catch(() => []),
    api('/public/stats').catch(() => ({ mentors: 0, industries: 0, sessions: 0 })),
  ]);
  const scribble = raw('<svg viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true"><path d="M3 14 C 60 4, 120 4, 170 10 S 260 17, 297 6"/></svg>');
  main.innerHTML = html`
  <section class="hero">
    <div class="container hero-grid">
      <div>
        <span class="eyebrow">${t('heroEyebrow')}</span>
        <h1>${t('heroTitleA')} <span class="scribble">${t('heroTitleB')}${scribble}</span></h1>
        <p class="lead">${t('heroLead')}</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#/register">${t('ctaStudent')} →</a>
          <a class="btn btn-outline" href="#/register?role=mentor">${t('ctaMentor')}</a>
        </div>
        <ul class="hero-points"><li>${t('point1')}</li><li>${t('point2')}</li><li>${t('point3')}</li></ul>
      </div>
      <section class="ready-panel" aria-labelledby="readyTitle">
        <div class="ready-head"><h2 id="readyTitle">${t('readyTitle')}</h2><span class="live">${t('readyLive')}</span></div>
        ${mentors.map(m => html`
          <button class="mentor-tile" data-action="resume" data-id="${m.id}" aria-label="${m.name}, ${m.headline}. ${t('viewResume')}">
            ${avatar(m.name, m.id)}
            <span><span class="t-name">${m.name}</span><span class="t-role">${m.headline} · ${m.organization}</span>
              <span class="t-meta">${m.years_experience ? t('yrsExp', { n: m.years_experience }) + ' · ' : ''}${m.industry}</span></span>
            <span class="t-cta" aria-hidden="true">${t('viewResume')} →</span>
          </button>`)}
        <p class="ready-foot">${t('readyFoot')}</p>
      </section>
    </div>
  </section>

  <section class="section" aria-labelledby="how">
    <div class="container">
      <div class="section-head"><span class="eyebrow">${t('howEyebrow')}</span><h2 id="how">${t('howTitle')}</h2><p>${t('howLead')}</p></div>
      <ol class="timeline">
        ${[1, 2, 3, 4].map(n => html`<li><h3>${t('step' + n + 'T')}</h3><p>${t('step' + n + 'D')}</p></li>`)}
      </ol>
    </div>
  </section>

  <section class="section" style="padding-top:0" aria-labelledby="who">
    <div class="container">
      <div class="section-head"><span class="eyebrow">${t('forEyebrow')}</span><h2 id="who">${t('forTitle')}</h2></div>
      <div class="audience">
        <div class="card"><span class="tag-line">${t('studentsTag')}</span><h3 style="font-size:1.4rem;margin-top:.4rem">${t('studentsTitle')}</h3>
          <ul><li>${t('studentsL1')}</li><li>${t('studentsL2')}</li><li>${t('studentsL3')}</li></ul>
          <a class="btn btn-primary" href="#/register">${t('studentsCta')}</a></div>
        <div class="card"><span class="tag-line">${t('mentorsTag')}</span><h3 style="font-size:1.4rem;margin-top:.4rem">${t('mentorsTitle')}</h3>
          <ul><li>${t('mentorsL1')}</li><li>${t('mentorsL2')}</li><li>${t('mentorsL3')}</li></ul>
          <a class="btn btn-outline" href="#/register?role=mentor">${t('mentorsCta')}</a></div>
      </div>
    </div>
  </section>

  <section class="section mission" aria-labelledby="mission">
    <div class="container mission-grid">
      <div><h2 id="mission">${t('missionTitle')}</h2><p>${t('missionText')}</p></div>
      <div class="stat-row">
        <div><strong>${stats.mentors}</strong><span>${t('statMentors')}</span></div>
        <div><strong>${stats.industries}</strong><span>${t('statIndustries')}</span></div>
        <div><strong>${stats.sessions}</strong><span>${t('statSessions')}</span></div>
      </div>
    </div>
  </section>`;
}

// ---------- Résumé (used on the home page, profiles, and by Scribbler) ----------
const lines = txt => String(txt || '').split('\n').map(l => l.trim()).filter(Boolean);
function resumeSections(m) {
  const xp = lines(m.experience).map(l => l.split('|').map(x => x.trim()));
  return html`
    ${m.bio ? html`<div class="resume-section"><h3>${t('resumeAbout')}</h3><p style="margin:0">${m.bio}</p></div>` : ''}
    ${xp.length ? html`<div class="resume-section"><h3>${t('resumeExperience')}</h3><ul class="xp">${xp.map(([title, org, yrs]) =>
      html`<li><strong>${title}</strong><span>${org || ''}${yrs ? ' · ' + yrs : ''}</span></li>`)}</ul></div>` : ''}
    ${m.education ? html`<div class="resume-section"><h3>${t('resumeEducation')}</h3><ul class="plain-list">${lines(m.education).map(l => html`<li>${l}</li>`)}</ul></div>` : ''}
    ${m.skills ? html`<div class="resume-section"><h3>${t('resumeSkills')}</h3>${tags(m.skills)}</div>` : ''}
    ${m.achievements ? html`<div class="resume-section"><h3>${t('resumeAchievements')}</h3><ul class="plain-list">${lines(m.achievements).map(l => html`<li>${l}</li>`)}</ul></div>` : ''}
    ${m.availability ? html`<div class="resume-section"><h3>${t('resumeAvailability')}</h3><p style="margin:0">${m.availability}</p></div>` : ''}`;
}
async function openResume(id) {
  const m = await api(`/public/mentors/${id}`);
  const u = state.user;
  let cta;
  if (!u) cta = html`<a class="btn btn-primary" href="#/register" data-close>${t('resumeSignup')}</a>`;
  else if (u.role === 'mentee') cta = html`<a class="btn btn-primary" href="#/users/${m.id}" data-close>${t('resumeConnect')}</a>`;
  else cta = html`<a class="btn btn-outline" href="#/users/${m.id}" data-close>${t('resumeProfile')}</a>`;
  const dlg = $('#modal');
  dlg.classList.add('wide');
  $('#modalBody').innerHTML = html`
    <div class="resume-head">${avatar(m.name, m.id, 'lg')}
      <div><h2 id="modalTitle">${m.name}</h2><p>${m.headline} · ${m.organization}</p>
      <p style="font-size:.88rem">${m.years_experience ? t('yrsExp', { n: m.years_experience }) + ' · ' : ''}${m.industry}</p>
      <div style="margin-top:.3rem">${ratingText(m.rating, m.reviewCount)}</div></div></div>
    ${resumeSections(m)}
    <div class="resume-actions">${cta}</div>`;
  dlg.showModal();
  dlg.addEventListener('close', () => dlg.classList.remove('wide'), { once: true });
}
window.MM = { openResume, go, api, state, rerender: () => router() };

function viewAuth(mode) {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  if (location.hash.startsWith('#/register?')) mode = 'register';
  setTitle(mode === 'login' ? 'Log in' : 'Create account');
  const isMentor = params.get('role') === 'mentor';
  main.innerHTML = html`
  <div class="container page"><div class="auth-wrap card">
    <div class="auth-tabs" role="tablist" aria-label="Account">
      <button role="tab" aria-selected="${mode === 'login'}" data-action="nav" data-href="#/login">Log in</button>
      <button role="tab" aria-selected="${mode === 'register'}" data-action="nav" data-href="#/register">Create account</button>
    </div>
    ${mode === 'login' ? html`
      <h1 style="font-size:1.8rem">Welcome back</h1>
      <form id="authForm" class="form-grid" novalidate>
        <div class="form-error" id="formError" role="alert"></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn btn-primary" type="submit">Log in</button>
      </form>
      <div class="demo-box"><strong>Demo accounts</strong> (password <code>Password123!</code>)<br>
        Student: <code>sam@example.com</code> · Mentor: <code>marcus@example.com</code> · Admin: <code>admin@mentorshipmatch.org</code></div>`
    : html`
      <h1 style="font-size:1.8rem">Join MentorshipMatch</h1>
      <form id="authForm" class="form-grid" novalidate>
        <div class="form-error" id="formError" role="alert"></div>
        <fieldset class="role-picker">
          <legend class="label">I am a…</legend>
          <label class="role-option"><input type="radio" name="role" value="mentee" ${raw(isMentor ? '' : 'checked')}><span><strong>Student</strong><small>High school or college</small></span></label>
          <label class="role-option"><input type="radio" name="role" value="mentor" ${raw(isMentor ? 'checked' : '')}><span><strong>Professional</strong><small>Volunteer as a mentor</small></span></label>
        </fieldset>
        <div class="field"><label for="name">Full name</label><input id="name" name="name" autocomplete="name" required maxlength="80"></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="password">Password <span class="hint">8+ characters with a letter and a number</span></label>
          <input id="password" name="password" type="password" autocomplete="new-password" required minlength="8"></div>
        <div class="field"><label for="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" autocomplete="new-password" required></div>
        <label style="font-weight:400;display:flex;gap:.5rem;align-items:flex-start"><input type="checkbox" name="agree" style="width:auto;margin-top:.35rem" required> I agree to follow the <a href="#/guidelines" target="_blank">Community Guidelines</a>.</label>
        <button class="btn btn-primary" type="submit">Create account</button>
      </form>`}
  </div></div>`;

  $('#authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const err = $('#formError');
    if (mode === 'register') {
      if (f.password !== f.confirm) return (err.textContent = 'Passwords do not match.');
      if (!f.agree) return (err.textContent = 'Please agree to the Community Guidelines.');
    }
    try {
      state.user = await api(`/auth/${mode}`, { method: 'POST', body: f });
      toast(mode === 'login' ? `Welcome back, ${state.user.name.split(' ')[0]}!` : 'Account created! Let\'s finish your profile.');
      go(mode === 'register' ? '#/profile' : '#/dashboard');
    } catch (ex) { err.textContent = ex.message; }
  });
}

async function viewDashboard() {
  const u = state.user;
  setTitle('Dashboard');
  if (u.role === 'admin') return go('#/admin');
  const [sessions, requests, profile] = await Promise.all([api('/sessions'), api('/requests'), api('/profile')]);
  const upcoming = sessions.filter(s => ['requested', 'confirmed'].includes(s.status));
  const pending = requests.filter(r => r.status === 'pending');
  const toReview = sessions.filter(s => s.status === 'completed' && !s.reviewed);
  const incomplete = !profile.bio || !profile.interests;
  const other = s => (u.role === 'mentor' ? s.mentee_name : s.mentor_name);

  main.innerHTML = html`
  <div class="container page">
    <div class="page-head"><div><h1>Hi, ${u.name.split(' ')[0]}</h1>
      <p>${u.role === 'mentor' ? 'Thanks for volunteering your time. Here\'s what needs your attention.' : 'Here\'s where your mentorship journey stands.'}</p></div>
      ${u.role === 'mentee' ? html`<a class="btn btn-gold" href="#/mentors">Find a mentor</a>` : ''}</div>
    ${incomplete ? html`<div class="card" style="border-left:5px solid var(--gold);margin-bottom:1.25rem"><strong>Finish your profile.</strong> ${u.role === 'mentor' ? 'Students search by industry and interests' : 'Mentors want to know your interests and goals'} — <a href="#/profile">complete it now</a>.</div>` : ''}
    <div class="grid grid-stats" style="margin-bottom:1.5rem">
      <div class="stat"><span class="n">${upcoming.length}</span><span class="l">Upcoming sessions</span></div>
      <div class="stat"><span class="n">${pending.length}</span><span class="l">${u.role === 'mentor' ? 'Requests to answer' : 'Requests pending'}</span></div>
      <div class="stat"><span class="n">${sessions.filter(s => s.status === 'completed').length}</span><span class="l">Sessions completed</span></div>
      <div class="stat"><span class="n">${toReview.length}</span><span class="l">Reviews to write</span></div>
    </div>
    <div class="split">
      <section class="card" aria-labelledby="up"><h2 id="up" style="font-size:1.35rem">Upcoming sessions</h2>
        ${upcoming.length ? html`<ul class="list">${upcoming.slice(0, 5).map(s => sessionItem(s, other(s)))}</ul>`
          : html`<div class="empty">No sessions scheduled. ${u.role === 'mentee' ? raw('<a href="#/sessions">Book one</a> with a connected mentor.') : 'Students will book time with you once you accept their requests.'}</div>`}
      </section>
      <aside class="stack">
        <section class="card" aria-labelledby="pr"><h2 id="pr" style="font-size:1.2rem">${u.role === 'mentor' ? 'New requests' : 'Your requests'}</h2>
          ${pending.length ? html`<ul class="list">${pending.slice(0, 4).map(r => html`<li class="list-item"><div><strong>${u.role === 'mentor' ? r.mentee_name : r.mentor_name}</strong><div class="meta">${pill(r.status)}</div></div></li>`)}</ul><a href="#/requests">View all →</a>`
            : html`<p class="muted">Nothing pending.</p>`}
        </section>
        ${toReview.length ? html`<section class="card"><h2 style="font-size:1.2rem">How did it go?</h2>${toReview.map(s => html`<p>Session with <strong>${other(s)}</strong> — <button class="btn btn-sm btn-outline" data-action="review" data-id="${s.id}" data-name="${other(s)}">Leave a review</button></p>`)}</section>` : ''}
      </aside>
    </div>
  </div>`;
}

function sessionItem(s, otherName) {
  const d = new Date(s.starts_at);
  const mine = state.user;
  const actions = [];
  if (s.status === 'requested' && mine.id === s.mentor_id) actions.push(html`<button class="btn btn-sm btn-success" data-action="session" data-id="${s.id}" data-status="confirmed">Confirm</button>`);
  if (s.status === 'confirmed' && s.type === 'video' && s.meeting_url) actions.push(html`<a class="btn btn-sm btn-primary" href="${s.meeting_url}" target="_blank" rel="noopener">Join video</a>`);
  if (s.status === 'confirmed' && s.type === 'chat') actions.push(html`<a class="btn btn-sm btn-primary" href="#/sessions/${s.id}">Open chat</a>`);
  if (s.status === 'confirmed') actions.push(html`<button class="btn btn-sm btn-outline" data-action="session" data-id="${s.id}" data-status="completed">Mark complete</button>`);
  if (s.status === 'completed' && !s.reviewed) actions.push(html`<button class="btn btn-sm btn-gold" data-action="review" data-id="${s.id}" data-name="${otherName}">Leave review</button>`);
  if (['requested', 'confirmed'].includes(s.status)) actions.push(html`<button class="btn btn-sm btn-ghost" data-action="session" data-id="${s.id}" data-status="cancelled">Cancel</button>`);
  return html`<li class="list-item">
    <div class="who">
      <div class="date-block" aria-hidden="true"><div class="m">${d.toLocaleString(undefined, { month: 'short' })}</div><div class="d">${d.getDate()}</div></div>
      <div><strong>${s.topic}</strong>
        <div class="meta">with ${otherName} · ${fmtDate(s.starts_at)} · ${s.duration} min · ${s.type === 'video' ? '🎥 Video' : '💬 Chat'} · ${pill(s.status)}</div></div>
    </div>
    <div class="actions">${actions}</div></li>`;
}

async function viewMentors() {
  setTitle('Find Mentors');
  if (state.user.role !== 'mentee') return go('#/dashboard');
  const industries = await api('/industries');
  main.innerHTML = html`
  <div class="container page">
    <div class="page-head"><div><h1>Find a mentor</h1><p>Browse professionals by name, interest, or industry.</p></div></div>
    <form class="filters" id="filterForm" role="search">
      <div class="field"><label for="q" class="sr-only">Search mentors</label><input id="q" name="q" type="search" placeholder="Search by name, job title, or interest (e.g. “medicine”)"></div>
      <div class="field"><label for="industry" class="sr-only">Industry</label>
        <select id="industry" name="industry"><option value="">All industries</option>${industries.map(i => html`<option>${i}</option>`)}</select></div>
    </form>
    <p class="muted" id="resultCount" aria-live="polite"></p>
    <div class="grid grid-3" id="mentorGrid"></div>
  </div>`;
  const load = async () => {
    const f = Object.fromEntries(new FormData($('#filterForm')));
    const mentors = await api(`/mentors?q=${encodeURIComponent(f.q)}&industry=${encodeURIComponent(f.industry)}`);
    $('#resultCount').textContent = `${mentors.length} mentor${mentors.length === 1 ? '' : 's'} found`;
    $('#mentorGrid').innerHTML = mentors.length ? html`${mentors.map(m => html`
      <article class="card mentor-card">
        <header>${avatar(m.name, m.id)}<div><h3>${m.name}</h3><p class="org">${m.headline}${m.organization ? ' · ' + m.organization : ''}</p></div></header>
        ${m.industry ? html`<div><span class="pill confirmed">${m.industry}</span></div>` : ''}
        <p class="bio">${m.bio || 'This mentor hasn\'t written a bio yet.'}</p>
        ${tags(m.interests)}
        <footer><div>${ratingText(m.rating, m.reviewCount)}</div><a class="btn btn-sm btn-primary" href="#/users/${m.id}" aria-label="View ${m.name}'s profile">View profile</a></footer>
      </article>`)}` : html`<div class="empty" style="grid-column:1/-1">No mentors match that search. Try a broader term.</div>`;
  };
  let t; $('#filterForm').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 200); });
  $('#filterForm').addEventListener('submit', e => { e.preventDefault(); load(); });
  await load();
}

async function viewUser(id) {
  const p = await api(`/users/${id}`);
  setTitle(p.name);
  const me = state.user;
  let cta = '';
  if (me.role === 'mentee' && p.role === 'mentor') {
    cta = p.myRequest
      ? (p.myRequest.status === 'accepted' ? html`<a class="btn btn-gold" href="#/sessions">Book a session</a>` : html`<span>Request status: ${pill(p.myRequest.status)}</span>`)
      : html`<button class="btn btn-gold" data-action="request" data-id="${p.id}" data-name="${p.name}">Request mentorship</button>`;
  }
  const isMentor = p.role === 'mentor';
  main.innerHTML = html`
  <div class="container page">
    <p><a href="${me.role === 'mentee' ? '#/mentors' : '#/requests'}">← Back</a></p>
    <div class="card profile-hero" style="margin-bottom:1.5rem">
      ${avatar(p.name, p.id, 'lg')}
      <div style="flex:1;min-width:220px"><h1>${p.name}</h1><p class="muted" style="margin:.2rem 0">${p.headline}${p.organization ? ' · ' + p.organization : ''}</p>
        ${isMentor ? ratingText(p.rating, p.reviewCount) : ''}</div>
      <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">${cta}
        ${me.id !== p.id ? html`<button class="btn btn-ghost btn-sm" data-action="flag" data-type="user" data-id="${p.id}">⚑ Report</button>` : ''}</div>
    </div>
    <div class="split">
      <section class="card stack">
        <h2 style="font-size:1.35rem">About</h2>
        <p>${p.bio || 'No bio yet.'}</p>
        ${p.career_goals ? html`<h3>Career goals</h3><p>${p.career_goals}</p>` : ''}
        ${isMentor && (p.experience || p.education || p.skills || p.achievements) ? html`<h2 style="font-size:1.35rem;margin-top:1.5rem">Résumé</h2>${resumeSections({ ...p, bio: '', availability: '' })}` : ''}
        ${isMentor ? html`<h2 style="font-size:1.35rem;margin-top:1.5rem">Reviews</h2>
          ${p.reviews.length ? p.reviews.map(r => html`<article class="review"><header><div><strong>${r.reviewer}</strong> ${stars(r.rating)}<span class="sr-only">${r.rating} out of 5</span></div>
            <button class="btn btn-ghost btn-sm" data-action="flag" data-type="review" data-id="${r.id}" aria-label="Report this review">⚑</button></header><p>${r.comment}</p></article>`)
            : html`<p class="muted">No reviews yet.</p>`}` : ''}
      </section>
      <aside class="card">
        <h2 style="font-size:1.2rem">Details</h2>
        <dl class="detail-list">
          <dt>Role</dt><dd>${isMentor ? 'Mentor' : 'Student'}</dd>
          ${p.industry ? html`<dt>Industry</dt><dd>${p.industry}</dd>` : ''}
          ${p.grade_level ? html`<dt>Grade</dt><dd>${p.grade_level}</dd>` : ''}
          ${p.availability ? html`<dt>Availability</dt><dd>${p.availability}</dd>` : ''}
          <dt>Member since</dt><dd>${new Date(p.created_at + 'Z').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</dd>
        </dl>
        ${p.interests ? html`<h3 style="margin-top:1rem">Interests</h3>${tags(p.interests)}` : ''}
      </aside>
    </div>
  </div>`;
}

async function viewRequests() {
  setTitle('Requests');
  const u = state.user;
  const reqs = await api('/requests');
  main.innerHTML = html`
  <div class="container page">
    <div class="page-head"><div><h1>Mentorship requests</h1>
      <p>${u.role === 'mentor' ? 'Students who\'d like you to mentor them. Accept to let them book sessions.' : 'Requests you\'ve sent to mentors.'}</p></div></div>
    <div class="card">${reqs.length ? html`<ul class="list">${reqs.map(r => {
      const otherName = u.role === 'mentor' ? r.mentee_name : r.mentor_name;
      const otherId = u.role === 'mentor' ? r.mentee_id : r.mentor_id;
      return html`<li class="list-item">
        <div class="who">${avatar(otherName, otherId)}<div><a href="#/users/${otherId}"><strong>${otherName}</strong></a> ${pill(r.status)}
          <p class="quote">“${r.message}”</p></div></div>
        <div class="actions">${u.role === 'mentor' && r.status === 'pending' ? html`
          <button class="btn btn-sm btn-success" data-action="respond" data-id="${r.id}" data-status="accepted">Accept</button>
          <button class="btn btn-sm btn-outline" data-action="respond" data-id="${r.id}" data-status="declined">Decline</button>` : ''}
          ${u.role === 'mentee' && r.status === 'accepted' ? html`<a class="btn btn-sm btn-gold" href="#/sessions">Book session</a>` : ''}</div>
      </li>`;
    })}</ul>` : html`<div class="empty">${u.role === 'mentee' ? raw('No requests yet. <a href="#/mentors">Find a mentor</a> to get started.') : 'No requests yet. Make sure your profile is complete so students can find you.'}</div>`}</div>
  </div>`;
}

async function viewSessions() {
  setTitle('Sessions');
  const u = state.user;
  const [sessions, connections] = await Promise.all([api('/sessions'), api('/connections')]);
  const other = s => (u.role === 'mentor' ? s.mentee_name : s.mentor_name);
  const upcoming = sessions.filter(s => ['requested', 'confirmed'].includes(s.status));
  const past = sessions.filter(s => ['completed', 'cancelled'].includes(s.status)).reverse();
  const minDate = new Date(Date.now() + 3600e3 - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16);

  main.innerHTML = html`
  <div class="container page">
    <div class="page-head"><div><h1>Sessions</h1><p>Schedule video calls or chat sessions and keep track of past meetings.</p></div></div>
    <div class="split">
      <div class="stack">
        <section class="card"><h2 style="font-size:1.35rem">Upcoming</h2>
          ${upcoming.length ? html`<ul class="list">${upcoming.map(s => sessionItem(s, other(s)))}</ul>` : html`<div class="empty">No upcoming sessions.</div>`}</section>
        <section class="card"><h2 style="font-size:1.35rem">Past</h2>
          ${past.length ? html`<ul class="list">${past.map(s => sessionItem(s, other(s)))}</ul>` : html`<p class="muted">No past sessions yet.</p>`}</section>
      </div>
      ${u.role === 'mentee' ? html`
      <aside class="card">
        <h2 style="font-size:1.2rem">Book a session</h2>
        ${connections.length ? html`
        <form id="bookForm" class="form-grid" novalidate>
          <div class="form-error" id="formError" role="alert"></div>
          <div class="field"><label for="mentorId">Mentor</label><select id="mentorId" name="mentorId" required>${connections.map(c => html`<option value="${c.id}">${c.name}</option>`)}</select></div>
          <div class="field"><label for="startsAt">Date &amp; time</label><input id="startsAt" name="startsAt" type="datetime-local" min="${minDate}" required></div>
          <div class="field"><label for="duration">Length</label><select id="duration" name="duration"><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></div>
          <fieldset class="role-picker"><legend class="label">Session type</legend>
            <label class="role-option"><input type="radio" name="type" value="video" checked><span><strong>🎥 Video</strong><small>Link sent on confirm</small></span></label>
            <label class="role-option"><input type="radio" name="type" value="chat"><span><strong>💬 Chat</strong><small>In-app messaging</small></span></label>
          </fieldset>
          <div class="field"><label for="topic">What do you want to talk about?</label><input id="topic" name="topic" maxlength="150" required placeholder="e.g. Choosing between colleges"></div>
          <button class="btn btn-primary" type="submit">Request session</button>
        </form>` : html`<p class="muted">Once a mentor accepts your request, you can book sessions with them here.</p><a class="btn btn-outline btn-sm" href="#/mentors">Find a mentor</a>`}
      </aside>` : html`<aside class="card"><h2 style="font-size:1.2rem">How sessions work</h2><p class="muted">Students request a time. Confirm it and a private video link (or chat room) is created automatically. After you meet, mark it complete so you can both leave a review.</p></aside>`}
    </div>
  </div>`;

  $('#bookForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/sessions', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      toast('Session requested! Your mentor will confirm it.');
      router();
    } catch (ex) { $('#formError').textContent = ex.message; }
  });
}

async function viewChat(id) {
  const sessions = await api('/sessions');
  const s = sessions.find(x => x.id === Number(id));
  if (!s) throw new Error('Session not found.');
  const otherName = state.user.id === s.mentor_id ? s.mentee_name : s.mentor_name;
  setTitle(`Chat with ${otherName}`);
  main.innerHTML = html`
  <div class="container page">
    <p><a href="#/sessions">← All sessions</a></p>
    <div class="card">
      <div class="page-head" style="margin-bottom:1rem"><div><h1 style="font-size:1.6rem">${s.topic}</h1><p>Chat with ${otherName} · ${fmtDate(s.starts_at)} · ${pill(s.status)}</p></div></div>
      <div class="chat">
        <div class="chat-log" id="chatLog" role="log" aria-live="polite" aria-label="Messages"></div>
        ${s.status === 'confirmed' ? html`<form id="chatForm"><label for="msg" class="sr-only">Message</label><input id="msg" name="body" maxlength="1000" autocomplete="off" placeholder="Type a message…" required><button class="btn btn-primary">Send</button></form>`
          : html`<p class="muted" style="margin-top:.75rem">Chat is read-only because this session is ${s.status}.</p>`}
      </div>
    </div>
  </div>`;
  const log = $('#chatLog');
  const load = async () => {
    if (!document.body.contains(log)) return clearInterval(poll);
    const msgs = await api(`/sessions/${id}/messages`);
    log.innerHTML = msgs.length ? html`${msgs.map(m => html`<div class="bubble ${m.sender_id === state.user.id ? 'mine' : ''}"><span class="by">${m.sender}</span>${m.body}
      ${m.sender_id !== state.user.id ? html` <button class="btn-ghost" style="border:0;background:none;cursor:pointer;font-size:.75rem" data-action="flag" data-type="message" data-id="${m.id}" aria-label="Report message">⚑</button>` : ''}</div>`)}`
      : html`<p class="muted" style="margin:auto">No messages yet — say hello!</p>`;
    log.scrollTop = log.scrollHeight;
  };
  const poll = setInterval(load, 4000);
  await load();
  $('#chatForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const input = $('#msg');
    try { await api(`/sessions/${id}/messages`, { method: 'POST', body: { body: input.value } }); input.value = ''; load(); }
    catch (ex) { toast(ex.message, 'error'); }
  });
}

async function viewProfile() {
  setTitle('My Profile');
  const u = state.user;
  const p = await api('/profile');
  const mentor = u.role === 'mentor';
  const industries = ['Technology', 'Healthcare', 'Business & Marketing', 'Engineering', 'Law & Government', 'Education', 'Arts & Media', 'Finance', 'Science & Research', 'Skilled Trades'];
  main.innerHTML = html`
  <div class="container page">
    <div class="page-head"><div><h1>My profile</h1><p>${mentor ? 'Students use this to decide who to reach out to.' : 'Mentors read this before accepting your request. Only mentors you contact can see it.'}</p></div>
      <a class="btn btn-outline btn-sm" href="#/users/${u.id}">Preview public profile</a></div>
    <form id="profileForm" class="card form-grid two" novalidate>
      <div class="form-error field full" id="formError" role="alert"></div>
      <div class="field"><label for="name">Full name</label><input id="name" name="name" value="${u.name}" required maxlength="80"></div>
      <div class="field"><label for="headline">${mentor ? 'Job title' : 'Headline'}</label><input id="headline" name="headline" value="${p.headline}" maxlength="100" placeholder="${mentor ? 'e.g. Software Engineer' : 'e.g. High school junior interested in medicine'}"></div>
      <div class="field"><label for="organization">${mentor ? 'Company / organization' : 'School'}</label><input id="organization" name="organization" value="${p.organization}" maxlength="100"></div>
      ${mentor ? html`<div class="field"><label for="availability">Availability</label><input id="availability" name="availability" value="${p.availability}" maxlength="100" placeholder="e.g. Weekday evenings"></div>`
        : html`<div class="field"><label for="grade_level">Grade level</label><select id="grade_level" name="grade_level">${['', '9th grade', '10th grade', '11th grade', '12th grade', 'College freshman', 'College sophomore', 'College junior', 'College senior'].map(g => html`<option value="${g}" ${raw(g === p.grade_level ? 'selected' : '')}>${g || 'Select…'}</option>`)}</select></div>`}
      <div class="field"><label for="industry">${mentor ? 'Industry' : 'Field of interest'}</label><select id="industry" name="industry"><option value="">Select…</option>${industries.map(i => html`<option ${raw(i === p.industry ? 'selected' : '')}>${i}</option>`)}</select></div>
      <div class="field"><label for="interests">${mentor ? 'Topics you can help with' : 'Academic interests'} <span class="hint">comma-separated</span></label><input id="interests" name="interests" value="${(p.interests || '').split(',').join(', ')}" maxlength="300" placeholder="e.g. biology, research, pre-med"></div>
      <div class="field full"><label for="bio">Bio</label><textarea id="bio" name="bio" maxlength="1000">${p.bio}</textarea></div>
      ${mentor ? html`
        <h2 class="form-section" style="font-size:1.2rem">Résumé <span class="hint">shown to students on your profile and the home page</span></h2>
        <div class="field"><label for="years_experience">Years of experience</label><input id="years_experience" name="years_experience" type="number" min="0" max="60" value="${p.years_experience || 0}"></div>
        <div class="field"><label for="skills">Skills <span class="hint">comma-separated</span></label><input id="skills" name="skills" maxlength="300" value="${(p.skills || '').split(',').join(', ')}" placeholder="e.g. JavaScript, public speaking"></div>
        <div class="field full"><label for="experience">Work experience <span class="hint">one job per line: Title | Organization | Years</span></label>
          <textarea id="experience" name="experience" maxlength="1500" placeholder="Software Engineer | Northwind Tech | 2020–present">${p.experience || ''}</textarea></div>
        <div class="field full"><label for="education">Education <span class="hint">one per line</span></label>
          <textarea id="education" name="education" maxlength="600" style="min-height:80px" placeholder="B.S. Computer Science — University of Texas at Dallas">${p.education || ''}</textarea></div>
        <div class="field full"><label for="achievements">Achievements &amp; certifications <span class="hint">one per line</span></label>
          <textarea id="achievements" name="achievements" maxlength="800" style="min-height:80px">${p.achievements || ''}</textarea></div>` : ''}
      ${mentor ? '' : html`<div class="field full"><label for="career_goals">Career goals</label><textarea id="career_goals" name="career_goals" maxlength="600" placeholder="Where do you want to be in 5 years?">${p.career_goals}</textarea>${raw('<input type="hidden" name="availability" value="' + esc(p.availability) + '">')}</div>`}
      <div class="field full"><button class="btn btn-primary" type="submit" style="align-self:flex-start">Save profile</button></div>
    </form>
  </div>`;
  $('#profileForm').addEventListener('submit', async e => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      await api('/profile', { method: 'PUT', body });
      state.user.name = body.name;
      toast('Profile saved.');
      $('#formError').textContent = '';
    } catch (ex) { $('#formError').textContent = ex.message; }
  });
}

async function viewAdmin(tab) {
  if (state.user.role !== 'admin') return go('#/dashboard');
  setTitle('Admin');
  tab = tab || sessionStorage.getItem('adminTab') || 'flags';
  const [stats, users, flags, auditLog] = await Promise.all([api('/admin/stats'), api('/admin/users'), api('/admin/flags'), api('/admin/audit')]);
  const tabBtn = (id, label) => html`<button role="tab" aria-selected="${tab === id}" data-action="adminTab" data-tab="${id}">${label}</button>`;
  let body;
  if (tab === 'users') {
    body = html`<div class="table-wrap"><table><caption class="sr-only">All users</caption>
      <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Open flags</th><th scope="col">Actions</th></tr></thead>
      <tbody>${users.map(x => html`<tr>
        <td><a href="#/users/${x.id}">${x.name}</a></td><td>${x.email}</td><td>${x.role}</td><td>${pill(x.status)}</td>
        <td>${x.open_flags ? html`<span class="pill open">${x.open_flags}</span>` : '—'}</td>
        <td>${x.role === 'admin' ? '' : html`
          ${x.status === 'active' ? html`<button class="btn btn-sm btn-outline" data-action="userStatus" data-id="${x.id}" data-status="suspended">Suspend</button>`
            : html`<button class="btn btn-sm btn-success" data-action="userStatus" data-id="${x.id}" data-status="active">Reactivate</button>`}
          <button class="btn btn-sm btn-ghost" data-action="deleteUser" data-id="${x.id}" data-name="${x.name}">Delete</button>`}</td></tr>`)}</tbody></table></div>`;
  } else if (tab === 'audit') {
    body = auditLog.length ? html`<ul class="list">${auditLog.map(a => html`<li class="list-item"><span>${a.action}</span><span class="meta">${a.admin} · ${new Date(a.created_at + 'Z').toLocaleString()}</span></li>`)}</ul>` : html`<div class="empty">No admin actions recorded yet.</div>`;
  } else {
    body = flags.length ? html`<ul class="list">${flags.map(f => html`<li class="list-item">
      <div><strong>${f.reason}</strong> ${pill(f.status)} <span class="meta">· ${f.target_type} #${f.target_id} · reported by ${f.reporter} · ${new Date(f.created_at + 'Z').toLocaleDateString()}</span>
        <p class="quote">Flagged content: “${f.preview}”</p>${f.details ? html`<p class="meta" style="margin:0">Reporter note: ${f.details}</p>` : ''}</div>
      ${f.status === 'open' ? html`<div class="actions">
        ${f.target_type === 'user' ? html`<button class="btn btn-sm btn-danger" data-action="flagAct" data-id="${f.id}" data-act="suspend_user">Suspend user</button>`
          : html`<button class="btn btn-sm btn-danger" data-action="flagAct" data-id="${f.id}" data-act="hide_content">Remove content</button>`}
        <button class="btn btn-sm btn-success" data-action="flagAct" data-id="${f.id}" data-act="resolve">Mark resolved</button>
        <button class="btn btn-sm btn-outline" data-action="flagAct" data-id="${f.id}" data-act="dismiss">Dismiss</button></div>` : ''}
    </li>`)}</ul>` : html`<div class="empty">No reports. The community is behaving! 🎉</div>`;
  }
  main.innerHTML = html`
  <div class="container page">
    <div class="page-head"><div><h1>Admin panel</h1><p>Manage users and review flagged activity.</p></div></div>
    <div class="grid grid-stats" style="margin-bottom:1.5rem">
      <div class="stat"><span class="n">${stats.mentees}</span><span class="l">Students</span></div>
      <div class="stat"><span class="n">${stats.mentors}</span><span class="l">Mentors</span></div>
      <div class="stat"><span class="n">${stats.sessions}</span><span class="l">Sessions booked</span></div>
      <div class="stat"><span class="n">${stats.completed}</span><span class="l">Completed</span></div>
      <div class="stat ${stats.openFlags ? 'alert' : ''}"><span class="n">${stats.openFlags}</span><span class="l">Open reports</span></div>
      <div class="stat"><span class="n">${stats.suspended}</span><span class="l">Suspended</span></div>
    </div>
    <div class="admin-tabs" role="tablist">${tabBtn('flags', `Flagged activity (${stats.openFlags})`)}${tabBtn('users', `Users (${users.length})`)}${tabBtn('audit', 'Audit log')}</div>
    <div class="card">${body}</div>
  </div>`;
}

function viewAbout() {
  setTitle('About');
  main.innerHTML = html`<div class="container page prose">
    <h1>About MentorshipMatch</h1>
    <p>MentorshipMatch is a nonprofit platform that connects high school and college students with professionals in their fields of interest. Students build a profile around their academic interests and career goals, browse mentors, request a mentorship, and book video or chat sessions. After each meeting, both sides leave a review.</p>
    <h2>Built with</h2>
    <ul><li>Node.js and Express (server and REST API)</li><li>SQLite (relational database)</li><li>Vanilla HTML, CSS, and JavaScript (front end)</li><li>bcrypt password hashing, Helmet security headers, rate limiting</li></ul>
    <h2>Credits &amp; sources</h2>
    <ul><li>Fonts: Public Sans, Atkinson Hyperlegible (Braille Institute), and OpenDyslexic, self-hosted via Fontsource (SIL Open Font License)</li><li>Scribbler robot illustration and all icons: original artwork made for this project</li><li>Video meetings: Jitsi Meet (free, open source)</li><li>All icons and illustrations are original or Unicode characters. All mentor profiles are fictional demo data.</li></ul>
  </div>`;
}

function viewGuidelines() {
  setTitle('Community Guidelines');
  main.innerHTML = html`<div class="container page prose">
    <h1>Community Guidelines</h1>
    <p>MentorshipMatch serves students, many of whom are minors. Every member agrees to:</p>
    <ul>
      <li><strong>Keep it professional.</strong> Conversations focus on academics, careers, and personal growth.</li>
      <li><strong>Stay on the platform.</strong> Do not ask students for personal phone numbers, home addresses, or social media accounts.</li>
      <li><strong>Be respectful.</strong> No harassment, discrimination, or inappropriate content.</li>
      <li><strong>Be honest.</strong> Represent your experience and credentials accurately, and write truthful reviews.</li>
      <li><strong>Report concerns.</strong> Use the ⚑ Report button on any profile, review, or message. Admins review every report.</li>
    </ul>
    <p>Violations may result in content removal or account suspension.</p>
  </div>`;
}

// ============================================================
// MODALS (request, review, report)
// ============================================================
function openModal(content, onSubmit) {
  const dlg = $('#modal');
  $('#modalBody').innerHTML = content;
  dlg.showModal();
  const form = $('#modalBody form');
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    try { await onSubmit(Object.fromEntries(new FormData(form))); dlg.close(); }
    catch (ex) { $('#modalError').textContent = ex.message; }
  });
  $('#modalBody input, #modalBody textarea, #modalBody select')?.focus();
}

// ============================================================
// EVENT DELEGATION — every button with data-action routes here
// ============================================================
document.addEventListener('click', async e => {
  if (e.target.closest('#modal [data-close]')) $('#modal').close();
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  try {
    switch (action) {
      case 'nav': go(el.dataset.href); break;
      case 'resume': await openResume(id); break;
      case 'logout':
        await api('/auth/logout', { method: 'POST' });
        state.user = null; toast('You\'ve been logged out.'); go('#/');
        break;
      case 'request':
        openModal(html`<h2 id="modalTitle">Request ${el.dataset.name} as a mentor</h2>
          <form class="form-grid"><div class="form-error" id="modalError" role="alert"></div>
          <div class="field"><label for="message">Introduce yourself <span class="hint">What are you hoping to learn?</span></label>
          <textarea id="message" name="message" required minlength="10" maxlength="600"></textarea></div>
          <button class="btn btn-primary">Send request</button></form>`.s,
          async f => { await api('/requests', { method: 'POST', body: { mentorId: id, message: f.message } }); toast('Request sent!'); router(); });
        break;
      case 'respond':
        await api(`/requests/${id}`, { method: 'PATCH', body: { status: el.dataset.status } });
        toast(el.dataset.status === 'accepted' ? 'Request accepted — the student can now book sessions.' : 'Request declined.');
        router(); break;
      case 'session': {
        const st = el.dataset.status;
        if (st === 'cancelled' && !confirm('Cancel this session?')) return;
        await api(`/sessions/${id}`, { method: 'PATCH', body: { status: st } });
        toast({ confirmed: 'Session confirmed!', completed: 'Marked complete — don\'t forget to leave a review.', cancelled: 'Session cancelled.' }[st]);
        router(); break;
      }
      case 'review':
        openModal(html`<h2 id="modalTitle">Review your session with ${el.dataset.name}</h2>
          <form class="form-grid"><div class="form-error" id="modalError" role="alert"></div>
          <fieldset class="star-input"><legend class="label" style="width:100%">Rating</legend>
            ${[5, 4, 3, 2, 1].map(n => html`<input type="radio" id="star${n}" name="rating" value="${n}" ${raw(n === 5 ? 'checked' : '')}><label for="star${n}" title="${n} star${n > 1 ? 's' : ''}">★<span class="sr-only">${n} star${n > 1 ? 's' : ''}</span></label>`)}
          </fieldset>
          <div class="field"><label for="comment">What was helpful?</label><textarea id="comment" name="comment" required minlength="10" maxlength="800"></textarea></div>
          <button class="btn btn-primary">Submit review</button></form>`.s,
          async f => { await api('/reviews', { method: 'POST', body: { sessionId: id, ...f } }); toast('Thanks for your review!'); router(); });
        break;
      case 'flag':
        openModal(html`<h2 id="modalTitle">Report this ${el.dataset.type}</h2>
          <p class="muted">Reports are confidential and reviewed by our admin team.</p>
          <form class="form-grid"><div class="form-error" id="modalError" role="alert"></div>
          <div class="field"><label for="reason">Reason</label><select id="reason" name="reason" required>
            <option value="">Choose a reason…</option><option>Inappropriate or offensive content</option><option>Harassment or bullying</option>
            <option>Asking for personal contact info</option><option>Spam or fake profile</option><option>Other</option></select></div>
          <div class="field"><label for="details">Details <span class="hint">optional</span></label><textarea id="details" name="details" maxlength="500"></textarea></div>
          <button class="btn btn-danger">Submit report</button></form>`.s,
          async f => { await api('/flags', { method: 'POST', body: { targetType: el.dataset.type, targetId: id, ...f } }); toast('Report submitted. Thank you for keeping the community safe.'); });
        break;
      case 'adminTab': sessionStorage.setItem('adminTab', el.dataset.tab); viewAdmin(el.dataset.tab); break;
      case 'userStatus':
        await api(`/admin/users/${id}`, { method: 'PATCH', body: { status: el.dataset.status } });
        toast(el.dataset.status === 'suspended' ? 'User suspended.' : 'User reactivated.'); viewAdmin('users'); break;
      case 'deleteUser':
        if (!confirm(`Permanently delete ${el.dataset.name}? This removes their sessions and reviews and cannot be undone.`)) return;
        await api(`/admin/users/${id}`, { method: 'DELETE' }); toast('User deleted.'); viewAdmin('users'); break;
      case 'flagAct':
        await api(`/admin/flags/${id}`, { method: 'PATCH', body: { action: el.dataset.act } });
        toast('Report updated.'); viewAdmin('flags'); break;
    }
  } catch (ex) { toast(ex.message, 'error'); }
});

// ---------- Boot ----------
(async function init() {
  try { state.user = await api('/auth/me'); } catch { state.user = null; }
  router();
})();
