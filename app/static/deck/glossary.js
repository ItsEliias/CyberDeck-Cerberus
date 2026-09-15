/*
 * Glossary view — auto-extracted term bank from your notes, off /api/glossary.
 * Client-side filtering; each term links back to its source note.
 */
(function () {
  'use strict';
  var root = null, all = [];
  function esc(s) { return (window.Deck ? Deck.esc : String)(s == null ? '' : s); }
  function go(id) { var el = document.querySelector('[data-nav="' + id + '"]'); if (el) el.click(); }

  function view(el) { root = el; load(); }

  function load() {
    root.innerHTML = '<div class="co-head"><span class="co-title">Glossary</span></div>' +
      '<div class="co-body"><input class="co-input" id="gl-q" placeholder="Filter terms…" style="margin-bottom:14px;" />' +
      '<div id="gl-list"><div class="kb-loading">Scanning your notes…</div></div></div>';
    fetch('/api/glossary').then(function (r) { return r.json(); }).then(function (d) { all = d.terms || []; render(''); });
    root.querySelector('#gl-q').addEventListener('input', function (e) { render(e.target.value.toLowerCase()); });
  }

  function render(q) {
    var list = root.querySelector('#gl-list');
    if (!all.length) { list.innerHTML = '<div class="co-empty">No definitions found yet.<br>Add lines like <code>**Term** — meaning</code> to your notes and they’ll appear here.</div>'; return; }
    var items = q ? all.filter(function (t) { return t.term.toLowerCase().indexOf(q) >= 0 || t.definition.toLowerCase().indexOf(q) >= 0; }) : all;
    list.innerHTML = '<div class="co-muted" style="margin-bottom:10px;">' + items.length + ' term' + (items.length === 1 ? '' : 's') + '</div>' +
      items.slice(0, 400).map(function (t) {
        return '<div class="gl-item"><div class="gl-term">' + esc(t.term) + '</div><div class="gl-def">' + esc(t.definition) + '</div>' +
          '<button class="gl-src" data-path="' + esc(t.path) + '" title="Open source note">' + esc(t.path) + '</button></div>';
      }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('[data-path]'), function (b) { b.addEventListener('click', function () { go('knowledge'); }); });
  }

  window.DeckViews = window.DeckViews || {};
  window.DeckViews.glossary = view;
})();
