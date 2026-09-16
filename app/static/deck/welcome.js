/**
 * welcome.js — CyberDeck first-run onboarding + a cosmetic login splash.
 *
 * Offline / single-user, so there's no server account. State lives in
 * localStorage ('deck-profile'). Reuses Cerberus's .ob-* overlay styling that
 * already ships in style.css, and the deck's own .deck-swatch theme chips.
 *
 *   First launch  → 5-step wizard (welcome, identity, focus, avatar, theme).
 *   Later launches → a wordmark splash ("Welcome back, <name>") + [ ENTER ].
 *
 * Theme apply/read is borrowed from window.DeckTheme (exposed by deck.js).
 */
(function () {
  var PROFILE_KEY = 'deck-profile';
  var FOCI = ['Offensive', 'Defensive', 'Web', 'Network', 'Cloud', 'Forensics', 'Malware', 'OSINT', 'Reversing', 'Certs'];
  var SOCIALS = [
    { key: 'github', label: 'GitHub', svg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 2A10 10 0 0 0 8.84 21.5c.5.08.66-.22.66-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.1-1.46-1.1-1.46-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.9.83.1-.65.35-1.08.64-1.33-2.22-.26-4.55-1.11-4.55-4.94 0-1.1.39-1.99 1.03-2.69-.1-.26-.45-1.28.1-2.66 0 0 .84-.27 2.75 1.03a9.4 9.4 0 0 1 5 0c1.9-1.3 2.74-1.03 2.74-1.03.56 1.38.21 2.4.11 2.66.64.7 1.03 1.59 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.16.57.67.48A10 10 0 0 0 12 2z"/></svg>' },
    { key: 'x', label: 'X', svg: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M18.9 2H22l-7.3 8.3L23 22h-6.6l-5.2-6.7L5.3 22H2.1l7.8-8.9L1.7 2h6.8l4.7 6.2L18.9 2zm-2.3 18h1.8L7.5 3.9H5.6L16.6 20z"/></svg>' },
    { key: 'linkedin', label: 'LinkedIn', svg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3V9zm6 0h3.8v1.7h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5.3c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8V21H9V9z"/></svg>' },
    { key: 'instagram', label: 'Instagram', svg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>' },
    { key: 'facebook', label: 'Facebook', svg: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z"/></svg>' }
  ];
  var WORDMARK = '<div class="ob-wordmark" aria-hidden="true"><span class="ob-bracket">[</span><span class="ob-lead">C</span>YBERDECK<span class="ob-bracket">]</span></div>';

  // Profile lives server-side (survives relaunch; the packaged webview does NOT persist
  // localStorage). localStorage is only a synchronous cache for getProfile() callers.
  function load() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch (e) { return {}; } }
  function saveLocal(p) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {} }
  function saveServer(p) {
    try { fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }); } catch (e) {}
  }
  function save(p) { saveLocal(p); saveServer(p); }
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }

  // Reflect the saved profile into the sidebar user bar (name + avatar).
  function applyToSidebar(p) {
    var nameEl = document.querySelector('.user-bar-name');
    if (nameEl && p.name) nameEl.textContent = p.name;
    var st = document.querySelector('.sidebar-user-status');
    if (st && p.handle) st.innerHTML = '&#9679; @' + esc(p.handle);
    var av = document.getElementById('user-bar-avatar');
    if (av && p.avatar && p.avatar.type === 'img') {
      av.style.backgroundImage = 'url(' + p.avatar.value + ')';
      av.style.backgroundSize = 'cover'; av.style.backgroundPosition = 'center';
      av.textContent = '';
    }
    // Social links → clickable icons in the user bar (open in the system browser
    // via deck.js's external-link interceptor).
    var col = nameEl ? nameEl.parentElement : null;
    if (col) {
      var socials = p.socials || {};
      var chosen = SOCIALS.filter(function (s) { return (socials[s.key] || '').trim(); });
      var row = col.querySelector('.ub-socials');
      if (!chosen.length) { if (row) row.remove(); return; }
      if (!row) { row = document.createElement('div'); row.className = 'ub-socials'; col.appendChild(row); }
      row.innerHTML = chosen.map(function (s) {
        return '<a class="ub-social" href="' + esc(socials[s.key].trim()) + '" title="' + s.label + '" target="_blank" rel="noopener">' + s.svg + '</a>';
      }).join('');
    }
  }

  // ── Overlay scaffold ─────────────────────────────────────────────────────────
  function mount() {
    var o = document.createElement('div');
    o.id = 'deck-welcome-overlay';
    o.className = 'ob-overlay';
    o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
    o.innerHTML = '<div class="ob-bg" aria-hidden="true"></div>' +
      '<div class="ob-card-wrap"><div class="ob-card" id="dw-card"></div>' +
      '<div class="ob-dots" id="dw-dots" aria-hidden="true"></div></div>';
    document.body.appendChild(o);
    return o;
  }
  function teardown() { var o = document.getElementById('deck-welcome-overlay'); if (o) o.remove(); }

  // ── Cosmetic login splash ────────────────────────────────────────────────────
  function showLogin(p) {
    var o = mount();
    var dots = o.querySelector('#dw-dots'); if (dots) dots.remove();
    o.querySelector('#dw-card').innerHTML = WORDMARK +
      '<div class="ob-tag">// OFFLINE STUDY HUB</div>' +
      (p.name ? '<p class="ob-lead-copy">Welcome back, ' + esc(p.name) + '.</p>'
              : '<p class="ob-lead-copy">Ready when you are.</p>') +
      '<div class="ob-actions"><button class="ob-btn ob-btn--primary" data-action="enter">[ ENTER ]</button></div>' +
      '<div class="ob-copyright">CyberDeck™ · © 2026 ItsEliias. All rights reserved.</div>';
    function enter() { document.removeEventListener('keydown', onKey); teardown(); }
    function onKey(e) { if (e.key === 'Enter') { e.preventDefault(); enter(); } }
    o.querySelector('[data-action="enter"]').addEventListener('click', enter);
    document.addEventListener('keydown', onKey);
    setTimeout(function () { var b = o.querySelector('button'); if (b) b.focus(); }, 0);
  }

  // ── Onboarding wizard ────────────────────────────────────────────────────────
  var S = { step: 0, name: '', handle: '', focus: [], avatar: null };
  var STEPS = 5;

  function render() {
    var o = document.getElementById('deck-welcome-overlay');
    var card = o.querySelector('#dw-card');
    card.innerHTML = [wWelcome, wIdentity, wFocus, wAvatar, wTheme][S.step]();
    wire(card);
    var dd = o.querySelector('#dw-dots'), h = '';
    for (var i = 0; i < STEPS; i++) h += '<span class="ob-dot' + (i === S.step ? ' ob-dot--active' : '') + '"></span>';
    dd.innerHTML = h;
    setTimeout(function () { var f = card.querySelector('input, button'); if (f) f.focus(); }, 0);
  }

  function wWelcome() {
    return WORDMARK +
      '<div class="ob-tag">// INITIALISING OPERATOR</div>' +
      '<p class="ob-lead-copy">Let’s set up your deck.</p>' +
      '<div class="ob-actions"><button class="ob-btn ob-btn--primary" data-action="next">[ BEGIN ]</button></div>';
  }
  function wIdentity() {
    return '<div class="ob-tag">// WHO ARE YOU?</div>' +
      '<div class="ob-field"><label class="ob-label" for="dw-name">Name</label>' +
      '<input class="ob-input" id="dw-name" autocomplete="off" placeholder="e.g. Eliias" maxlength="64" value="' + esc(S.name) + '"></div>' +
      '<div class="ob-field"><label class="ob-label" for="dw-handle">Handle</label>' +
      '<input class="ob-input" id="dw-handle" autocomplete="off" placeholder="e.g. r00t" maxlength="32" value="' + esc(S.handle) + '"></div>' +
      '<div class="ob-actions"><button class="ob-btn ob-btn--ghost" data-action="back">[ BACK ]</button>' +
      '<button class="ob-btn ob-btn--primary" data-action="next">[ NEXT ]</button></div>';
  }
  function wFocus() {
    var chips = S.focus.map(function (i) {
      return '<span class="ob-chip" data-interest="' + esc(i) + '">' + esc(i) +
        '<button class="ob-chip-x" data-action="remove" data-interest="' + esc(i) + '" title="Remove">×</button></span>';
    }).join('');
    var sugg = FOCI.filter(function (s) { return S.focus.indexOf(s) < 0; }).map(function (s) {
      return '<button class="ob-sugg" data-action="add" data-interest="' + esc(s) + '">' + esc(s) + '</button>';
    }).join('');
    return '<div class="ob-tag">// YOUR FOCUS</div>' +
      '<div class="ob-chip-row" id="dw-chips">' + chips + '</div>' +
      '<div class="ob-field"><input class="ob-input" id="dw-focus-input" autocomplete="off" placeholder="Type a focus area, Enter to add" maxlength="32"></div>' +
      '<div class="ob-sugg-row">' + sugg + '</div>' +
      '<div class="ob-actions"><button class="ob-btn ob-btn--ghost" data-action="back">[ BACK ]</button>' +
      '<button class="ob-btn ob-btn--primary" data-action="next">[ NEXT ]</button></div>';
  }
  function wAvatar() {
    var preview = (S.avatar && S.avatar.type === 'img')
      ? '<img src="' + esc(S.avatar.value) + '" alt="Avatar preview">'
      : '<span class="ob-avatar-emoji">' + esc((S.avatar && S.avatar.type === 'emoji') ? S.avatar.value : '◆') + '</span>';
    return '<div class="ob-tag">// OPERATOR SIGNATURE</div>' +
      '<p class="ob-lead-copy">Upload your own logo or photo — or skip.</p>' +
      '<div class="ob-avatar-preview" id="dw-preview">' + preview + '</div>' +
      '<div class="ob-field"><label class="ob-btn ob-btn--ghost" for="dw-file">Upload image</label>' +
      '<input class="ob-file" id="dw-file" type="file" accept="image/*" hidden>' +
      (S.avatar ? '<button class="ob-btn ob-btn--ghost" data-action="clear-av" style="margin-left:8px;">Remove</button>' : '') + '</div>' +
      '<div class="ob-actions"><button class="ob-btn ob-btn--ghost" data-action="back">[ BACK ]</button>' +
      '<button class="ob-btn ob-btn--primary" data-action="next">' + (S.avatar ? '[ NEXT ]' : '[ SKIP ]') + '</button></div>';
  }
  function wTheme() {
    var T = (window.DeckTheme && window.DeckTheme.THEMES) || {};
    var cur = (window.DeckTheme && window.DeckTheme.current && window.DeckTheme.current()) || '';
    var sw = Object.keys(T).map(function (name) {
      var c = T[name], on = name === cur ? ' deck-swatch--on' : '';
      return '<button class="deck-swatch' + on + '" data-action="theme" data-theme="' + name + '" title="' + name + '">' +
        '<span class="deck-swatch-chip" style="background:' + c.bg + ';border-color:' + c.border + ';">' +
        '<span style="background:' + c.red + '"></span><span style="background:' + c.fg + '"></span>' +
        '<span style="background:' + c.panel + '"></span></span>' +
        '<span class="deck-swatch-name">' + name + '</span></button>';
    }).join('');
    return '<div class="ob-tag">// PICK YOUR PALETTE</div>' +
      '<div class="deck-swatches dw-themes">' + sw + '</div>' +
      '<div class="ob-actions"><button class="ob-btn ob-btn--ghost" data-action="back">[ BACK ]</button>' +
      '<button class="ob-btn ob-btn--primary" data-action="complete">[ COMPLETE SETUP ]</button></div>';
  }

  function commitInputs() {
    var o = document.getElementById('deck-welcome-overlay');
    if (S.step === 1) {
      S.name = (o.querySelector('#dw-name') || {}).value ? o.querySelector('#dw-name').value.trim() : S.name;
      S.handle = (o.querySelector('#dw-handle') || {}).value ? o.querySelector('#dw-handle').value.trim() : S.handle;
    }
  }
  function addFocus(v) {
    v = (v || '').trim().slice(0, 32);
    if (!v || S.focus.indexOf(v) >= 0 || S.focus.length >= 8) return;
    S.focus.push(v); render();
  }

  function wire(card) {
    card.querySelectorAll('[data-action]').forEach(function (el) {
      var a = el.dataset.action;
      if (a === 'next') el.addEventListener('click', function () { commitInputs(); if (S.step < STEPS - 1) { S.step++; render(); } });
      if (a === 'back') el.addEventListener('click', function () { commitInputs(); if (S.step > 0) { S.step--; render(); } });
      if (a === 'complete') el.addEventListener('click', complete);
      if (a === 'add') el.addEventListener('click', function () { addFocus(el.dataset.interest); });
      if (a === 'remove') el.addEventListener('click', function () { S.focus = S.focus.filter(function (x) { return x !== el.dataset.interest; }); render(); });
      if (a === 'clear-av') el.addEventListener('click', function () { S.avatar = null; render(); });
      if (a === 'theme') el.addEventListener('click', function () {
        if (window.DeckTheme && window.DeckTheme.apply) window.DeckTheme.apply(el.dataset.theme);
        render();
      });
    });
    var fi = card.querySelector('#dw-focus-input');
    if (fi) fi.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addFocus(fi.value); fi.value = ''; } });
    var file = card.querySelector('#dw-file');
    if (file) file.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () { S.avatar = { type: 'img', value: String(r.result || '') }; render(); };
      r.readAsDataURL(f);
    });
  }

  function complete() {
    var p = load();
    p.onboarded = true; p.name = S.name; p.handle = S.handle; p.focus = S.focus;
    if (S.avatar) p.avatar = S.avatar;
    if (window.DeckTheme && window.DeckTheme.current) { try { p.theme = window.DeckTheme.current(); } catch (e) {} }
    save(p);
    applyToSidebar(p);
    try { document.dispatchEvent(new CustomEvent('deck:onboarded', { detail: { profile: p } })); } catch (e) {}
    teardown();
  }

  function showOnboarding() { S = { step: 0, name: '', handle: '', focus: [], avatar: null }; mount(); render(); }

  // ── Boot ──────────────────────────────────────────────────────────────────────
  function proceed(p) {
    applyToSidebar(p);
    // Re-apply the saved theme (also not reliably persisted by the packaged webview).
    if (p.theme && window.DeckTheme && window.DeckTheme.apply) {
      try { window.DeckTheme.apply(p.theme); } catch (e) {}
    }
    if (!p.onboarded) showOnboarding();
    else showLogin(p);
  }

  function boot() {
    // Server profile is the source of truth; prime the local cache from it, then decide.
    fetch('/api/profile').then(function (r) { return r.json(); }).then(function (d) {
      var sp = (d && d.profile) || {};
      if (sp && Object.keys(sp).length) saveLocal(sp);
      proceed(load());
    }).catch(function () { proceed(load()); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.DeckWelcome = {
    reset: function () {
      try { localStorage.removeItem(PROFILE_KEY); } catch (e) {}
      saveServer({ onboarded: false });   // clear the persisted flag too
    },
    getProfile: load,
    setProfile: function (p) { save(p); applyToSidebar(p); },
    applyToSidebar: applyToSidebar,
    SOCIALS: SOCIALS
  };
})();
