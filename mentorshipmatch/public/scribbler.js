/* scribbler.js — "Scribbler", the MentorshipMatch help assistant (bottom-right corner).
   Scribbler answers common questions about the site using keyword matching, so it
   works offline with no API key. It can also list mentors by industry and open
   their résumés. (A team could later connect it to an AI API on the server.) */
'use strict';
(function () {
  const root = document.getElementById('scribbler');
  const P = window.MMPrefs;
  const escHTML = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Original robot illustration: graduation cap, round glasses, friendly smile.
  const FACE = `
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <rect x="5" y="34" width="7" height="13" rx="3.5" fill="#c8531f"/>
    <rect x="52" y="34" width="7" height="13" rx="3.5" fill="#c8531f"/>
    <rect x="10" y="22" width="44" height="37" rx="14" fill="#fffaf2" stroke="#1d1c1a" stroke-width="2.5"/>
    <rect x="16" y="30" width="32" height="23" rx="9" fill="#dcece4"/>
    <circle cx="25" cy="40" r="6.2" fill="#fff" stroke="#1d1c1a" stroke-width="2"/>
    <circle cx="39" cy="40" r="6.2" fill="#fff" stroke="#1d1c1a" stroke-width="2"/>
    <path d="M31.2 40h1.6" stroke="#1d1c1a" stroke-width="2" stroke-linecap="round"/>
    <g class="sb-eyes"><circle cx="25.6" cy="40.6" r="2.7" fill="#1d1c1a"/><circle cx="39.6" cy="40.6" r="2.7" fill="#1d1c1a"/></g>
    <circle cx="26.6" cy="39.4" r=".9" fill="#fff"/><circle cx="40.6" cy="39.4" r=".9" fill="#fff"/>
    <circle cx="19.6" cy="48" r="2.3" fill="#f2a397" opacity=".85"/><circle cx="44.4" cy="48" r="2.3" fill="#f2a397" opacity=".85"/>
    <path d="M27.5 48.2q4.5 3.8 9 0" stroke="#1d1c1a" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M17 21.5v4.2c0 2.2 6.7 3.8 15 3.8s15-1.6 15-3.8v-4.2" fill="#1d1c1a"/>
    <path d="M32 6 57 15.5 32 25 7 15.5Z" fill="#1d1c1a"/>
    <path d="M32 15.5 50.5 18.6V28" stroke="#c8531f" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <circle cx="50.5" cy="29.6" r="2.3" fill="#c8531f"/>
  </svg>`;

  const CHIPS = [['chipFind', 'ansFind'], ['chipBook', 'ansBook'], ['chipFree', 'ansFree'], ['chipSafe', 'ansSafe'], ['chipMentor', 'ansMentor'], ['chipSettings', 'ansSettings']];

  // Keyword rules, checked in order. Includes common words in all four languages.
  const RULES = [
    [/(become|be a|volunteer|professional|i'?m a mentor|sign up as a mentor|ser mentor|voluntari|成为导师|志愿|मेंटर बन|स्वयंसेव)/i, 'ansMentor'],
    [/(book|schedul|session|video|call|meeting|meet|reserv|sesi|预约|会面|视频|सत्र|बुक|वीडियो)/i, 'ansBook'],
    [/(free|cost|price|pay|money|gratis|cuesta|免费|价格|मुफ़्त|मुफ्त|कीमत)/i, 'ansFree'],
    [/(report|flag|inappropriate|harass|bully|reportar|举报|रिपोर्ट)/i, 'ansReport'],
    [/(safe|privacy|private|secure|seguro|privad|安全|隐私|सुरक्षित|निजी)/i, 'ansSafe'],
    [/(review|rating|stars?|rese[ñn]a|评价|समीक्षा)/i, 'ansReview'],
    [/(setting|text size|font|colou?r|dark|contrast|language|bigger|larger|dyslex|accessib|configur|idioma|tama[ñn]o|设置|颜色|字体|语言|सेटिंग|रंग|फ़ॉन्ट|भाषा)/i, 'ansSettings'],
    [/(account|sign ?up|register|join|log ?in|password|cuenta|registr|contraseña|账户|注册|登录|密码|खाता|साइन|लॉग|पासवर्ड)/i, 'ansAccount'],
  ];
  const INDUSTRIES = [
    [/(health|medic|doctor|nurs|hospital|pre-?med|salud|médic|医|健康|डॉक्टर|स्वास्थ्य|चिकित्सा)/i, 'Healthcare'],
    [/(tech|software|code|coding|computer|programm|developer|tecnolog|程序|技术|计算机|सॉफ़्टवेयर|तकनीक|कंप्यूटर)/i, 'Technology'],
    [/(business|market|brand|social media|negocio|mercad|商业|营销|व्यवसाय|मार्केटिंग)/i, 'Business & Marketing'],
    [/(engineer|ingenier|工程|इंजीनियर)/i, 'Engineering'],
    [/(law|lawyer|legal|attorney|policy|government|abogad|derecho|法律|律师|वकील|कानून)/i, 'Law & Government'],
  ];
  const FIND = /(find|search|browse|mentor|look|buscar|encontrar|导师|寻找|找|मेंटर|खोज)/i;
  const HELLO = /^(hi|hello|hey|yo|sup|hola|buenas|你好|嗨|नमस्ते|हैलो)\b/i;
  const THANKS = /(thank|thx|ty\b|gracias|谢谢|धन्यवाद|शुक्रिया)/i;

  let open = false, history = [], mentorsCache = null;

  function build() {
    root.innerHTML = `
      <button class="scribbler-launch" id="sbLaunch" aria-expanded="false" aria-controls="sbPanel" aria-label="${t('sbOpen')}" title="${t('sbName')}">
        ${FACE}<span class="dot" aria-hidden="true"></span></button>
      <div class="scribbler-panel" id="sbPanel" role="dialog" aria-label="${t('sbName')}" hidden>
        <div class="sp-head"><span class="face">${FACE}</span>
          <div><strong>${t('sbName')}</strong><small>● ${t('sbSub')}</small></div>
          <button class="sp-close" id="sbClose" aria-label="Close">&times;</button></div>
        <div class="sp-log" id="sbLog" role="log" aria-live="polite"></div>
        <div class="sp-chips" id="sbChips">${CHIPS.map(([c, a]) => `<button type="button" data-ans="${a}" data-q="${c}">${escHTML(t(c))}</button>`).join('')}</div>
        <form class="sp-form" id="sbForm"><label for="sbInput" class="sr-only">${t('sbPlaceholder')}</label>
          <input id="sbInput" autocomplete="off" maxlength="300" placeholder="${t('sbPlaceholder')}">
          <button class="btn btn-primary btn-sm" type="submit">${t('sbSend')}</button></form>
        <p class="sp-note">${t('sbNote')}</p>
      </div>`;
    root.querySelector('#sbLaunch').addEventListener('click', () => toggle());
    root.querySelector('#sbClose').addEventListener('click', () => toggle(false));
    root.querySelector('#sbChips').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      ask(t(b.dataset.q), b.dataset.ans);
    });
    root.querySelector('#sbForm').addEventListener('submit', e => {
      e.preventDefault();
      const input = root.querySelector('#sbInput'); const q = input.value.trim();
      if (q) { input.value = ''; ask(q); }
    });
    root.querySelector('#sbLog').addEventListener('click', e => {
      const r = e.target.closest('[data-resume]');
      if (r) { e.preventDefault(); window.MM && window.MM.openResume(r.dataset.resume); return; }
      if (e.target.closest('a[href^="#"]') && window.innerWidth < 700) toggle(false);
    });
    root.querySelector('#sbPanel').addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false); });
    renderLog();
    if (open) { root.querySelector('#sbPanel').hidden = false; root.querySelector('#sbLaunch').setAttribute('aria-expanded', 'true'); }
  }

  function renderLog() {
    const log = root.querySelector('#sbLog');
    if (!log) return;
    log.innerHTML = history.map(m => `<div class="sp-msg ${m.from}">${m.from === 'me' ? escHTML(m.text) : (m.key ? t(m.key, m.vars) : '') + (m.extra || '')}</div>`).join('');
    log.scrollTop = log.scrollHeight;
  }

  function toggle(force) {
    open = typeof force === 'boolean' ? force : !open;
    hideBubble();
    const panel = root.querySelector('#sbPanel'), launch = root.querySelector('#sbLaunch');
    panel.hidden = !open;
    launch.setAttribute('aria-expanded', String(open));
    if (open) {
      if (!history.length) { history.push({ from: 'bot', key: 'sbGreet' }, { from: 'bot', key: 'sbGreet2' }); renderLog(); }
      root.querySelector('#sbInput').focus();
    } else launch.focus();
  }

  async function ask(question, forcedKey) {
    history.push({ from: 'me', text: question });
    renderLog();
    const log = root.querySelector('#sbLog');
    const typing = document.createElement('div');
    typing.className = 'sp-msg bot';
    typing.innerHTML = '<span class="sp-typing" aria-label="Scribbler is typing"><i></i><i></i><i></i></span>';
    log.appendChild(typing); log.scrollTop = log.scrollHeight;
    const reply = await answer(question, forcedKey);
    await new Promise(r => setTimeout(r, 450 + Math.random() * 400));
    history.push(reply);
    renderLog();
  }

  async function answer(q, forcedKey) {
    if (forcedKey) return { from: 'bot', key: forcedKey };
    if (HELLO.test(q.trim())) return { from: 'bot', key: 'ansHello' };
    if (THANKS.test(q)) return { from: 'bot', key: 'ansThanks' };
    for (const [re, key] of RULES) if (re.test(q)) return { from: 'bot', key };
    for (const [re, industry] of INDUSTRIES) {
      if (re.test(q)) {
        try {
          mentorsCache = mentorsCache || await window.MM.api('/public/mentors?limit=12');
          const list = mentorsCache.filter(m => m.industry === industry);
          if (list.length) {
            const items = list.map(m => `<br>• <a href="#" data-resume="${m.id}">${escHTML(m.name)}</a> — ${escHTML(m.headline)}`).join('');
            return { from: 'bot', key: 'ansMentorsIn', vars: { x: escHTML(industry) }, extra: items };
          }
        } catch { /* fall through */ }
        return { from: 'bot', key: 'ansFind' };
      }
    }
    if (FIND.test(q)) return { from: 'bot', key: 'ansFind' };
    return { from: 'bot', key: 'ansFallback' };
  }

  // ----- Greeting bubble (once per visit, can be turned off in Settings) -----
  let bubble;
  function showBubble() {
    let seen = false;
    try { seen = sessionStorage.getItem('sbGreeted') === '1'; } catch { /* ignore */ }
    if (seen || open || !P.get().scribblerTips) return;
    bubble = document.createElement('div');
    bubble.className = 'scribbler-bubble';
    bubble.setAttribute('role', 'status');
    bubble.innerHTML = `<button class="close" aria-label="Dismiss">&times;</button><strong>${t('sbName')}</strong>${escHTML(t('sbGreet'))}`;
    bubble.addEventListener('click', e => { if (e.target.closest('.close')) hideBubble(); else toggle(true); });
    document.body.appendChild(bubble);
    try { sessionStorage.setItem('sbGreeted', '1'); } catch { /* ignore */ }
  }
  function hideBubble() { if (bubble) { bubble.remove(); bubble = null; } }

  window.Scribbler = { refresh: () => { hideBubble(); build(); }, open: () => toggle(true) };
  build();
  setTimeout(showBubble, 1400);
})();
