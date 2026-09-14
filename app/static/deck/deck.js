/*
 * CyberDeck shell — P1.
 * Owns: icon-rail + sidebar nav, routing between module views, and theme switching
 * (Cerberus's `cerberus-theme` localStorage model). Module views are stubs until P2/P3
 * wire real Flask blueprints. No dependency on Cerberus's coupled SPA JS — the look comes
 * from the copied CSS + class names, the behaviour is fresh here.
 */
(function () {
  'use strict';

  // Modules can register a custom renderer: window.DeckViews[id](rootEl).
  window.DeckViews = window.DeckViews || {};

  // ── Icons (lucide-style, 24x24 stroke) ──────────────────────────────────────
  var I = {
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    courses: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    knowledge: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    playbooks: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/>',
    flashcards: '<rect x="3" y="6" width="14" height="11" rx="2"/><path d="M7 6V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1"/>',
    progress: '<line x1="3" y1="21" x2="21" y2="21"/><rect x="5" y="12" width="3" height="7"/><rect x="10" y="7" width="3" height="12"/><rect x="15" y="10" width="3" height="9"/>',
    netlab: '<rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4M12 12H5v4M12 12h7v4"/>',
    targets: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    board: '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="3" height="8"/><rect x="14" y="7" width="3" height="5"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/>',
    sessions: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    topology: '<circle cx="5" cy="6" r="3"/><circle cx="19" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><path d="M7.5 7.5l3 8M16.5 7.5l-3 8M8 6h8"/>',
    reports: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
    credentials: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    feeds: '<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
    snippets: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="13" y1="4" x2="11" y2="20"/>',
    terminal: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 9l3 3-3 3"/><line x1="12" y1="15" x2="16" y2="15"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>'
  };
  function svg(key, size) {
    size = size || 16;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (I[key] || '') + '</svg>';
  }

  // ── Modules (mirrors app.py MODULES) ────────────────────────────────────────
  var MODULES = [
    { id: 'home', label: 'Home', blurb: 'What to study next' },
    { id: 'courses', label: 'Courses', blurb: 'Structured study' },
    { id: 'knowledge', label: 'Knowledge', blurb: 'Your vault, Obsidian-style' },
    { id: 'playbooks', label: 'Playbooks', blurb: 'Repeatable procedures' },
    { id: 'flashcards', label: 'Flashcards', blurb: 'Spaced-repetition review' },
    { id: 'progress', label: 'Progress', blurb: 'Streaks + activity heatmap' },
    { id: 'netlab', label: 'NetLab', blurb: 'Network tools' },
    { id: 'targets', label: 'Targets', blurb: 'Engagement targets + findings' },
    { id: 'board', label: 'Attack Board', blurb: 'Kanban of attack progress' },
    { id: 'scan', label: 'Scan Import', blurb: 'Parse nmap/gobuster → targets' },
    { id: 'sessions', label: 'Sessions', blurb: 'CTF/box tracker + timer' },
    { id: 'topology', label: 'Topology', blurb: 'Host graph' },
    { id: 'reports', label: 'Reports', blurb: 'Draft + export' },
    { id: 'credentials', label: 'Credentials', blurb: 'Encrypted vault' },
    { id: 'snippets', label: 'Snippets', blurb: 'Payloads + commands' },
    { id: 'feeds', label: 'Feeds', blurb: 'Security news' },
    { id: 'terminal', label: 'Terminal', blurb: 'Shell' }
  ];

  // ── Themes: Cerberus's 22 palettes (verbatim from theme.js). ─────────────────
  var THEMES = {
    dark: { bg: '#1a1d23', fg: '#c5c9d0', panel: '#111111', border: '#3a2a2a', red: '#c0392b' },
    light: { bg: '#f0ebe3', fg: '#5a5248', panel: '#faf6f0', border: '#d4cdc2', red: '#c47d5a' },
    midnight: { bg: '#0d1117', fg: '#c9d1d9', panel: '#161b22', border: '#30363d', red: '#f85149' },
    paper: { bg: '#faf8f5', fg: '#3b3836', panel: '#ffffff', border: '#d5d0c8', red: '#c5ac4a' },
    cyberpunk: { bg: '#0a0a0f', fg: '#0ff0fc', panel: '#12101a', border: '#9b30ff', red: '#e040fb' },
    retrowave: { bg: '#1a1a2e', fg: '#e94560', panel: '#16213e', border: '#533483', red: '#e94560' },
    forest: { bg: '#1b2a1b', fg: '#a8d5a2', panel: '#142414', border: '#3d6b3d', red: '#7cb871' },
    ocean: { bg: '#0b1a2c', fg: '#64d2ff', panel: '#091422', border: '#1e5074', red: '#4facfe' },
    ume: { bg: '#2b1b2e', fg: '#f5c2e7', panel: '#1e1420', border: '#6c4675', red: '#f5a0c0' },
    copper: { bg: '#1c1410', fg: '#e8c39e', panel: '#140f0a', border: '#7a5533', red: '#d4764e' },
    terminal: { bg: '#000000', fg: '#00ff41', panel: '#0a0a0a', border: '#003b00', red: '#00ff41' },
    organs: { bg: '#0a0406', fg: '#efe1c8', panel: '#15080a', border: '#3a1519', red: '#c83240' },
    lavender: { bg: '#f3eef8', fg: '#3d3551', panel: '#faf7ff', border: '#cec3de', red: '#9b6dcc' },
    gpt: { bg: '#212121', fg: '#ececec', panel: '#171717', border: '#424242', red: '#949494' },
    claude: { bg: '#262624', fg: '#f5f4f0', panel: '#30302e', border: '#4a4a47', red: '#c6613f' },
    cute: { bg: '#fff0f5', fg: '#d4608a', panel: '#fff8fa', border: '#f0c0d0', red: '#ff6b9d' },
    ember: { bg: '#0f0805', fg: '#f0a060', panel: '#1a1008', border: '#4a2510', red: '#e05020' },
    abyss: { bg: '#020408', fg: '#6090b0', panel: '#050810', border: '#102030', red: '#3070a0' },
    sentinel: { bg: '#080c08', fg: '#80c080', panel: '#0a100a', border: '#204020', red: '#40a040' },
    void: { bg: '#050507', fg: '#9090b0', panel: '#090910', border: '#1a1a30', red: '#7070c0' },
    'neon-noir': { bg: '#080510', fg: '#ff80d0', panel: '#0d0818', border: '#301030', red: '#d040a0' },
    slate: { bg: '#1a1e26', fg: '#a0b0c0', panel: '#141820', border: '#303848', red: '#5080b0' }
  };
  var THEME_KEY = 'cerberus-theme';

  function applyTheme(name) {
    var c = THEMES[name];
    if (!c) return;
    var s = document.documentElement.style;
    s.setProperty('--bg', c.bg); s.setProperty('--fg', c.fg);
    s.setProperty('--panel', c.panel); s.setProperty('--border', c.border);
    s.setProperty('--red', c.red); s.setProperty('--brand-color', c.red);
    var mtc = document.querySelector('meta[name="theme-color"]');
    if (mtc) mtc.setAttribute('content', c.bg);
    try { localStorage.setItem(THEME_KEY, JSON.stringify({ name: name, colors: c })); } catch (e) {}
  }
  function currentTheme() {
    try { var t = JSON.parse(localStorage.getItem(THEME_KEY)); return (t && t.name) || 'dark'; } catch (e) { return 'dark'; }
  }

  // ── Preferences (font / density / accent / layout / motion) ────────────────────
  // Ported from Cerberus's appearance settings, trimmed to what fits an offline
  // study hub. Each persists per machine and applies live on top of the theme.
  var PREFS = {
    font:    { key: 'deck-font',    def: 'mono' },
    density: { key: 'deck-density', def: 'comfortable' },
    accent:  { key: 'deck-accent',  def: '' },
    side:    { key: 'deck-side',    def: 'left' },
    frost:   { key: 'deck-frost',   def: '1' },
    motion:  { key: 'deck-motion',  def: '0' }
  };
  var FONTS = {
    mono:  "'Fira Code', 'JetBrains Mono', ui-monospace, monospace",
    sans:  "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    serif: "Georgia, 'Times New Roman', Cambria, serif"
  };
  function getPref(name) {
    try { var v = localStorage.getItem(PREFS[name].key); return v == null ? PREFS[name].def : v; }
    catch (e) { return PREFS[name].def; }
  }
  function setPref(name, val) { try { localStorage.setItem(PREFS[name].key, val); } catch (e) {} }
  function applyPrefs() {
    var root = document.documentElement, body = document.body;
    root.style.setProperty('--font-family', FONTS[getPref('font')] || FONTS.mono);
    root.classList.remove('density-compact', 'density-comfortable', 'density-spacious');
    root.classList.add('density-' + getPref('density'));
    var acc = getPref('accent');
    if (acc) { root.style.setProperty('--red', acc); root.style.setProperty('--brand-color', acc); }
    body.classList.toggle('deck-side-right', getPref('side') === 'right');
    body.classList.toggle('deck-no-frost', getPref('frost') !== '1');
    body.classList.toggle('deck-reduce-motion', getPref('motion') === '1');
  }
  // Re-assert the palette then re-layer prefs — used after a theme change or an
  // accent reset, both of which rewrite --red/--brand-color from the theme.
  function refreshTheme() { applyTheme(currentTheme()); applyPrefs(); }

  // ── Rendering ────────────────────────────────────────────────────────────────
  var state = { active: 'home' };

  function renderRail() {
    var rail = document.getElementById('icon-rail');
    var html = '<button class="rail-toggle" id="rail-toggle" title="Collapse sidebar" aria-label="Toggle sidebar" aria-expanded="true">' + svg('panel') + '</button>' +
      '<button class="icon-rail-btn" data-nav="home" title="Home">' + svg('home') + '</button>' +
      '<div class="rail-separator"></div>';
    MODULES.filter(function (m) { return m.id !== 'home'; }).forEach(function (m) {
      html += '<button class="icon-rail-btn" data-nav="' + m.id + '" title="' + m.label + '">' + svg(m.id) + '</button>';
    });
    html += '<div style="flex:1"></div>' +
      '<button class="icon-rail-btn" data-nav="settings" title="Settings">' + svg('settings') + '</button>';
    rail.innerHTML = html;
  }

  function renderSidebar() {
    var inner = document.getElementById('sidebar-inner');
    var html = '<div class="section"><div class="section-header-flex"><span class="section-title">Study</span></div>';
    ['home', 'courses', 'knowledge', 'playbooks', 'flashcards', 'progress'].forEach(function (id) { html += navItem(id); });
    html += '</div><div class="section"><div class="section-header-flex"><span class="section-title">Engagement</span></div>';
    ['sessions', 'netlab', 'targets', 'board', 'scan', 'topology', 'reports', 'credentials'].forEach(function (id) { html += navItem(id); });
    html += '</div><div class="section"><div class="section-header-flex"><span class="section-title">Feeds &amp; tools</span></div>';
    ['snippets', 'feeds', 'terminal'].forEach(function (id) { html += navItem(id); });
    html += '</div>';
    inner.innerHTML = html;
  }
  function navItem(id) {
    var m = MODULES.filter(function (x) { return x.id === id; })[0];
    if (!m) return '';
    return '<div class="list-item" data-nav="' + id + '"><span class="sidebar-action-icon" style="opacity:.6;">' +
      svg(id, 15) + '</span><span class="grow">' + m.label + '</span></div>';
  }

  function moduleView(id) {
    if (id === 'settings') return settingsView();
    if (window.DeckViews[id]) return '<div id="deck-module-root" class="deck-module-root"></div>';
    var m = MODULES.filter(function (x) { return x.id === id; })[0] || { label: id, blurb: '' };
    return '<div class="deck-panel">' +
      '<div class="deck-panel-title">' + svg(id, 18) + '<span>' + m.label + '</span></div>' +
      '<p class="deck-muted">' + m.blurb + '</p>' +
      '<p class="deck-stub">// module scaffold — backend lands in P2. This panel proves the ' +
      'Cerberus shell + theming works around CyberDeck\'s nav.</p>' +
      '</div>';
  }

  function settingsView() {
    var cur = currentTheme();
    var swatches = Object.keys(THEMES).map(function (name) {
      var c = THEMES[name];
      var on = name === cur ? ' deck-swatch--on' : '';
      return '<button class="deck-swatch' + on + '" data-theme="' + name + '" title="' + name + '">' +
        '<span class="deck-swatch-chip" style="background:' + c.bg + ';border-color:' + c.border + ';">' +
        '<span style="background:' + c.red + '"></span><span style="background:' + c.fg + '"></span>' +
        '<span style="background:' + c.panel + '"></span></span>' +
        '<span class="deck-swatch-name">' + name + '</span></button>';
    }).join('');
    return '<div class="deck-panel"><div class="deck-panel-title">' + svg('settings', 18) + '<span>Theme</span></div>' +
        '<p class="deck-muted">Cerberus\'s 22 palettes. Click to apply — saved on this machine.</p>' +
        '<div class="deck-swatches">' + swatches + '</div></div>' +
      '<div class="deck-panel"><div class="deck-panel-title">' + svg('panel', 18) + '<span>Appearance</span></div>' +
        setRow('Accent', 'Recolours the accent on top of the current theme.',
          '<input type="color" class="deck-color" id="deck-accent-input" value="' + (getPref('accent') || '#c0392b') + '">' +
          '<button class="co-btn" id="deck-accent-reset">Reset</button>') +
        setRow('Font', 'Applies across the whole app.',
          seg('font', getPref('font'), [{ v: 'mono', l: 'Mono' }, { v: 'sans', l: 'Sans' }, { v: 'serif', l: 'Serif' }])) +
        setRow('Density', 'Spacing of lists, cards and headers.',
          seg('density', getPref('density'), [{ v: 'compact', l: 'Compact' }, { v: 'comfortable', l: 'Comfortable' }, { v: 'spacious', l: 'Spacious' }])) +
      '</div>' +
      '<div class="deck-panel"><div class="deck-panel-title">' + svg('board', 18) + '<span>Layout &amp; motion</span></div>' +
        setRow('Sidebar side', 'Which edge the nav sits on.',
          seg('side', getPref('side'), [{ v: 'left', l: 'Left' }, { v: 'right', l: 'Right' }])) +
        setRow('Frosted glass', 'Blur behind the sidebar and panels.', toggle('frost', getPref('frost') === '1')) +
        setRow('Reduce motion', 'Minimise animations and transitions.', toggle('motion', getPref('motion') === '1')) +
      '</div>';
  }

  // Settings control builders (segmented buttons, labelled rows, switches).
  function seg(name, cur, opts) {
    return '<div class="deck-seg" role="group">' + opts.map(function (o) {
      return '<button class="deck-seg-btn' + (o.v === cur ? ' deck-seg-btn--on' : '') +
        '" data-set="' + name + '" data-val="' + o.v + '">' + o.l + '</button>';
    }).join('') + '</div>';
  }
  function setRow(label, hint, control) {
    return '<div class="deck-set-row"><div class="deck-set-meta"><span class="deck-set-label">' + label + '</span>' +
      (hint ? '<span class="deck-set-hint">' + hint + '</span>' : '') + '</div>' +
      '<div class="deck-set-control">' + control + '</div></div>';
  }
  function toggle(name, on) {
    return '<button class="deck-toggle' + (on ? ' deck-toggle--on' : '') + '" data-toggle="' + name +
      '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"><span class="deck-toggle-knob"></span></button>';
  }

  function route(id) {
    state.active = id;
    document.getElementById('deck-view').innerHTML = moduleView(id);
    var title = id === 'settings' ? 'Settings' : (MODULES.filter(function (m) { return m.id === id; })[0] || {}).label || id;
    document.getElementById('deck-title').textContent = title;
    // active states
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav]'), function (el) {
      el.classList.toggle('active', el.getAttribute('data-nav') === id);
    });
    if (window.DeckViews[id]) window.DeckViews[id](document.getElementById('deck-module-root'));
    if (id === 'settings') wireSettings();
  }

  function wireSettings() {
    var root = document.getElementById('deck-view');
    // Theme swatches — re-layer prefs so an accent override survives the switch.
    Array.prototype.forEach.call(root.querySelectorAll('[data-theme]'), function (btn) {
      btn.addEventListener('click', function () { applyTheme(btn.getAttribute('data-theme')); applyPrefs(); route('settings'); });
    });
    // Segmented prefs (font / density / side).
    Array.prototype.forEach.call(root.querySelectorAll('[data-set]'), function (btn) {
      btn.addEventListener('click', function () {
        setPref(btn.getAttribute('data-set'), btn.getAttribute('data-val'));
        applyPrefs(); route('settings');
      });
    });
    // Switches (frosted / reduce motion).
    Array.prototype.forEach.call(root.querySelectorAll('[data-toggle]'), function (btn) {
      btn.addEventListener('click', function () {
        var n = btn.getAttribute('data-toggle');
        setPref(n, getPref(n) === '1' ? '0' : '1');
        applyPrefs(); route('settings');
      });
    });
    // Accent picker: live while dragging, no re-render (keeps the picker open).
    var ai = root.querySelector('#deck-accent-input');
    if (ai) ai.addEventListener('input', function () { setPref('accent', ai.value); applyPrefs(); });
    var ar = root.querySelector('#deck-accent-reset');
    if (ar) ar.addEventListener('click', function () { setPref('accent', ''); refreshTheme(); route('settings'); });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────────
  function boot() {
    if (!THEMES[currentTheme()]) applyTheme('dark');
    else applyTheme(currentTheme());
    applyPrefs();
    renderRail();
    renderSidebar();
    // Sidebar collapse — nav still works via the always-visible icon rail.
    // State persists per machine; restored before first paint of the nav.
    var SIDEBAR_KEY = 'deck-sidebar-collapsed';
    function setCollapsed(on, persist) {
      var sb = document.getElementById('sidebar');
      var tog = document.getElementById('rail-toggle');
      sb.classList.toggle('hidden', on);
      if (tog) {
        tog.classList.toggle('active', on);
        tog.setAttribute('aria-expanded', on ? 'false' : 'true');
        tog.setAttribute('title', on ? 'Expand sidebar' : 'Collapse sidebar');
      }
      if (persist) { try { localStorage.setItem(SIDEBAR_KEY, on ? '1' : '0'); } catch (e) {} }
    }
    var startCollapsed = false;
    try { startCollapsed = localStorage.getItem(SIDEBAR_KEY) === '1'; } catch (e) {}
    if (startCollapsed) setCollapsed(true, false);
    document.getElementById('rail-toggle').addEventListener('click', function () {
      setCollapsed(!document.getElementById('sidebar').classList.contains('hidden'), true);
    });
    document.body.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-nav]') : null;
      if (t) route(t.getAttribute('data-nav'));
    });
    document.getElementById('sidebar-brand-btn').addEventListener('click', function () { route('home'); });
    document.getElementById('btn-settings').addEventListener('click', function () { route('settings'); });
    var pill = document.getElementById('deck-search-pill');
    if (pill) pill.addEventListener('click', function () { if (window.DeckCmd) DeckCmd.open(); });
    route('home');
  }
  // Minimal theme API for the onboarding wizard (welcome.js) to reuse.
  window.DeckTheme = { THEMES: THEMES, apply: applyTheme, current: currentTheme };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
