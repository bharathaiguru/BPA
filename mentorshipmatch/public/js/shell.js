/* shell.js — page frames (spec §6).
   Public layout: header (Explore mentors · How it works · Our mission · Settings · Log in · Get started) + footer.
   App layout: role-specific sidebar, workspace header with account menu, mobile navigation drawer. */
'use strict';

const BRAND = html`<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8"/><path d="M8 22V10l8 7 8-7v12"/><circle cx="25" cy="7" r="3.5"/></svg><span>MentorshipMatch</span>`;

// Sidebar destinations per role (spec §6 table). `count` keys come from /api/counts.
const NAV = {
  mentee: [['/dashboard', 'Overview', 'home'], ['/mentors', 'Find mentors', 'search'], ['/my-mentors', 'My mentors', 'users'],
    ['/requests', 'Requests', 'inbox'], ['/sessions', 'Sessions', 'calendar', 'sessions'], ['/profile', 'My profile', 'user']],
  mentor: [['/dashboard', 'Overview', 'home'], ['/my-mentees', 'My mentees', 'users'], ['/requests', 'Requests', 'inbox', 'requests'],
    ['/sessions', 'Sessions', 'calendar', 'sessions'], ['/availability', 'Availability', 'clock'], ['/profile', 'My profile', 'user']],
  admin: [['/admin', 'Overview', 'home'], ['/admin/reports', 'Moderation queue', 'flag', 'flags'], ['/admin/users', 'Users', 'users'],
    ['/admin/approvals', 'Mentor approvals', 'user-check', 'approvals'], ['/admin/audit', 'Audit log', 'list']],
};
const COUNT_LABEL = { sessions: { mentor: 'awaiting your confirmation', mentee: 'to review' }, requests: { mentor: 'new' }, flags: { admin: 'open' }, approvals: { admin: 'pending' } };

function isActive(href) {
  const p = MM.path();
  if (href === '/admin') return p === '/admin';
  return p === href || p.startsWith(href + '/') || (href === '/mentors' && p.startsWith('/users/')) || (href === '/sessions' && p.startsWith('/book/'));
}

function sideNav(user, counts = {}) {
  const items = NAV[user.role] || [];
  return html`<nav class="side-nav" aria-label="Main">
    ${items.map(([href, label, ic, ck]) => {
      const n = ck && counts[ck];
      return html`<a href="#${href}" ${raw(isActive(href) ? 'aria-current="page"' : '')}>${icon(ic)}<span>${label}</span>${n ? html`<span class="count-badge" aria-label="${n} ${COUNT_LABEL[ck]?.[user.role] || ''}">${n}</span>` : ''}</a>`;
    })}
    <span class="side-label">Support</span>
    <button type="button" data-open-settings>${icon('settings')}<span>Settings</span></button>
    <a href="#/safety" ${raw(isActive('/safety') ? 'aria-current="page"' : '')}>${icon('shield')}<span>Safety &amp; help</span></a>
    <button type="button" data-action="logout">${icon('logout')}<span>Log out</span></button>
  </nav>`;
}

function demoBanner() {
  return MM.state.config.mode === 'demo'
    ? html`<div class="demo-banner" role="note">Competition demonstration · All people, reviews, and activity shown are fictional sample data.</div>` : '';
}

function renderPublicShell() {
  const p = MM.path();
  const link = (href, key) => html`<a class="nav-link" href="#${href}" ${raw(p === href ? 'aria-current="page"' : '')}>${t(key)}</a>`;
  const u = MM.state.user;
  $('#app').innerHTML = html`
    ${demoBanner()}
    <header class="public-header" data-i18n-region>
      <div class="container inner">
        <a href="#/" class="brand" aria-label="MentorshipMatch home">${BRAND}</a>
        <nav class="public-nav" aria-label="Main">${link('/explore', 'navExplore')}${link('/how-it-works', 'navHow')}${link('/about', 'navMission')}</nav>
        <div class="public-actions">
          <button class="icon-btn bordered" data-open-settings aria-label="${t('settings')}" title="${t('settings')}">${icon('settings')}</button>
          ${u ? html`<a class="btn btn-primary" href="#${u.role === 'admin' ? '/admin' : '/dashboard'}">${t('navWorkspace')}</a>`
            : html`<a class="btn btn-tertiary hide-sm" href="#/login">${t('navLogin')}</a><a class="btn btn-primary" href="#/register">${t('navStart')}</a>`}
          <button class="icon-btn menu-toggle" data-open-nav aria-label="Open menu" aria-haspopup="dialog">${icon('menu')}</button>
        </div>
      </div>
    </header>
    <main id="main" tabindex="-1"></main>
    <footer class="site-footer" data-i18n-region>
      <div class="container">
        <div class="footer-grid">
          <div><a href="#/" class="brand">${BRAND}</a><p class="t-small" style="max-width:26rem;margin-top:8px">${t('footerAbout')}</p></div>
          <div><h2>${t('footExplore')}</h2><ul><li><a href="#/explore">${t('navExplore')}</a></li><li><a href="#/how-it-works">${t('navHow')}</a></li><li><a href="#/register?role=mentor">${t('ctaMentor')}</a></li></ul></div>
          <div><h2>${t('footOrg')}</h2><ul><li><a href="#/about">${t('navMission')}</a></li><li><a href="#/about#team">${t('footTeam')}</a></li><li><a href="#/about#credits">${t('footCredits')}</a></li></ul></div>
          <div><h2>${t('footSupport')}</h2><ul><li><a href="#/safety">${t('footSafety')}</a></li><li><a href="#/how-it-works#faq">${t('footFaq')}</a></li><li><button class="link-button" data-open-scribbler>${t('footHelp')}</button></li></ul></div>
        </div>
        <div class="footer-bottom"><span>${t('footerCopy')}</span><span>${t('footerDemo')}</span></div>
      </div>
    </footer>`;
  MM.state.layout = 'public';
}

