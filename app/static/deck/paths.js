/*
 * Learning Paths view — curated study roadmaps, off /api/paths. Each path is an ordered
 * checklist whose steps jump into the relevant module (course, deck, playbook, quiz…).
 */
(function () {
  'use strict';
  var root = null;
  function esc(s) { return (window.Deck ? Deck.esc : String)(s == null ? '' : s); }
  function get(u) { return fetch(u).then(function (r) { return r.json(); }); }
  function go(id) { var el = document.querySelector('[data-nav="' + id + '"]'); if (el) el.click(); }

  function view(el) { root = el; list(); }

  function card(p) {
    var pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    return '<button class="lp-card" data-path="' + esc(p.id) + '"><div class="lp-card-top"><span class="lp-title">' + esc(p.title) + '</span><span class="lp-pct">' + p.done + '/' + p.total + '</span></div>' +
      '<div class="lp-blurb">' + esc(p.blurb) + '</div><div class="lp-bar"><div class="lp-bar-fill" style="width:' + pct + '%"></div></div></button>';
  }

  function list() {
    root.innerHTML = '<div class="co-head"><span class="co-title">Learning Paths</span></div><div class="co-body" id="lp-body"><div class="kb-loading">Loading…</div></div>';
    get('/api/paths/list').then(function (d) {
      var all = d.paths || [];
      var core = all.filter(function (p) { return p.source !== 'thm'; });
      var thm = all.filter(function (p) { return p.source === 'thm'; });
      var html = core.map(card).join('');
      if (thm.length) {
        var rooms = thm.reduce(function (n, p) { return n + p.total; }, 0);
        var done = thm.reduce(function (n, p) { return n + p.done; }, 0);
        html += '<div class="lp-group"><div class="lp-group-head"><span class="lp-group-t">TryHackMe Roadmap</span>' +
          '<button class="co-btn" id="lp-browse-all">Browse all ' + rooms + ' rooms →</button></div>' +
          '<span class="lp-group-sub">' + done + '/' + rooms + ' rooms · ' + thm.length + ' topics · free' +
          (d.thm_source ? ' · <a class="lp-src" href="' + esc(d.thm_source) + '" target="_blank" rel="noopener">source ↗</a>' : '') +
          '</span></div>';
        html += '<div class="lp-grid">' + thm.map(card).join('') + '</div>';
      }
      root.querySelector('#lp-body').innerHTML = html;
      var ba = root.querySelector('#lp-browse-all');
      if (ba) ba.addEventListener('click', allRooms);
      Array.prototype.forEach.call(root.querySelectorAll('[data-path]'), function (b) { b.addEventListener('click', function () { detail(b.getAttribute('data-path')); }); });
    });
  }

  function detail(pid) {
    get('/api/paths/' + pid).then(function (p) {
      root.innerHTML = '<div class="co-head"><button class="co-btn" id="lp-back">← Paths</button><span class="co-title" style="margin-left:10px;">' + esc(p.title) + '</span></div>' +
        '<div class="co-body"><p class="deck-muted">' + esc(p.blurb) + '</p><div class="lp-steps">' +
        p.steps.map(function (s) {
          var label = s.url
            ? '<a class="lp-step-text lp-step-link" href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.text) + '</a>'
            : '<span class="lp-step-text">' + esc(s.text) + '</span>';
          var action = s.url ? '<a class="co-btn lp-go" href="' + esc(s.url) + '" target="_blank" rel="noopener">Open ↗</a>'
            : (s.nav ? '<button class="co-btn lp-go" data-go="' + esc(s.nav) + '">Open</button>' : '');
          return '<div class="lp-step' + (s.done ? ' lp-step--done' : '') + '"><button class="lp-check" data-step="' + s.i + '" data-done="' + (s.done ? 1 : 0) + '">' + (s.done ? '✓' : '') + '</button>' +
            label + action + '</div>';
        }).join('') + '</div></div>';
      root.querySelector('#lp-back').addEventListener('click', list);
      Array.prototype.forEach.call(root.querySelectorAll('.lp-check'), function (b) {
        b.addEventListener('click', function () {
          var done = b.getAttribute('data-done') !== '1';
          fetch('/api/paths/' + pid + '/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: +b.getAttribute('data-step'), done: done }) }).then(function () { detail(pid); });
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('.lp-go'), function (b) { b.addEventListener('click', function () { go(b.getAttribute('data-go')); }); });
    });
  }

  // ── All-rooms browse: search + filter by topic (tag), each room checkable ─────────
  var roomState = { rooms: [], topics: [], topic: 'all', q: '' };

  function allRooms() {
    root.innerHTML = '<div class="co-head"><button class="co-btn" id="lp-back">← Paths</button>' +
      '<span class="co-title" style="margin-left:10px;">TryHackMe — All Rooms</span></div>' +
      '<div class="co-body" id="lp-allbody"><div class="kb-loading">Loading rooms…</div></div>';
    root.querySelector('#lp-back').addEventListener('click', list);
    get('/api/paths/thm-rooms').then(function (d) {
      roomState.rooms = d.rooms || [];
      roomState.topics = d.topics || [];
      roomState.topic = 'all'; roomState.q = '';
      var body = root.querySelector('#lp-allbody');
      body.innerHTML =
        '<div class="lp-searchrow"><input class="co-input" id="lp-search" placeholder="Search all ' + roomState.rooms.length + ' rooms…" autocomplete="off">' +
        '<span class="lp-count" id="lp-count"></span></div>' +
        '<div class="lp-tags" id="lp-tags"></div>' +
        '<div class="lp-rooms" id="lp-rooms"></div>';
      body.querySelector('#lp-search').addEventListener('input', function (e) { roomState.q = e.target.value; renderRoomList(); });
      renderTags(); renderRoomList();
    });
  }

  function chip(id, label, n) {
    return '<button class="lp-tag' + (roomState.topic === id ? ' lp-tag--on' : '') + '" data-topic="' + esc(id) + '">' + esc(label) + ' <span class="lp-tag-n">' + n + '</span></button>';
  }

  function renderTags() {
    var el = root.querySelector('#lp-tags'); if (!el) return;
    el.innerHTML = chip('all', 'All', roomState.rooms.length) +
      roomState.topics.map(function (t) { return chip(t.id, t.title, t.total); }).join('');
    Array.prototype.forEach.call(el.querySelectorAll('[data-topic]'), function (b) {
      b.addEventListener('click', function () { roomState.topic = b.getAttribute('data-topic'); renderTags(); renderRoomList(); });
    });
  }

  function filteredRooms() {
    var q = roomState.q.toLowerCase();
    return roomState.rooms.filter(function (r) {
      if (roomState.topic !== 'all' && r.pid !== roomState.topic) return false;
      if (q && r.text.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function renderRoomList() {
    var el = root.querySelector('#lp-rooms'); if (!el) return;
    var rooms = filteredRooms();
    var cnt = root.querySelector('#lp-count');
    if (cnt) cnt.textContent = rooms.filter(function (r) { return r.done; }).length + '/' + rooms.length + ' done';
    el.innerHTML = rooms.map(function (r) {
      return '<div class="lp-room' + (r.done ? ' lp-room--done' : '') + '" data-pid="' + esc(r.pid) + '" data-i="' + r.i + '">' +
        '<button class="lp-check" data-done="' + (r.done ? 1 : 0) + '">' + (r.done ? '✓' : '') + '</button>' +
        '<a class="lp-room-name" href="' + esc(r.url) + '" target="_blank" rel="noopener">' + esc(r.text) + '</a>' +
        '<span class="lp-room-topic">' + esc(r.topic) + '</span></div>';
    }).join('') || '<div class="co-muted" style="padding:16px 0;">No rooms match.</div>';
    Array.prototype.forEach.call(el.querySelectorAll('.lp-check'), function (chk) {
      chk.addEventListener('click', function () {
        var row = chk.closest('.lp-room');
        var pid = row.getAttribute('data-pid'), i = +row.getAttribute('data-i');
        var done = chk.getAttribute('data-done') !== '1';
        fetch('/api/paths/' + pid + '/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: i, done: done }) })
          .then(function () {
            roomState.rooms.forEach(function (r) { if (r.pid === pid && r.i === i) r.done = done; });
            renderRoomList();
          });
      });
    });
  }

  window.DeckViews = window.DeckViews || {};
  window.DeckViews.paths = view;
})();
