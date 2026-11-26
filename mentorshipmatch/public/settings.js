/* settings.js — the Settings drawer (gear button, top right).
   Changes apply instantly and are saved on this device by prefs.js. */
'use strict';
(function () {
  const drawer = document.getElementById('settingsDrawer');
  const btn = document.getElementById('settingsBtn');
  const P = window.MMPrefs;

  const seg = (name, options) => {
    const cur = P.get()[name];
    return `<div class="segmented" role="radiogroup">${options.map(([v, label, aria]) =>
      `<label><input type="radio" name="${name}" value="${v}" ${cur === v ? 'checked' : ''} ${aria ? `aria-label="${aria}"` : ''}><span>${label}</span></label>`).join('')}</div>`;
  };
  const toggle = (name, label, sub, on) =>
    `<div class="toggle-row"><span class="tl" id="lbl-${name}">${label}${sub ? `<small>${sub}</small>` : ''}</span>
      <span class="switch"><input type="checkbox" role="switch" name="${name}" aria-labelledby="lbl-${name}" ${on ? 'checked' : ''}><span></span></span></div>`;

  const THEMES = [
    ['classic', 'themeClassic', ['#f6f3ee', '#1f5c4a', '#c8531f']],
    ['ocean', 'themeOcean', ['#f3f6f9', '#1f4e79', '#d08a12']],
    ['dark', 'themeDark', ['#161615', '#6cc3a0', '#f08a57']],
    ['contrast', 'themeContrast', ['#ffffff', '#000000', '#0039a6']],
  ];

  function render() {
    const p = P.get();
    drawer.innerHTML = `
      <div class="drawer-head"><h2 id="settingsTitle">${t('settingsTitle')}</h2>
        <form method="dialog" style="margin:0"><button class="icon-btn" aria-label="Close settings">&times;</button></form></div>
      <form class="drawer-body" id="settingsForm">
        <div class="set-group"><h3><label for="langSelect">${t('setLanguage')}</label></h3>
          <select id="langSelect" name="lang">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${p.lang === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>

        <fieldset class="set-group"><legend>${t('setColors')}</legend>
          <div class="swatches">${THEMES.map(([v, key, cols]) => `<label class="swatch"><input type="radio" name="theme" value="${v}" ${p.theme === v ? 'checked' : ''}>
            <span><i>${cols.map(c => `<b style="background:${c}"></b>`).join('')}</i>${t(key)}</span></label>`).join('')}</div></fieldset>

        <fieldset class="set-group"><legend>${t('setText')}</legend>
          ${seg('text', [['sm', '<span style="font-size:.8rem">A</span>', 'Small'], ['md', 'A', 'Medium'], ['lg', '<span style="font-size:1.15rem">A</span>', 'Large'], ['xl', '<span style="font-size:1.3rem">A</span>', 'Extra large']])}</fieldset>

        <fieldset class="set-group"><legend>${t('setButtons')}</legend>
          ${seg('buttons', [['standard', t('btnStandard')], ['large', t('btnLarge')]])}</fieldset>

        <fieldset class="set-group"><legend>${t('setLayout')}</legend>
          ${seg('spacing', [['comfortable', t('spacingComfortable')], ['compact', t('spacingCompact')]])}</fieldset>

        <fieldset class="set-group"><legend>${t('setReadability')}</legend>
          <p class="label" style="margin:0 0 .4rem">${t('fontLabel')}</p>
          ${seg('font', [['default', t('fontDefault')], ['hyperlegible', `<span style="font-family:'Atkinson Hyperlegible'">${t('fontHyper')}</span>`], ['dyslexic', `<span style="font-family:OpenDyslexic;font-size:.8rem">${t('fontDyslexic')}</span>`]])}
          <div style="margin-top:.6rem">
            ${toggle('lines', t('relaxedLines'), t('relaxedLinesSub'), p.lines === 'relaxed')}
            ${toggle('links', t('underlineLinks'), t('underlineLinksSub'), p.links === 'underline')}
            ${toggle('focus', t('strongFocus'), t('strongFocusSub'), p.focus === 'strong')}
            ${toggle('motion', t('reduceMotion'), t('reduceMotionSub'), p.motion === 'reduce')}
          </div></fieldset>

        <fieldset class="set-group"><legend>${t('setNotifications')}</legend>
          ${toggle('notifySessions', t('notifySessions'), '', p.notifySessions)}
          ${toggle('notifyRequests', t('notifyRequests'), '', p.notifyRequests)}
          ${toggle('notifyReviews', t('notifyReviews'), '', p.notifyReviews)}
          ${toggle('scribblerTips', t('scribblerTips'), t('scribblerTipsSub'), p.scribblerTips)}
        </fieldset>

        <div class="drawer-foot"><span class="saved-note" aria-live="polite" id="savedNote">${t('setNote')}</span>
          <button type="button" class="btn btn-outline btn-sm" id="resetPrefs">${t('reset')}</button></div>
      </form>`;

    const form = drawer.querySelector('#settingsForm');
    form.addEventListener('change', e => {
      const el = e.target;
      const map = { lines: ['relaxed', 'normal'], links: ['underline', 'auto'], focus: ['strong', 'normal'], motion: ['reduce', 'auto'] };
      let patch;
      if (map[el.name]) patch = { [el.name]: el.checked ? map[el.name][0] : map[el.name][1] };
      else if (el.type === 'checkbox') patch = { [el.name]: el.checked };
      else patch = { [el.name]: el.value };
      P.set(patch);
      if (el.name === 'lang') languageChanged(); else note();
    });
    drawer.querySelector('#resetPrefs').addEventListener('click', () => { P.reset(); languageChanged(); });
  }

  function note() {
    const n = drawer.querySelector('#savedNote');
    if (n) { n.textContent = '✓ ' + t('saved'); clearTimeout(note.t); note.t = setTimeout(() => (n.textContent = t('setNote')), 1800); }
  }
  function languageChanged() {
    const focusName = document.activeElement && document.activeElement.name;
    render();
    if (window.MM) window.MM.rerender();
    if (window.Scribbler) window.Scribbler.refresh();
    const again = focusName && drawer.querySelector(`[name="${focusName}"]`);
    if (again) again.focus();
    note();
  }

  btn.addEventListener('click', () => { render(); drawer.showModal(); });
  drawer.addEventListener('click', e => { if (e.target === drawer) drawer.close(); }); // click backdrop to close
  drawer.addEventListener('close', () => btn.focus());
})();
