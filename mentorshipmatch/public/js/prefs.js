/* prefs.js — loads display settings and applies them to <html> before the page paints.
   Settings are saved on this device only (localStorage). */
(function () {
  'use strict';
  var KEY = 'mm-prefs';
  var DEFAULTS = {
    lang: 'en',            // en | es | zh | hi
    theme: 'classic',      // classic | ocean | dark | contrast
    text: 'md',            // sm | md | lg | xl
    targets: 'standard',   // standard | large  (button & touch-target size)
    spacing: 'comfortable',// comfortable | compact
    font: 'default',       // default | hyperlegible | dyslexic
    lines: 'normal',       // normal | relaxed
    links: 'auto',         // auto | underline
    focus: 'normal',       // normal | strong
    motion: 'auto'         // auto | reduce   (the OS "reduce motion" setting is always respected too)
  };
  function load() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
    if (saved.buttons && !saved.targets) saved.targets = saved.buttons; // migrate v2 setting name
    var out = {};
    for (var k in DEFAULTS) out[k] = (k in saved) ? saved[k] : DEFAULTS[k];
    return out;
  }
  function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); return true; } catch (e) { return false; } }
  function apply(p) {
    var h = document.documentElement;
    ['theme', 'text', 'targets', 'spacing', 'font', 'lines', 'links', 'focus', 'motion'].forEach(function (a) { h.setAttribute('data-' + a, p[a]); });
  }
  var current = load();
  apply(current);
  window.MMPrefs = {
    DEFAULTS: DEFAULTS,
    get: function () { return current; },
    set: function (patch) { for (var k in patch) current[k] = patch[k]; apply(current); return save(current); },
    reset: function () { current = JSON.parse(JSON.stringify(DEFAULTS)); apply(current); return save(current); }
  };
})();
