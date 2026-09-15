/*
 * Cheat Sheets view — build your own markdown quick-refs, off /api/cheatsheets.
 * Editable title + body; copy to clipboard; insert a saved snippet.
 */
(function () {
  'use strict';
  var root = null;
  function esc(s) { return (window.Deck ? Deck.esc : String)(s == null ? '' : s); }
  function get(u) { return fetch(u).then(function (r) { return r.json(); }); }
  function post(u, b) { return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(function (r) { return r.json(); }); }
  function del(u) { return fetch(u, { method: 'DELETE' }).then(function (r) { return r.json(); }); }

  function view(el) { root = el; list(); }

  function list() {
    root.innerHTML = '<div class="co-head"><span class="co-title">Cheat Sheets</span><button class="co-btn co-btn--primary" id="cs-new">+ New</button></div><div class="co-body" id="cs-body"><div class="kb-loading">Loading…</div></div>';
    root.querySelector('#cs-new').addEventListener('click', function () { editor(null); });
    get('/api/cheatsheets/list').then(function (d) {
      var b = root.querySelector('#cs-body'), sheets = d.sheets || [];
      if (!sheets.length) { b.innerHTML = '<div class="co-empty">No cheat sheets yet. Make one to keep your go-to commands + notes in a single quick-ref.</div>'; return; }
      b.innerHTML = '<div class="co-grid">' + sheets.map(function (s) { return '<button class="co-card" data-sheet="' + esc(s.id) + '"><div class="co-card-title">' + esc(s.title) + '</div><div class="co-card-meta">' + esc((s.updated || '').slice(0, 10)) + '</div></button>'; }).join('') + '</div>';
      Array.prototype.forEach.call(b.querySelectorAll('[data-sheet]'), function (el) { el.addEventListener('click', function () { editor(el.getAttribute('data-sheet')); }); });
    });
  }

  function editor(sid) {
    function render(sheet) {
      root.innerHTML = '<div class="co-head"><button class="co-btn" id="cs-back">← Sheets</button>' +
        '<input id="cs-title" class="co-input" style="margin-left:10px;max-width:260px;" value="' + esc(sheet ? sheet.title : '') + '" placeholder="Title" />' +
        '<select class="co-input" id="cs-snip" style="margin-left:auto;max-width:170px;"><option value="">Insert snippet…</option></select>' +
        '<button class="co-btn" id="cs-copy" style="margin-left:8px;">Copy</button>' +
        (sheet ? '<button class="co-btn" id="cs-del" style="margin-left:8px;">Delete</button>' : '') +
        '<button class="co-btn co-btn--primary" id="cs-save" style="margin-left:8px;">Save</button></div>' +
        '<div class="co-body"><textarea id="cs-ta" class="tk-in" style="min-height:60vh;">' + esc(sheet ? sheet.body : '# New cheat sheet\n\n') + '</textarea></div>';
      var ta = root.querySelector('#cs-ta'), cur = sheet;
      root.querySelector('#cs-back').addEventListener('click', list);
      root.querySelector('#cs-save').addEventListener('click', function () {
        post('/api/cheatsheets/save', { id: cur ? cur.id : null, title: root.querySelector('#cs-title').value.trim(), body: ta.value }).then(function (r) { if (r.id) cur = { id: r.id }; if (window.Deck) Deck.toast('Saved'); });
      });
      root.querySelector('#cs-copy').addEventListener('click', function () {
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(ta.value); }
        else { ta.select(); try { document.execCommand('copy'); } catch (e) {} }
        if (window.Deck) Deck.toast('Copied');
      });
      var d = root.querySelector('#cs-del'); if (d) d.addEventListener('click', function () { if (cur) del('/api/cheatsheets/' + cur.id).then(list); });
      get('/api/snippets/list').then(function (sd) {
        var items = [];
        (sd.categories || []).forEach(function (c) { (c.items || c.snippets || []).forEach(function (s) { items.push(s); }); });
        if (!items.length && sd.snippets) items = sd.snippets;
        var sel = root.querySelector('#cs-snip');
        items.forEach(function (s, i) { var o = document.createElement('option'); o.value = i; o.textContent = (s.title || 'snippet').slice(0, 40); sel.appendChild(o); });
        sel.addEventListener('change', function () { var s = items[+sel.value]; if (!s) return; ta.value += '\n## ' + (s.title || '') + '\n```\n' + (s.command || s.body || '') + '\n```\n'; sel.value = ''; });
      }).catch(function () {});
    }
    if (sid) get('/api/cheatsheets/' + sid).then(function (d) { render(d.sheet); });
    else render(null);
  }

  window.DeckViews = window.DeckViews || {};
  window.DeckViews.cheatsheets = view;
})();
