/*
 * Sessions view — CTF/box tracker with live timer, methodology checklist, notes.
 * off /api/sessions. list → detail (timer + checklist + notes autosave).
 */
(function () {
  'use strict';
  var root = null, tick = null, saveTimer = null, meta = { platforms: [] };
  function esc(s) { return (window.Deck ? Deck.esc : String)(s == null ? '' : s); }
  function get(u) { return fetch(u).then(function (r) { return r.json(); }); }
  function post(u, b) { return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(function (r) { return r.json(); }); }
  function del(u) { return fetch(u, { method: 'DELETE' }).then(function (r) { return r.json(); }); }
  function stopTick() { if (tick) { clearInterval(tick); tick = null; } }
  function fmt(s) { var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); }

  function view(el) { root = el; showList(); }

  function showList() {
    stopTick();
    root.innerHTML = '<div class="co-head"><span class="co-title">Sessions</span>' +
      '<button class="co-btn co-btn--primary" id="ss-new" style="margin-left:auto;">+ New box</button></div>' +
      '<div class="co-body" id="ss-body"><div class="kb-loading">Loading…</div></div>';
    root.querySelector('#ss-new').addEventListener('click', newModal);
    get('/api/sessions/list').then(function (d) {
      meta.platforms = d.platforms;
      var body = root.querySelector('#ss-body');
      if (!d.sessions.length) { body.innerHTML = '<div class="co-empty">No boxes tracked yet.<br>Start one when you begin an HTB/THM machine.</div>'; return; }
      body.innerHTML = '<div class="co-grid">' + d.sessions.map(function (s) {
        return '<button class="co-card" data-s="' + esc(s.id) + '"><div class="co-card-title">' + esc(s.name) + '</div>' +
          '<div class="co-card-meta">' + esc(s.target || '—') + '</div>' +
          '<div class="co-chips"><span class="co-chip">' + esc(s.platform) + '</span>' +
          '<span class="co-chip status status--' + esc(s.status) + '">' + esc(s.status) + '</span>' +
          '<span class="co-chip' + (s.running ? ' fc-due' : '') + '">' + fmt(s.elapsed) + (s.running ? ' ●' : '') + '</span>' +
          '<span class="co-chip">' + s.done + '/' + s.total + '</span></div></button>';
      }).join('') + '</div>';
      body.querySelectorAll('[data-s]').forEach(function (el) { el.addEventListener('click', function () { showDetail(el.getAttribute('data-s')); }); });
    });
  }

  function showDetail(sid) {
    stopTick();
    get('/api/sessions/' + sid).then(function (s) {
      if (s.error) return showList();
      render(s);
    });
  }

  function render(s) {
    var checks = s.checklist.map(function (c, i) {
      return '<div class="pb-step' + (c.done ? ' pb-step--on' : '') + '" data-i="' + i + '"><span class="pb-check"></span><span class="pb-text">' + esc(c.text) + '</span></div>';
    }).join('');
    root.innerHTML = '<div class="co-head"><button class="co-btn" id="ss-back">← Sessions</button>' +
      '<span class="co-title" style="margin-left:10px;">' + esc(s.name) + '</span>' +
      '<span class="co-chip" style="margin-left:8px;">' + esc(s.platform) + '</span>' +
      '<button class="co-btn" id="ss-del" style="margin-left:auto;">Delete</button></div>' +
      '<div class="co-body"><div class="ss-toprow">' +
      '<div class="ss-timer" id="ss-timer">' + fmt(s.elapsed) + '</div>' +
      '<button class="co-btn co-btn--primary" id="ss-toggle">' + (s.running ? 'Pause' : 'Start') + '</button>' +
      '<button class="co-btn" id="ss-done">' + (s.status === 'done' ? 'Reopen' : 'Mark rooted') + '</button>' +
      (s.target ? '<span class="co-muted" style="margin-left:6px;">target: <b>' + esc(s.target) + '</b></span>' : '') +
      '<span style="margin-left:auto;display:flex;gap:8px;"><button class="co-btn" id="ss-toboard">Board →</button></span></div>' +
      '<div class="ss-cols"><div><div class="deck-panel-title" style="margin:14px 0 8px;">Methodology</div><div class="pb-steps" id="ss-checks">' + checks + '</div></div>' +
      '<div><div class="deck-panel-title" style="margin:14px 0 8px;">Notes</div><textarea id="ss-notes" class="rp-text" style="height:46vh;border:1px solid var(--border);border-radius:8px;">' + esc(s.notes) + '</textarea></div></div></div>';

    var elapsed = s.elapsed, running = s.running;
    var tel = root.querySelector('#ss-timer');
    if (running) tick = setInterval(function () { elapsed++; tel.textContent = fmt(elapsed); }, 1000);

    root.querySelector('#ss-back').addEventListener('click', showList);
    root.querySelector('#ss-del').addEventListener('click', function () { if (confirm('Delete this session?')) del('/api/sessions/' + s.id).then(showList); });
    root.querySelector('#ss-toggle').addEventListener('click', function () {
      stopTick();
      post('/api/sessions/' + s.id + '/timer', { action: running ? 'pause' : 'start' }).then(render);
    });
    root.querySelector('#ss-done').addEventListener('click', function () {
      stopTick();
      post('/api/sessions/' + s.id, { status: s.status === 'done' ? 'active' : 'done' }).then(render);
    });
    root.querySelector('#ss-toboard').addEventListener('click', function () { document.querySelector('[data-nav="board"]').click(); });
    root.querySelector('#ss-checks').addEventListener('click', function (e) {
      var step = e.target.closest('.pb-step'); if (!step) return;
      var i = parseInt(step.getAttribute('data-i'), 10);
      var done = !step.classList.contains('pb-step--on');
      step.classList.toggle('pb-step--on', done);
      post('/api/sessions/' + s.id + '/check', { index: i, done: done });
    });
    root.querySelector('#ss-notes').addEventListener('input', function (e) {
      clearTimeout(saveTimer);
      var v = e.target.value;
      saveTimer = setTimeout(function () { post('/api/sessions/' + s.id, { notes: v }); }, 700);
    });
  }

  function newModal() {
    var opts = meta.platforms.map(function (p) { return '<option>' + p + '</option>'; }).join('');
    Deck.modal({
      title: 'New box', width: 440,
      body: '<label class="co-label">Name</label><input id="ss-n" class="co-input" placeholder="e.g. HTB — Overwatch">' +
        '<label class="co-label">Platform</label><select id="ss-p" class="co-input">' + opts + '</select>' +
        '<label class="co-label">Target (optional)</label><input id="ss-t" class="co-input" placeholder="10.10.11.x">',
      footer: '<button class="co-btn" id="ss-c">Cancel</button><button class="co-btn co-btn--primary" id="ss-ok">Start</button>',
      onMount: function (m) {
        m.querySelector('#ss-c').addEventListener('click', Deck.closeModal);
        m.querySelector('#ss-ok').addEventListener('click', function () {
          var name = m.querySelector('#ss-n').value.trim(); if (!name) return;
          post('/api/sessions/create', { name: name, platform: m.querySelector('#ss-p').value, target: m.querySelector('#ss-t').value })
            .then(function (r) { if (r.id) { Deck.closeModal(); showDetail(r.id); } });
        });
      },
    });
  }

  window.DeckViews.sessions = view;
})();
