/* views/public.js — pages anyone can see: home, explore mentors, public mentor profile,
   about (mission, team, technology, credits), and the safety center. */
'use strict';

const heroVisual = () => {
  if (MM.state.config.heroPhoto) return html`<figure class="hero-visual photo"><img src="/assets/hero.jpg" alt="${MM.state.config.heroPhotoAlt || 'A student talking with a mentor'}" width="720" height="560"></figure>`;
  // Product illustration made of real UI components with clearly labelled sample data.
  return html`<figure class="hero-visual" aria-label="${t('heroCaption')}">
    <div class="mock next" aria-hidden="true"><span class="mock-label">${t('mockNext')}</span>
      <div class="row" style="margin-top:8px">${avatar('Marcus Bell', 1)}<div><strong>${t('mockTopic')}</strong><div class="t-meta">Marcus Bell · Senior Software Engineer</div></div></div>
      <div class="row" style="margin-top:12px">${statusLabel('session', 'confirmed')}<span class="t-meta">${icon('video')} 30 min</span></div></div>
    <div class="mock msg" aria-hidden="true"><div class="t-meta" style="margin-bottom:4px">Marcus</div>${t('mockMsg')}</div>
    <div class="mock match" aria-hidden="true"><span class="industry ico" style="padding:0;border:0;min-height:0;width:40px;height:40px">${icon('target')}</span><span>${t('mockMatch')}</span></div>
    <figcaption>${t('heroCaption')}</figcaption>
  </figure>`;
};

MM.route('/', async () => {
  if (MM.state.user) return MM.go(MM.state.user.role === 'admin' ? '#/admin' : '#/dashboard');
  await homeView();
}, { title: 'Student-to-Professional Mentorship', layout: 'public', bare: true });
MM.route('/how-it-works', async () => { await homeView(); }, { title: 'How it works', layout: 'public', bare: true });