function renderAppShell() {
  const u = MM.state.user;
  $('#app').innerHTML = html`
    ${demoBanner()}
    <div class="app-shell">
      <aside class="sidebar" aria-label="Sidebar"><a href="#${u.role === 'admin' ? '/admin' : '/dashboard'}" class="brand" aria-label="MentorshipMatch overview">${BRAND}</a><div id="sideNav">${sideNav(u, MM.state.counts)}</div></aside>
      <div class="workspace">
        <header class="topbar">
          <button class="icon-btn menu-toggle" data-open-nav aria-label="Open navigation" aria-haspopup="dialog">${icon('menu')}</button>
          <a href="#/dashboard" class="brand mobile-brand" aria-label="MentorshipMatch overview">${BRAND}</a>
          <span class="spacer"></span>
          <button class="icon-btn" data-open-settings aria-label="Settings" title="Settings">${icon('settings')}</button>
          <div class="account">
            <button class="account-btn" id="accountBtn" aria-haspopup="true" aria-expanded="false" aria-controls="accountMenu">
              ${avatar(u.name, u.id, 'sm')}<span class="who">${u.name}<small>${u.role === 'mentee' ? 'Student' : u.role}</small></span>${icon('chevron-down')}</button>
            <div class="menu" id="accountMenu" hidden>
              <div class="menu-head"><strong>${u.name}</strong><br><span class="t-meta">${u.email}</span></div>
              ${u.role !== 'admin' ? html`<a href="#/profile">${icon('user')}My profile</a>` : ''}
              <button type="button" data-open-settings>${icon('settings')}Settings</button>
              <a href="#/safety">${icon('shield')}Safety &amp; help</a>
              <button type="button" data-action="logout">${icon('logout')}Log out</button>
            </div>
          </div>
        </header>
        <main id="main" tabindex="-1"></main>
      </div>
    </div>`;
  MM.state.layout = 'app';
}

function updateSideNav() {
  const el = $('#sideNav');
  if (el && MM.state.user) el.innerHTML = sideNav(MM.state.user, MM.state.counts);
}
async function refreshCounts() {
  if (!MM.state.user) return;
  try { MM.state.counts = await api('/counts'); updateSideNav(); } catch { /* counts are optional */ }
}

// Mobile navigation drawer
function openNavDrawer() {
  const d = $('#navDrawer');
  const u = MM.state.user;
  d.innerHTML = html`<div class="drawer-top"><a href="#/" class="brand">${BRAND}</a>
    <button class="icon-btn" data-close-nav aria-label="Close menu">${icon('x')}</button></div>
    ${u ? sideNav(u, MM.state.counts) : html`<nav class="side-nav" aria-label="Main">
      <a href="#/explore">${icon('search')}${t('navExplore')}</a><a href="#/how-it-works">${icon('help')}${t('navHow')}</a>
      <a href="#/about">${icon('heart')}${t('navMission')}</a><a href="#/safety">${icon('shield')}${t('footSafety')}</a>
      <span class="side-label">${t('account')}</span>
      <a href="#/login">${icon('user')}${t('navLogin')}</a><a href="#/register">${icon('arrow-right')}${t('navStart')}</a>
      <button type="button" data-open-settings>${icon('settings')}${t('settings')}</button></nav>`}`;
  d.setAttribute('aria-label', 'Navigation');
  d.showModal();
}

// Global shell interactions (delegated once)
document.addEventListener('click', e => {
  if (e.target.closest('[data-open-nav]')) { openNavDrawer(); return; }
  const nd = $('#navDrawer');
  if (nd.open && (e.target.closest('[data-close-nav]') || e.target.closest('#navDrawer a') || e.target === nd)) nd.close();
  if (e.target.closest('[data-open-settings]')) { if (nd.open) nd.close(); window.Settings?.open(); }
  if (e.target.closest('[data-open-scribbler]')) window.Scribbler?.open();
  const acct = e.target.closest('#accountBtn');
  const menu = $('#accountMenu');
  if (acct && menu) { const open = menu.hidden; menu.hidden = !open; acct.setAttribute('aria-expanded', String(open)); if (open) menu.querySelector('a,button')?.focus(); }
  else if (menu && !menu.hidden && !e.target.closest('#accountMenu')) { menu.hidden = true; $('#accountBtn')?.setAttribute('aria-expanded', 'false'); }
});
document.addEventListener('keydown', e => {
  const menu = $('#accountMenu');
  if (e.key === 'Escape' && menu && !menu.hidden) { menu.hidden = true; $('#accountBtn').setAttribute('aria-expanded', 'false'); $('#accountBtn').focus(); }
});
// Skip link: move focus to the main region instead of changing the hash route.
document.addEventListener('click', e => {
  if (e.target.closest('.skip-link')) { e.preventDefault(); const m = $('#main'); m?.focus(); m?.scrollIntoView(); }
});
