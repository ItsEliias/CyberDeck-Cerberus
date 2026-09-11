/*
 * Feeds view — security news reader, off /api/feeds. Offline-first (shows cache).
 */
(function () {
  'use strict';
  var root = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function get(u) { return fetch(u).then(function (r) { return r.json(); }); }

  function view(el) {
    root = el;
    root.innerHTML = '<div class="co-head"><span class="co-title">Feeds</span>' +
      '<span class="rp-status" id="fd-status"></span>' +
      '<button class="co-btn" id="fd-refresh" style="margin-left:auto;">Refresh</button></div>' +
      '<div class="co-body"><div id="fd-items"><div class="kb-loading">Loading…</div></div></div>';
    root.querySelector('#fd-refresh').addEventListener('click', function () { load(true); });
    load(false);
  }

  function load(refresh) {
    var box = root.querySelector('#fd-items');
    box.innerHTML = '<div class="kb-loading">' + (refresh ? 'Fetching…' : 'Loading…') + '</div>';
    get('/api/feeds/items' + (refresh ? '?refresh=1' : '')).then(function (d) {
      var st = root.querySelector('#fd-status');
      if (d.online === false) st.textContent = 'offline — ' + (d.fetched ? 'cached ' + d.fetched.slice(0, 16).replace('T', ' ') : 'no cache yet');
      else st.textContent = d.fetched ? 'updated ' + d.fetched.slice(0, 16).replace('T', ' ') : '';
      var items = d.items || [];
      if (!items.length) {
        box.innerHTML = '<div class="co-empty">No items.' + (d.online === false ? '<br>Offline and nothing cached yet — hit Refresh when connected.' : '') + '</div>';
        return;
      }
      box.innerHTML = '<div class="fd-list">' + items.map(function (it) {
        return '<a class="fd-item" href="' + esc(it.link) + '" target="_blank" rel="noopener">' +
          '<div class="fd-item-top"><span class="fd-src">' + esc(it.source) + '</span>' +
          '<span class="fd-date">' + esc((it.date || '').slice(0, 25)) + '</span></div>' +
          '<div class="fd-title">' + esc(it.title) + '</div>' +
          (it.summary ? '<div class="fd-sum">' + esc(it.summary.replace(/<[^>]+>/g, '')) + '</div>' : '') + '</a>';
      }).join('') + '</div>';
    }).catch(function () { box.innerHTML = '<div class="co-warn">Failed to load feeds.</div>'; });
  }

  window.DeckViews.feeds = view;
})();
