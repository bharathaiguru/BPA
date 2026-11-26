/* settings.js — Settings drawer (spec §20), organized into Appearance, Accessibility,
   Language, Account & notifications, and Help. Changes apply instantly and are saved on
   this device. There are no fake notification switches: the panel says plainly what exists. */
'use strict';
(function () {
  const P = window.MMPrefs;
  const drawer = () => $('#settings');
  let opener = null;

  const seg = (name, label, options) => html`<fieldset class="field"><legend>${label}</legend><div class="segmented">${options.map(([v, l, aria]) =>
    html`<label><input type="radio" name="${name}" value="${v}" ${raw(P.get()[name] === v ? 'checked' : '')} ${raw(aria ? `aria-label="${aria}"` : '')}><span>${raw(String(l))}</span></label>`)}</div></fieldset>`;
  const toggle = (name, on, label, sub) => html`<div class="switch-row"><span class="switch-label" id="sl-${name}">${label}<small>${sub}</small></span>
    <span class="switch"><input type="checkbox" role="switch" name="${name}" aria-labelledby="sl-${name}" ${raw(on ? 'checked' : '')}><span></span></span></div>`;
  const THEMES = [['classic', 'themeClassic', ['#F8F7F3', '#174C3C', '#A64B24']], ['ocean', 'themeOcean', ['#F4F7FA', '#1E4A73', '#8A5A00']],
    ['dark', 'themeDark', ['#121614', '#84D2B2', '#F0A27A']], ['contrast', 'themeContrast', ['#FFFFFF', '#000000', '#003A8C']]];

  function render() {
    const p = P.get(), u = MM.state.user;
    drawer().innerHTML = html`
      <div class="settings-head" data-i18n-region><h2 id="settingsTitle">${t('setTitle')}</h2><button type="button" class="icon-btn" data-close-settings aria-label="Close settings">${icon('x')}</button></div>
      <form class="settings-body" id="settingsForm" data-i18n-region>
        <section class="set-group"><h3>${t('grpAppearance')}</h3>
          <fieldset class="field"><legend>${t('setTheme')}</legend><div class="swatches">${THEMES.map(([v, key, cols]) => html`<label class="swatch"><input type="radio" name="theme" value="${v}" ${raw(p.theme === v ? 'checked' : '')}>
            <span><i aria-hidden="true">${cols.map(c => html`<b style="background:${c}"></b>`)}</i>${t(key)}</span></label>`)}</div></fieldset>
          ${seg('spacing', t('setDensity'), [['comfortable', t('densityComfortable')], ['compact', t('densityCompact')]])}
        </section>
        <section class="set-group"><h3>${t('grpAccess')}</h3>
          ${seg('text', t('setText'), [['sm', '<span style="font-size:.8rem">A</span>', 'Small'], ['md', 'A', 'Medium'], ['lg', '<span style="font-size:1.15rem">A</span>', 'Large'], ['xl', '<span style="font-size:1.35rem">A</span>', 'Extra large']])}
          ${seg('targets', t('setTargets'), [['standard', t('targetsStandard')], ['large', t('targetsLarge')]])}
          ${seg('font', t('setFont'), [['default', t('fontDefault')], ['hyperlegible', `<span style="font-family:'Atkinson Hyperlegible'">${esc(t('fontHyper'))}</span>`], ['dyslexic', `<span style="font-family:OpenDyslexic;font-size:.8rem">${esc(t('fontDyslexic'))}</span>`]])}
          ${toggle('lines', p.lines === 'relaxed', t('relaxedLines'), t('relaxedLinesSub'))}
          ${toggle('links', p.links === 'underline', t('underlineLinks'), t('underlineLinksSub'))}
          ${toggle('focus', p.focus === 'strong', t('strongFocus'), t('strongFocusSub'))}
          ${toggle('motion', p.motion === 'reduce', t('reduceMotion'), t('reduceMotionSub'))}
        </section>
        <section class="set-group"><h3>${t('grpLanguage')}</h3>
          <div class="field"><label for="langSel">${t('langLabel')}</label><select id="langSel" name="lang">${Object.entries(LANGS).map(([k, v]) => html`<option value="${k}" lang="${k}" ${raw(p.lang === k ? 'selected' : '')}>${v}</option>`)}</select>
            <p class="hint">${t('langNote')}</p></div>
        </section>
        <section class="set-group"><h3>${t('grpAccount')}</h3>
          <p class="t-small">${t('notifNote')}</p>
          ${u ? (u.role !== 'admin' ? html`<p class="t-small mb-0">${t('accountIn')} <a href="#/profile" data-close-settings>${t('goProfile')}</a></p>` : '')
            : html`<p class="t-small mb-0">${t('accountOut')} <a href="#/login" data-close-settings>${t('navLogin')}</a></p>`}
        </section>
        <section class="set-group" style="border:0"><h3>${t('grpHelp')}</h3>
          <div class="row"><a class="btn btn-secondary btn-sm" href="#/safety" data-close-settings>${icon('shield')}${t('helpSafety')}</a>
            <button type="button" class="btn btn-secondary btn-sm" data-open-scribbler data-close-settings>${icon('help')}${t('helpScribbler')}</button></div>
        </section>
        <div class="row-between"><span class="t-meta" id="savedNote" aria-live="polite">${t('savedNote')}</span><button type="button" class="btn btn-tertiary" id="resetPrefs">${t('reset')}</button></div>
      </form>`;
    applyLangAttributes();
    const form = $('#settingsForm');
    form.addEventListener('change', e => {
      const el = e.target, map = { lines: ['relaxed', 'normal'], links: ['underline', 'auto'], focus: ['strong', 'normal'], motion: ['reduce', 'auto'] };
      P.set({ [el.name]: map[el.name] ? (el.checked ? map[el.name][0] : map[el.name][1]) : el.value });
      if (el.name === 'lang') languageChanged(el.name); else note();
    });
    $('#resetPrefs').addEventListener('click', () => { P.reset(); languageChanged('theme'); });
  }
  function note() { const n = $('#savedNote'); if (n) { n.textContent = '✓ ' + t('saved'); clearTimeout(note.t); note.t = setTimeout(() => { n.textContent = t('savedNote'); }, 2000); } }
  function languageChanged(focusName) {
    render(); MM.render({ keepFocus: true }); window.Scribbler?.refresh();
    drawer().querySelector(`[name="${focusName}"]`)?.focus(); note();
  }
  function open() { opener = document.activeElement; render(); drawer().showModal(); drawer().querySelector('#settingsForm input:checked, #settingsForm input')?.focus(); }
  document.addEventListener('click', e => {
    if (!drawer().open) return;
    if (e.target === drawer() || e.target.closest('[data-close-settings]')) drawer().close();
  });
  document.addEventListener('DOMContentLoaded', () => drawer().addEventListener('close', () => { if (opener && document.contains(opener)) opener.focus(); }));
  window.Settings = { open };
})();
