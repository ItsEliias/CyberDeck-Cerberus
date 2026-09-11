/*
 * Reports view — markdown drafts + HTML export (print → PDF), off /api/reports.
 * list (+ create) → editor (textarea, save, export, delete).
 */
(function () {
  'use strict';
  var root = null, saveTimer = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function get(u) { return fetch(u).then(function (r) { return r.json(); }); }
  function post(u, b) { return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(function (r) { return r.json(); }); }
  function del(u) { return fetch(u, { method: 'DELETE' }).then(function (r) { return r.json(); }); }

  function showList() {
    root.innerHTML = '<div class="co-head"><span class="co-title">Reports</span>' +
      '<button class="co-btn co-btn--primary" id="rp-new">+ New report</button></div>' +
      '<div class="co-body"><div class="kb-loading">Loading…</div></div>';
    root.querySelector('#rp-new').addEventListener('click', function () {
      var title = prompt('Report title:', 'Engagement report');
      if (title == null) return;
      post('/api/reports/create', { title: title }).then(function (d) { if (d.id) showEditor(d.id); });
    });
    get('/api/reports/list').then(function (d) {
      var body = root.querySelector('.co-body');
      if (!d.reports.length) { body.innerHTML = '<div class="co-empty">No reports yet.<br>Create one from the pentest template.</div>'; return; }
      body.innerHTML = '<div class="co-grid">' + d.reports.map(function (r) {
        return '<button class="co-card" data-r="' + esc(r.id) + '"><div class="co-card-title">' + esc(r.title) + '</div>' +
          '<div class="co-card-meta">' + r.words + ' words · ' + esc((r.updated || '').slice(0, 10)) + '</div></button>';
      }).join('') + '</div>';
      Array.prototype.forEach.call(body.querySelectorAll('[data-r]'), function (el) { el.addEventListener('click', function () { showEditor(el.getAttribute('data-r')); }); });
    });
  }

  function showEditor(rid) {
    get('/api/reports/' + encodeURIComponent(rid)).then(function (d) {
      if (d.error) return showList();
      root.innerHTML = '<div class="co-head"><button class="co-btn" id="rp-back">← Reports</button>' +
        '<span class="co-title" id="rp-title" style="margin-left:10px;">' + esc(d.title) + '</span>' +
        '<span class="rp-status" id="rp-status"></span>' +
        '<a class="co-btn" id="rp-export" href="/api/reports/' + encodeURIComponent(rid) + '/export" target="_blank" rel="noopener" style="margin-left:auto;">Export HTML ↗</a>' +
        '<button class="co-btn" id="rp-del" style="margin-left:8px;">Delete</button></div>' +
        '<div class="rp-editwrap"><textarea id="rp-text" class="rp-text" spellcheck="false"></textarea></div>';
      root.querySelector('#rp-text').value = d.content;
      root.querySelector('#rp-back').addEventListener('click', function () { flush(rid); showList(); });
      root.querySelector('#rp-del').addEventListener('click', function () { if (confirm('Delete this report?')) del('/api/reports/' + rid).then(showList); });
      var ta = root.querySelector('#rp-text');
      ta.addEventListener('input', function () {
        setStatus('editing…');
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () { flush(rid); }, 700);
      });
    });
  }

  function flush(rid) {
    var ta = root.querySelector('#rp-text'); if (!ta) return;
    post('/api/reports/' + rid, { content: ta.value }).then(function (d) {
      setStatus('saved');
      if (d.title) { var t = root.querySelector('#rp-title'); if (t) t.textContent = d.title; }
    });
  }
  function setStatus(s) { var el = root.querySelector('#rp-status'); if (el) el.textContent = s; }

  window.DeckViews.reports = function (el) { root = el; showList(); };
})();
