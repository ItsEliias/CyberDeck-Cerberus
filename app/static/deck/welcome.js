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
  var EMOJI = ['🛡', '⚡', '🎯', '🧠', '🔭', '🐉', '🦊', '🦉', '👾', '💀'];
  var WORDMARK = '<div class="ob-wordmark" aria-hidden="true"><span class="ob-bracket">[</span><span class="ob-lead">C</span>YBERDECK<span class="ob-bracket">]</span></div>';

  function load() { try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch (e) { return {}; } }
  function save(p) { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {} }
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }

  // Reflect the saved profile into the sidebar user bar (name + avatar).
  function applyToSidebar(p) {
    var nameEl = document.querySelector('.user-bar-name');
    if (nameEl && p.name) nameEl.textContent = p.name;
    var st = document.querySelector('.sidebar-user-status');
    if (st && p.handle) st.innerHTML = '&#9679; @' + esc(p.handle);
    var av = document.getElementById('user-bar-avatar');
    if (av && p.avatar) {
      if (p.avatar.type === 'img') {
        av.style.backgroundImage = 'url(' + p.avatar.value + ')';
        av.style.backgroundSize = 'cover'; av.style.backgroundPosition = 'center';
        av.textContent = '';
      } else if (p.avatar.type === 'emoji') {
        av.textContent = p.avatar.value;
        av.style.display = 'flex'; av.style.alignItems = 'center';
        av.style.justifyContent = 'center'; av.style.fontSize = '16px';
      }
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
      '<div class="ob-actions"><button class="ob-btn ob-btn--primary" data-action="enter">[ ENTER ]</button></div>';
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
    var row = EMOJI.map(function (e) {
      var on = (S.avatar && S.avatar.type === 'emoji' && S.avatar.value === e) ? ' ob-emoji--active' : '';
      return '<button class="ob-emoji' + on + '" data-action="emoji" data-emoji="' + esc(e) + '">' + esc(e) + '</button>';
    }).join('');
    return '<div class="ob-tag">// OPERATOR SIGNATURE</div>' +
      '<p class="ob-lead-copy">Upload an image or pick an emoji.</p>' +
      '<div class="ob-avatar-preview" id="dw-preview">' + preview + '</div>' +
      '<div class="ob-field"><label class="ob-btn ob-btn--ghost" for="dw-file">Upload image</label>' +
      '<input class="ob-file" id="dw-file" type="file" accept="image/*" hidden></div>' +
      '<div class="ob-emoji-row">' + row + '</div>' +
      '<div class="ob-actions"><button class="ob-btn ob-btn--ghost" data-action="back">[ BACK ]</button>' +
      '<button class="ob-btn ob-btn--primary" data-action="next">[ NEXT ]</button></div>';
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
      if (a === 'emoji') el.addEventListener('click', function () { S.avatar = { type: 'emoji', value: el.dataset.emoji }; render(); });
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
    save(p);
    applyToSidebar(p);
    try { document.dispatchEvent(new CustomEvent('deck:onboarded', { detail: { profile: p } })); } catch (e) {}
    teardown();
  }

  function showOnboarding() { S = { step: 0, name: '', handle: '', focus: [], avatar: null }; mount(); render(); }

  // ── Boot ──────────────────────────────────────────────────────────────────────
  function boot() {
    var p = load();
    applyToSidebar(p);
    if (!p.onboarded) showOnboarding();
    else showLogin(p);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.DeckWelcome = { reset: function () { try { localStorage.removeItem(PROFILE_KEY); } catch (e) {} } };
})();
