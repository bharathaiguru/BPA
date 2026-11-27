/* scribbler.js — Scribbler, the MentorshipMatch help guide (spec §19).
   Scribbler is a RULE-BASED helper: it matches keywords to written answers about how the site
   works. It is not generative AI and does not give mentoring advice. Answers appear instantly
   (no simulated typing), suggestions change with the current page and role, and the
   conversation is cleared whenever the signed-in account changes. */
'use strict';
(function () {
  const root = () => $('#scribbler');
  const escH = esc;

  // Original mascot: graduation cap, round glasses, friendly smile.
  const FACE = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <rect x="5" y="34" width="7" height="13" rx="3.5" fill="#A64B24"/><rect x="52" y="34" width="7" height="13" rx="3.5" fill="#A64B24"/>
    <rect x="10" y="22" width="44" height="37" rx="14" fill="#fffaf2" stroke="#202823" stroke-width="2.5"/>
    <rect x="16" y="30" width="32" height="23" rx="9" fill="#E5EDE7"/>
    <circle cx="25" cy="40" r="6.2" fill="#fff" stroke="#202823" stroke-width="2"/><circle cx="39" cy="40" r="6.2" fill="#fff" stroke="#202823" stroke-width="2"/>
    <path d="M31.2 40h1.6" stroke="#202823" stroke-width="2" stroke-linecap="round"/>
    <circle cx="25.6" cy="40.6" r="2.7" fill="#202823"/><circle cx="39.6" cy="40.6" r="2.7" fill="#202823"/>
    <circle cx="26.6" cy="39.4" r=".9" fill="#fff"/><circle cx="40.6" cy="39.4" r=".9" fill="#fff"/>
    <path d="M27.5 48.2q4.5 3.8 9 0" stroke="#202823" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M17 21.5v4.2c0 2.2 6.7 3.8 15 3.8s15-1.6 15-3.8v-4.2" fill="#174C3C"/><path d="M32 6 57 15.5 32 25 7 15.5Z" fill="#174C3C"/>
    <path d="M32 15.5 50.5 18.6V28" stroke="#A64B24" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="50.5" cy="29.6" r="2.3" fill="#A64B24"/></svg>`;

  const RULES = [
    [/(availab|schedule my|set.*time|horario|disponib|可用时间|उपलब्धता)/i, 'ansAvailability'],
    [/(approv|verif|aprob|批准|审核|स्वीकृत)/i, 'ansApprove', 'admin'],
    [/(moderat|handle.*report|queue|manejar|处理举报|रिपोर्ट.*संभाल)/i, 'ansModerate', 'admin'],
    [/(become|be a mentor|volunteer|apply|ser mentor|voluntari|成为导师|志愿|मेंटर बन|स्वयंसेव)/i, 'ansMentor'],
    [/(cancel|reschedul|cancelar|取消|रद्द)/i, 'ansCancel'],
    [/(request|after i send|accept|solicitud|请求|अनुरोध)/i, 'ansRequest'],
    [/(match|recommend|score|recomend|推荐|सुझाव)/i, 'ansMatch'],
    [/(book|session|video|call|meet|reserv|sesi|预约|会面|视频|सत्र|बुक)/i, 'ansSessions'],
    [/(free|cost|price|pay|gratis|免费|मुफ़्त|मुफ्त)/i, 'ansFree'],
    [/(report|flag|unsafe|harass|bully|inappropriate|reportar|举报|रिपोर्ट)/i, 'ansReport'],
    [/(review|rating|stars?|rese[ñn]a|评价|समीक्षा)/i, 'ansReview'],
    [/(setting|text size|font|colou?r|dark|contrast|language|bigger|dyslex|accessib|configur|idioma|设置|颜色|字体|语言|सेटिंग|रंग|फ़ॉन्ट|भाषा)/i, 'ansSettings'],
    [/(account|sign ?up|register|join|log ?in|password|cuenta|registr|账户|注册|登录|खाता|साइन)/i, 'ansAccount'],
  ];
  const INDUSTRY_WORDS = [
    [/(health|medic|doctor|nurs|pre-?med|salud|médic|医|健康|डॉक्टर|स्वास्थ्य)/i, 'Healthcare'], [/(tech|software|cod|computer|programm|tecnolog|程序|技术|计算机|तकनीक)/i, 'Technology'],
    [/(business|market|brand|negocio|mercad|商业|营销|व्यवसाय)/i, 'Business & Marketing'], [/(engineer|ingenier|工程|इंजीनियर)/i, 'Engineering'],
    [/(law|lawyer|legal|policy|government|abogad|derecho|法律|律师|वकील|कानून)/i, 'Law & Government'], [/(science|research|lab|biolog|chem|ciencia|科学|研究|विज्ञान)/i, 'Science & Research'],
  ];
  const FIND = /(find|search|browse|mentor|buscar|encontrar|导师|寻找|मेंटर|खोज)/i;
  const HELLO = /^(hi|hello|hey|hola|buenas|你好|嗨|नमस्ते)\b/i;
  const THANKS = /(thank|thx|gracias|谢谢|धन्यवाद|शुक्रिया)/i;

  let open = false, history = [], ownerId;

  // Suggestions depend on where you are and who you are.
  function chips() {
    const p = MM.path(), role = MM.state.user?.role;
    if (role === 'admin') return ['chipModerate', 'chipApprove', 'chipSettings'];
    if (p.startsWith('/sessions') || p.startsWith('/book')) return ['chipSessions', 'chipCancel', 'chipReport', 'chipSettings'];
    if (p.startsWith('/requests')) return ['chipRequest', 'chipFind', 'chipCancel', 'chipReport'];
    if (p.startsWith('/availability') || role === 'mentor') return ['chipAvailability', 'chipRequest', 'chipSessions', 'chipReport'];
    if (p.startsWith('/mentors') || p.startsWith('/explore') || p.startsWith('/users') || p.startsWith('/mentor/')) return ['chipFind', 'chipMatch', 'chipRequest', 'chipReport'];
    return ['chipFind', 'chipSessions', 'chipReport', 'chipSettings', 'chipFree', 'chipMentor'];
  }
  const ANSWER_FOR = { chipFind: 'ansFind', chipSessions: 'ansSessions', chipReport: 'ansReport', chipSettings: 'ansSettings', chipFree: 'ansFree', chipMentor: 'ansMentor',
    chipCancel: 'ansCancel', chipRequest: 'ansRequest', chipAvailability: 'ansAvailability', chipApprove: 'ansApprove', chipModerate: 'ansModerate', chipMatch: 'ansMatch' };

  function build() {
    // Clear the conversation if a different person is signed in (or signed out).
    const uid = MM.state.user?.id ?? null;
    if (uid !== ownerId) { history = []; ownerId = uid; }
    const hideHere = /^\/sessions\/\d+/.test(MM.path()); // keep the chat composer clear
    root().innerHTML = html`
      ${hideHere && !open ? '' : html`<button class="scribbler-launch" id="sbLaunch" aria-expanded="${open}" aria-controls="sbPanel" aria-label="${t('sbOpen')}" title="${t('sbName')}">${raw(FACE)}</button>`}
      <section class="scribbler-panel" id="sbPanel" aria-labelledby="sbTitle" data-i18n-region ${raw(open ? '' : 'hidden')}>
        <header class="sp-head"><span class="face">${raw(FACE)}</span><div><h2 id="sbTitle">${t('sbName')}</h2><p>${t('sbSub')}</p></div>
          <button class="icon-btn" id="sbClose" aria-label="${t('sbClose')}">${icon('x')}</button></header>
        <div class="sp-log" id="sbLog" role="log" aria-live="polite" tabindex="0"></div>
        <div class="sp-chips" role="group" aria-label="Suggested questions">${chips().map(c => html`<button type="button" data-chip="${c}">${t(c)}</button>`)}</div>
        <form class="sp-form" id="sbForm"><label for="sbInput" class="sr-only">${t('sbPlaceholder')}</label>
          <input id="sbInput" autocomplete="off" maxlength="300" placeholder="${t('sbPlaceholder')}"><button class="btn btn-primary btn-sm" type="submit">${t('sbSend')}</button></form>
        <p class="sp-note">${t('sbDisclaimer')}</p>
      </section>`;
    renderLog();
    applyLangAttributes();
  }
  function renderLog() {
    const log = $('#sbLog'); if (!log) return;
    log.innerHTML = history.map(m => `<div class="sp-msg ${m.from}">${m.from === 'me' ? escH(m.text) : t(m.key, m.vars) + (m.extra || '')}</div>`).join('');
    log.scrollTop = log.scrollHeight;
  }
  function toggle(force) {
    open = typeof force === 'boolean' ? force : !open;
    if (open && !history.length) history.push({ from: 'bot', key: 'sbGreet' });
    build();
    if (open) $('#sbInput').focus(); else $('#sbLaunch')?.focus();
  }
  async function answer(q) {
    const role = MM.state.user?.role;
    if (HELLO.test(q.trim())) return { key: 'ansHello' };
    if (THANKS.test(q)) return { key: 'ansThanks' };
    for (const [re, key, onlyRole] of RULES) if (re.test(q) && (!onlyRole || onlyRole === role)) return { key };
    for (const [re, industry] of INDUSTRY_WORDS) if (re.test(q)) {
      try {
        const list = await api(`/public/mentors?industry=${encodeURIComponent(industry)}&limit=5`);
        if (list.length) {
          const link = id => (MM.state.user ? `#/users/${id}` : `#/mentor/${id}`);
          return { key: 'ansMentorsIn', vars: { x: escH(industry) }, extra: list.map(m => `<br>• <a href="${link(m.id)}">${escH(m.name)}</a> — ${escH(m.headline)}`).join('') };
        }
      } catch { /* fall through */ }
      return { key: 'ansFind' };
    }
    if (FIND.test(q)) return { key: 'ansFind' };
    return { key: 'ansFallback' };
  }
  async function ask(text, key) {
    history.push({ from: 'me', text });
    const a = key ? { key } : await answer(text);
    history.push({ from: 'bot', ...a });
    renderLog();
  }

  document.addEventListener('click', e => {
    if (e.target.closest('#sbLaunch')) toggle();
    else if (e.target.closest('#sbClose')) toggle(false);
    const c = e.target.closest('#sbPanel [data-chip]'); if (c) ask(t(c.dataset.chip), ANSWER_FOR[c.dataset.chip]);
    if (e.target.closest('#sbLog a') && window.innerWidth < 700) toggle(false);
  });
  document.addEventListener('submit', e => {
    if (e.target.id !== 'sbForm') return;
    e.preventDefault(); const i = $('#sbInput'), q = i.value.trim(); if (q) { i.value = ''; ask(q); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open && e.target.closest('#sbPanel')) toggle(false); });

  window.Scribbler = { refresh: build, open: () => toggle(true) };
})();
