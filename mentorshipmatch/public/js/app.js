/* app.js — router and start-up. Decides which frame (public or workspace) a page uses,
   enforces sign-in and role access in the browser (the server enforces them again), manages
   focus after navigation, and refreshes Scribbler and sidebar counts. */
'use strict';

let firstRender = true, lastHash = location.hash, rendering = 0;

MM.render = async function render({ keepFocus = false } = {}) {
  // Protect unsaved work (e.g. the profile editor) from accidental navigation.
  const guard = MM.leaveGuard?.();
  if (guard && location.hash !== lastHash) {
    if (!window.confirm(guard)) { history.replaceState(null, '', lastHash); return; }
  }
  MM.leaveGuard = null;
  lastHash = location.hash;
  const myRender = ++rendering;
  const path = MM.path();
  const route = MM.routes.find(r => r.re.test(path));
  const u = MM.state.user;

  if (!route) return notFound();
  if (route.auth && !u) return MM.go(`#/login?next=${encodeURIComponent(path)}`);
  if (route.roles && !route.roles.includes(u.role)) return MM.go(u.role === 'admin' ? '#/admin' : '#/dashboard');

  const layout = route.layout === 'public' ? 'public' : route.layout === 'auto' ? (u ? 'app' : 'public') : 'app';
  if (layout === 'public') renderPublicShell(); else renderAppShell();
  document.title = `${route.title} · MentorshipMatch`;
  const main = $('#main');
  main.innerHTML = layout === 'app' ? html`<div aria-busy="true"><div class="skel skel-line" style="width:40%;height:28px"></div><div class="skel skel-line" style="width:60%"></div><div class="skel" style="height:160px;margin-top:24px"></div></div>`.s : '';

  const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(path.match(route.re)[i + 1])]));
  try {
    await route.view(params);
  } catch (err) {
    if (myRender !== rendering) return;
    if (err.status === 401) { MM.state.user = null; return MM.go(`#/login?next=${encodeURIComponent(path)}`); }
    main.innerHTML = html`<div style="padding:48px 0">${emptyState({ ic: 'alert', title: err.status === 404 ? 'We couldn’t find that page' : err.status === 403 ? 'You don’t have access to this page' : 'Something went wrong',
      body: err.message, action: html`<a class="btn btn-primary" href="#/">Go home</a>` })}</div>`;
  }
  if (myRender !== rendering) return;
  applyLangAttributes();
  window.Scribbler?.refresh();
  if (layout === 'app') refreshCounts();
  // Move focus to the page heading so screen-reader and keyboard users start at the new content.
  if (!firstRender && !keepFocus && !MM.anchor()) {
    const h1 = main.querySelector('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); } else main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  firstRender = false;
};

function notFound() {
  renderPublicShell();
  document.title = 'Page not found · MentorshipMatch';
  $('#main').innerHTML = html`<div class="narrow" style="padding:96px 0">${emptyState({ ic: 'search', title: 'We couldn’t find that page', body: 'The link may be out of date.', action: html`<a class="btn btn-primary" href="#/">Go to the home page</a>` })}</div>`;
}

document.addEventListener('click', async e => {
  if (!e.target.closest('[data-action="logout"]')) return;
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* already logged out */ }
  MM.state.user = null; MM.state.profile = null; MM.state.counts = {};
  sessionStorage.removeItem('mm-lastDirectory');
  toast('You’ve been logged out.');
  MM.go('#/');
});

window.addEventListener('hashchange', () => MM.render());

(async function boot() {
  try { MM.state.config = await api('/config'); } catch { /* defaults */ }
  try { MM.state.user = await api('/auth/me'); } catch { MM.state.user = null; }
  if (MM.state.user?.role === 'mentee') { try { MM.state.profile = await api('/profile'); } catch { /* optional */ } }
  MM.render();
})();
