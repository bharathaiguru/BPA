/* prefs.js — loads the visitor's saved display settings and applies them to <html>
   before the page paints. Settings are saved on this device (localStorage). */
(function () {
  'use strict';
  var KEY = 'mm-prefs';
  var DEFAULTS = {
    lang: 'en',            // en | es | zh | hi
    theme: 'classic',      // classic | ocean | dark | contrast
    text: 'md',            // sm | md | lg | xl
    buttons: 'standard',   // standard | large
    spacing: 'comfortable',// comfortable | compact
    font: 'default',       // default | hyperlegible | dyslexic
    lines: 'normal',       // normal | relaxed
    links: 'auto',         // auto | underline
    focus: 'normal',       // normal | strong
    motion: 'auto',        // auto | reduce
    notifySessions: true,
    notifyRequests: true,
    notifyReviews: true,
    scribblerTips: true
  };

  function load() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
    var out = {};
    for (var k in DEFAULTS) out[k] = (k in saved) ? saved[k] : DEFAULTS[k];
    return out;
  }
  function save(prefs) {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); return true; } catch (e) { return false; }
  }
  function apply(p) {
    var h = document.documentElement;
    var attrs = ['theme', 'text', 'buttons', 'spacing', 'font', 'lines', 'links', 'focus', 'motion'];
    attrs.forEach(function (a) { h.setAttribute('data-' + a, p[a]); });
    h.setAttribute('lang', p.lang === 'zh' ? 'zh-Hans' : p.lang);
  }

  var current = load();
  apply(current);
  window.MMPrefs = { DEFAULTS: DEFAULTS, get: function () { return current; },
    set: function (patch) { for (var k in patch) current[k] = patch[k]; apply(current); return save(current); },
    reset: function () { current = JSON.parse(JSON.stringify(DEFAULTS)); apply(current); return save(current); } };
})();