async function homeView() {
  const main = $('#main');
  main.setAttribute('data-i18n-region', '');
  const [industries, featured, stats] = await Promise.all([
    api('/public/industries').catch(() => []), api('/public/mentors?limit=3&sort=rating').catch(() => []), api('/public/stats').catch(() => ({})),
  ]);
  main.innerHTML = html`<div class="home">
  <section class="hero"><div class="container hero-grid">
    <div>
      <span class="eyebrow">${t('heroEyebrow')}</span>
      <h1 class="t-display">${t('heroTitleA')} <em>${t('heroTitleB')}</em></h1>
      <p class="t-lead">${t('heroLead')}</p>
      <div class="hero-actions"><a class="btn btn-primary btn-lg" href="#/explore">${t('ctaExplore')} ${icon('arrow-right')}</a>
        <a class="btn btn-secondary btn-lg" href="#/register?role=mentor">${t('ctaMentor')}</a></div>
      <ul class="trust-points"><li>${icon('check-circle')}${t('trust1')}</li><li>${icon('users')}${t('trust2')}</li><li>${icon('shield')}${t('trust3')}</li></ul>
    </div>
    ${heroVisual()}
  </div></section>

  <section aria-labelledby="ind-h"><div class="container">
    <div class="section-head"><span class="eyebrow">${t('indEyebrow')}</span><h2 id="ind-h" class="t-public-h">${t('indTitle')}</h2><p>${t('indLead')}</p></div>
    <div class="industry-grid">${industries.map(i => html`<a class="industry" href="#/explore?industry=${encodeURIComponent(i.industry)}">
      <span class="ico">${icon(INDUSTRY_ICONS[i.industry] || 'briefcase')}</span><span><strong>${i.industry}</strong><span>${tCount(i.count)}</span></span>
      <span class="arrow">${icon('arrow-right')}</span></a>`)}</div>
  </div></section>

  <section aria-labelledby="feat-h"><div class="container">
    <div class="row-between section-head" style="max-width:none"><div style="max-width:640px"><span class="eyebrow">${t('featEyebrow')}</span><h2 id="feat-h" class="t-public-h">${t('featTitle')}</h2><p>${t('featLead')}</p></div>
      <a class="btn btn-secondary" href="#/explore">${t('featAll')} ${icon('arrow-right')}</a></div>
    <div class="grid-3">${featured.map(m => mentorCard(m, { publicView: true }))}</div>
  </div></section>

  <section id="how" aria-labelledby="how-h"><div class="container">
    <div class="section-head"><span class="eyebrow">${t('howEyebrow')}</span><h2 id="how-h" class="t-public-h">${t('howTitle')}</h2></div>
    <ol class="steps">${[1, 2, 3, 4].map(n => html`<li><h3>${t(`s${n}t`)}</h3><p>${t(`s${n}d`)}</p></li>`)}</ol>
  </div></section>

  <section aria-label="${t('forStudents')} / ${t('forMentors')}"><div class="container benefits">
    <div class="benefit"><span class="eyebrow">${t('forStudents')}</span><h2 class="t-section">${t('forStudentsT')}</h2>
      <ul>${['st1', 'st2', 'st3'].map(k => html`<li>${icon('check')}<span>${t(k)}</span></li>`)}</ul>
      <a class="btn btn-primary" href="#/register">${t('studentsCta')}</a></div>
    <div class="benefit"><span class="eyebrow">${t('forMentors')}</span><h2 class="t-section">${t('forMentorsT')}</h2>
      <ul>${['mt1', 'mt2', 'mt3'].map(k => html`<li>${icon('check')}<span>${t(k)}</span></li>`)}</ul>
      <a class="btn btn-secondary" href="#/register?role=mentor">${t('mentorsCta')}</a></div>
  </div></section>

  <section class="mission-band" aria-labelledby="mis-h"><div class="container mission-grid">
    <div><h2 id="mis-h" class="t-public-h">${t('missionTitle')}</h2><p class="t-lead">${t('missionText')}</p></div>
    <div><div class="mission-stats">
      <div><strong>${stats.mentors ?? '—'}</strong><span>${t('statMentors')}</span></div>
      <div><strong>${stats.industries ?? '—'}</strong><span>${t('statIndustries')}</span></div>
      <div><strong>${stats.sessions ?? '—'}</strong><span>${t('statSessions')}</span></div></div>
      <p class="mission-note">${stats.mode === 'demo' ? t('statNoteDemo') : t('statNote')}</p></div>
  </div></section>

  <section aria-labelledby="safe-h"><div class="container">
    <div class="section-head"><h2 id="safe-h" class="t-public-h">${t('safetyTitle')}</h2></div>
    <div class="safety-grid">${[['lock', 1], ['user-check', 2], ['chat', 3], ['flag', 4]].map(([ic, n]) => html`<div class="safety-item">${icon(ic)}<h3>${t(`sf${n}t`)}</h3><p>${t(`sf${n}d`)}</p></div>`)}</div>
    <p style="margin-top:32px"><a href="#/safety">${t('safetyLink')} ${icon('arrow-right')}</a></p>
  </div></section>

  <section id="faq" aria-labelledby="faq-h"><div class="container">
    <div class="section-head"><h2 id="faq-h" class="t-public-h">${t('faqTitle')}</h2></div>
    <div class="faq">${[1, 2, 3, 4, 5, 6].map(n => html`<details><summary>${t(`q${n}`)}${icon('chevron-down')}</summary><p>${t(`a${n}`)}</p></details>`)}</div>
  </div></section>

  <section class="final-cta" aria-labelledby="cta-h"><div class="narrow">
    <h2 id="cta-h" class="t-public-h">${t('finalTitle')}</h2><p class="t-lead" style="margin-inline:auto">${t('finalLead')}</p>
    <div class="hero-actions"><a class="btn btn-primary btn-lg" href="#/register">${t('navStart')}</a><a class="btn btn-secondary btn-lg" href="#/explore">${t('ctaExplore')}</a></div>
  </div></section>
  </div>`;
  const anchor = MM.path() === '/how-it-works' ? (MM.anchor() || 'how') : MM.anchor();
  if (anchor) requestAnimationFrame(() => { const el = document.getElementById(anchor); el?.scrollIntoView(); el?.querySelector('h2')?.setAttribute('tabindex', '-1'); el?.querySelector('h2')?.focus({ preventScroll: true }); });
}

// ---------- Public explore (no login) ----------
MM.route('/explore', async () => {
  if (MM.state.user?.role === 'mentee') return MM.go('#/mentors' + (location.hash.includes('?') ? '?' + location.hash.split('?')[1] : ''));
  await directoryView({ publicView: true });
}, { title: 'Explore mentors', layout: 'public' });

MM.route('/mentor/:id', async ({ id }) => {
  if (MM.state.user) return MM.go(`#/users/${id}`);
  const p = await api(`/public/mentors/${id}`);
  document.title = `${p.name} · MentorshipMatch`;
  $('#main').innerHTML = html`<div class="container" style="padding:32px 0 96px">${mentorProfile(p, { publicView: true })}</div>`;
}, { title: 'Mentor profile', layout: 'public' });

