/*
 * Resources view — a tagged bookmark library, off /api/resources.
 * Save a link with tags + a note; filter by tag. Lighter than Courses (no content fetch).
 */
(function () {
  'use strict';
  var root = null, curTag = null;
  function esc(s) { return (window.Deck ? Deck.esc : String)(s == null ? '' : s); }
  function get(u) { return fetch(u).then(function (r) { return r.json(); }); }
  function post(u, b) { return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(function (r) { return r.json(); }); }
  function del(u) { return fetch(u, { method: 'DELETE' }).then(function (r) { return r.json(); }); }

  function view(el) { root = el; load(); }

  function load() {
    root.innerHTML = '<div class="co-head"><span class="co-title">Resources</span>' +
      '<button class="co-btn co-btn--primary" id="rs-add">+ Add bookmark</button></div>' +
      '<div class="co-body"><div id="rs-tags" class="rs-tags"></div>' +
      '<div id="rs-list"><div class="kb-loading">Loading…</div></div></div>';
    root.querySelector('#rs-add').addEventListener('click', showAdd);
    get('/api/resources/list' + (curTag ? '?tag=' + encodeURIComponent(curTag) : '')).then(render);
  }

  function render(d) {
    var tagsEl = root.querySelector('#rs-tags');
    tagsEl.innerHTML = '<button class="rs-tag' + (!curTag ? ' rs-tag--on' : '') + '" data-tag="">All</button>' +
      (d.tags || []).map(function (t) {
        return '<button class="rs-tag' + (curTag === t ? ' rs-tag--on' : '') + '" data-tag="' + esc(t) + '">' + esc(t) + '</button>';
      }).join('');
    Array.prototype.forEach.call(tagsEl.querySelectorAll('[data-tag]'), function (b) {
      b.addEventListener('click', function () { curTag = b.getAttribute('data-tag') || null; load(); });
    });

    var list = root.querySelector('#rs-list');
    var items = d.items || [];
    if (!items.length) {
      list.innerHTML = '<div class="co-empty">No bookmarks' + (curTag ? ' tagged “' + esc(curTag) + '”' : '') + ' yet.</div>';
      return;
    }
    list.innerHTML = items.map(function (i) {
      var tags = (i.tags || []).map(function (t) { return '<span class="rs-chip">' + esc(t) + '</span>'; }).join('');
      return '<div class="rs-item"><div class="rs-main">' +
        '<a class="rs-title" href="' + esc(i.url) + '" target="_blank" rel="noopener">' + esc(i.title) + '</a>' +
        '<div class="rs-url">' + esc(i.url) + '</div>' +
        (i.note ? '<div class="rs-note">' + esc(i.note) + '</div>' : '') +
        '<div class="rs-chips">' + tags + '</div></div>' +
        '<button class="rs-del" data-del="' + esc(i.id) + '" title="Remove">×</button></div>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('[data-del]'), function (b) {
      b.addEventListener('click', function () { del('/api/resources/' + b.getAttribute('data-del')).then(load); });
    });
  }

  function showAdd() {
    root.innerHTML = '<div class="co-head"><span class="co-title">Add bookmark</span>' +
      '<button class="co-btn" id="rs-cancel">Cancel</button></div>' +
      '<div class="co-body"><div class="co-form">' +
      '<label class="co-label">URL</label><input id="rs-url" class="co-input" placeholder="https://…" />' +
      '<label class="co-label" style="margin-top:10px;">Title (optional)</label><input id="rs-title" class="co-input" placeholder="Auto from the domain" />' +
      '<label class="co-label" style="margin-top:10px;">Tags (comma-separated)</label><input id="rs-tagsin" class="co-input" placeholder="web, reference" />' +
      '<label class="co-label" style="margin-top:10px;">Note (optional)</label><input id="rs-note" class="co-input" placeholder="Why it\'s useful" />' +
      '<div class="co-row" style="margin-top:12px;"><button class="co-btn co-btn--primary" id="rs-save">Save</button></div>' +
      '<div id="rs-res"></div></div></div>';
    root.querySelector('#rs-cancel').addEventListener('click', load);
    function save() {
      var url = root.querySelector('#rs-url').value.trim();
      if (!/^https?:\/\//i.test(url)) { root.querySelector('#rs-res').innerHTML = '<div class="co-warn">Enter a full http(s):// URL.</div>'; return; }
      post('/api/resources/add', {
        url: url, title: root.querySelector('#rs-title').value.trim(),
        tags: root.querySelector('#rs-tagsin').value.trim(), note: root.querySelector('#rs-note').value.trim()
      }).then(function (d) {
        if (d.ok) load();
        else root.querySelector('#rs-res').innerHTML = '<div class="co-warn">' + esc(d.error || 'Failed.') + '</div>';
      });
    }
    root.querySelector('#rs-save').addEventListener('click', save);
    root.querySelector('#rs-url').addEventListener('keydown', function (e) { if (e.key === 'Enter') save(); });
    root.querySelector('#rs-url').focus();
  }

  window.DeckViews = window.DeckViews || {};
  window.DeckViews.resources = view;
})();
