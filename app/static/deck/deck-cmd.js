/*
 * Command palette — Ctrl/Cmd+K. Jump to any module or search notes, targets, findings,
 * playbooks, snippets, courses (via /api/search). Arrow keys + Enter; Esc closes.
 */
(function () {
  'use strict';
  var overlay = null, sel = 0, rows = [], timer = null;
  function esc(s) { return (window.Deck ? Deck.esc : String)(s == null ? '' : s); }

  function navList() {
    return Array.prototype.map.call(document.querySelectorAll('#sidebar-inner [data-nav]'), function (el) {
      return { type: 'go', title: el.querySelector('.grow') ? el.querySelector('.grow').textContent : el.textContent.trim(), sub: 'module', nav: el.getAttribute('data-nav') };
    });
  }

  function open() {
    overlay = document.createElement('div');
    overlay.className = 'deck-cmd-overlay';
    overlay.innerHTML = '<div class="deck-cmd"><input class="deck-cmd-input" id="dc-q" placeholder="Jump to a module, or search notes, targets, snippets…" autocomplete="off"><div class="deck-cmd-results" id="dc-res"></div>' +
      '<div class="deck-cmd-foot"><span>&#8593;&#8595; navigate</span><span>&#8629; open</span><span>esc close</span></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    var q = overlay.querySelector('#dc-q');
    q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { run(q.value.trim()); }, 130); });
    q.addEventListener('keydown', onKey);
    render(navList());
    setTimeout(function () { q.focus(); }, 20);
  }

  function close() { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); overlay = null; }

  function run(query) {
    var nav = navList().filter(function (n) { return !query || n.title.toLowerCase().indexOf(query.toLowerCase()) >= 0; });
    if (query.length < 2) { render(nav); return; }
    fetch('/api/search?q=' + encodeURIComponent(query)).then(function (r) { return r.json(); }).then(function (d) {
      render(nav.concat(d.results || []));
    });
  }

  var TYPEBADGE = { go: 'GO', note: 'NOTE', target: 'TGT', finding: 'FIND', playbook: 'PLAY', snippet: 'SNIP', course: 'CRS' };
  function render(list) {
    rows = list; sel = 0;
    var res = overlay.querySelector('#dc-res');
    if (!list.length) { res.innerHTML = '<div class="deck-cmd-empty">No matches.</div>'; return; }
    res.innerHTML = list.map(function (r, i) {
      return '<div class="deck-cmd-row' + (i === 0 ? ' sel' : '') + '" data-i="' + i + '">' +
        '<span class="deck-cmd-badge">' + (TYPEBADGE[r.type] || '?') + '</span>' +
        '<span class="deck-cmd-title">' + esc(r.title) + '</span>' +
        '<span class="deck-cmd-sub">' + esc(r.sub || '') + '</span></div>';
    }).join('');
    res.querySelectorAll('.deck-cmd-row').forEach(function (el) {
      el.addEventListener('click', function () { activate(parseInt(el.getAttribute('data-i'), 10)); });
      el.addEventListener('mousemove', function () { move(parseInt(el.getAttribute('data-i'), 10)); });
    });
  }

  function move(i) {
    if (i < 0 || i >= rows.length) return;
    sel = i;
    overlay.querySelectorAll('.deck-cmd-row').forEach(function (el, j) { el.classList.toggle('sel', j === i); });
    var el = overlay.querySelectorAll('.deck-cmd-row')[i];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(Math.min(sel + 1, rows.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(Math.max(sel - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); activate(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  function activate(i) {
    var r = rows[i]; if (!r) return;
    if (r.type === 'note' && r.path) window.__deckPendingNote = r.path;
    var el = document.querySelector('#sidebar-inner [data-nav="' + r.nav + '"]') || document.querySelector('[data-nav="' + r.nav + '"]');
    close();
    if (el) el.click();
  }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      overlay ? close() : open();
    }
  });

  window.DeckCmd = { open: function () { if (!overlay) open(); }, close: close };
})();