// ---------- About ----------
MM.route('/about', () => {
  $('#main').innerHTML = html`<div class="narrow prose" style="padding:64px 0 96px">
    <span class="eyebrow">Our mission</span>
    <h1 class="t-display" style="font-size:var(--fs-public-h)">Career guidance shouldn’t depend on who you know.</h1>
    <p class="t-lead">Many students never meet someone who works in the career they dream about. MentorshipMatch is a nonprofit initiative that connects high school and college students with volunteer professionals so every student can ask real questions and get honest answers.</p>
    <h2>Who it’s for</h2>
    <ul><li><strong>Students</strong> in grades 9–12 and in college who want to explore careers, get feedback, or plan next steps.</li>
      <li><strong>Professionals</strong> who want to volunteer a little time to share what they’ve learned.</li>
      <li><strong>Administrators</strong> at the nonprofit who approve mentors and keep the community safe.</li></ul>
    <h2 id="team" tabindex="-1">Team</h2>
    <p>Built by a BPA Web Application Team: <strong>Bharath, Sahass, Shivesh, and Saksham</strong>. Each member’s contributions are documented in the project README.</p>
    <h2>Technology</h2>
    <p>For judges and developers. Ordinary users never need to know this.</p>
    <ul><li><strong>Server:</strong> Node.js and Express with a REST API, split into feature routes (auth, mentors, profiles, requests, sessions, admin).</li>
      <li><strong>Database:</strong> SQLite (built into Node 22) with foreign keys, check constraints, and safe migrations.</li>
      <li><strong>Front end:</strong> semantic HTML, CSS custom properties (design tokens, four themes), and plain JavaScript. No framework.</li>
      <li><strong>Security:</strong> bcrypt password hashing, session cookies, rate limiting, Helmet security headers and Content Security Policy, parameterized SQL, escaped output, and permission checks on the server.</li>
      <li><strong>Scheduling:</strong> mentor availability is stored per time zone, sessions are stored as UTC timestamps, and overlapping bookings are rejected for both people.</li>
      <li><strong>Testing:</strong> automated API tests for permissions and lifecycle rules, and an automated WCAG contrast check for every theme.</li></ul>
    <h2 id="credits" tabindex="-1">Credits &amp; licenses</h2>
    <ul><li>Fonts: Public Sans (U.S. Web Design System), Fraunces, Atkinson Hyperlegible (Braille Institute), and OpenDyslexic, all self-hosted via Fontsource under the SIL Open Font License 1.1.</li>
      <li>Icons: Feather Icons (MIT License). The MentorshipMatch logo and Scribbler mascot are original artwork made for this project.</li>
      <li>Video meetings: Jitsi Meet (meet.jit.si), free and open source.</li>
      <li>Server packages (MIT License): express, express-session, helmet, express-rate-limit, bcryptjs.</li>
      <li>All people, organizations, reviews, and activity in the demo database are fictional.</li></ul>
  </div>`;
  const a = MM.anchor(); if (a) document.getElementById(a)?.focus();
}, { title: 'About', layout: 'auto' });

// ---------- Safety center ----------
MM.route('/safety', () => {
  const sections = [
    ['users', 'Appropriate mentorship', 'Mentoring is about school, careers, and personal growth. Mentors share experience and advice; they are not tutors for graded work, therapists, or recruiters. Be respectful, patient, and honest about your experience.'],
    ['lock', 'Privacy: what is shared and with whom', 'Student profiles are private. Only mentors a student has sent a request to (and administrators) can see a student’s name, grade or year, school, interests, and goals. Email addresses are never shown to other members. Public reviews never show student names.'],
    ['chat', 'Communication boundaries', 'Keep conversations on MentorshipMatch. Each session has its own chat room or private video link. Don’t ask for or share phone numbers, home addresses, social media accounts, or photos. Never agree to meet in person through the platform.'],
    ['flag', 'Reporting a concern', 'Use the Report button (flag icon) on any profile, review, or chat message. Choose a reason and describe what happened. Reports are confidential. You can report something even if you are not sure it breaks a rule.'],
    ['shield', 'What happens after you report', 'An administrator reviews every report and can see the surrounding context. They can dismiss it, remove content, or suspend an account. Serious actions require a written reason and are recorded in an audit log. Reports are reviewed by people; MentorshipMatch does not automatically monitor conversations.'],
    ['help', 'Getting help', 'If you feel unsafe or someone is in immediate danger, stop the conversation, tell a parent, guardian, teacher, or another trusted adult, and call 911. For questions about using the site, ask Scribbler or an administrator.'],
  ];
  $('#main').innerHTML = html`<div class="${MM.state.layout === 'public' ? 'narrow' : ''}" style="${MM.state.layout === 'public' ? 'padding:64px 0 96px' : ''}">
    ${MM.state.layout === 'public' ? html`<span class="eyebrow">Safety center</span><h1 class="t-public-h">Community guidelines &amp; safety</h1>` : pageHead('Safety & help', 'How MentorshipMatch keeps students safe, and what to do if something feels wrong.')}
    <p class="t-lead">MentorshipMatch serves students, many of whom are under 18. Everyone who joins agrees to these guidelines.</p>
    <div class="stack-lg" style="margin-top:32px">${sections.map(([ic, h, p]) => html`<section class="row" style="align-items:flex-start;flex-wrap:nowrap;gap:16px">
      <span class="industry ico" style="padding:0;border:0;min-height:0;width:44px;height:44px;flex:none;background:var(--sage);color:var(--brand);border-radius:50%;display:grid;place-items:center">${icon(ic)}</span>
      <div><h2 class="t-section">${h}</h2><p class="mb-0">${p}</p></div></section>`)}</div>
    <div class="alert alert-info" style="margin-top:32px">${icon('info')}<p>Breaking these guidelines can lead to content removal or account suspension.</p></div>
  </div>`;
}, { title: 'Safety center', layout: 'auto' });
