/*
 * Targets view — engagement targets + findings, off /api/targets.
 * list (+ add) → detail (status, findings, add/delete finding).
 */
(function () {
  'use strict';
  var root = null, meta = { severities: [], statuses: [] };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function get(u) { return fetch(u).then(function (r) { return r.json(); }); }
  function post(u, b) { return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(function (r) { return r.json(); }); }
  function del(u) { return fetch(u, { method: 'DELETE' }).then(function (r) { return r.json(); }); }
  function sevClass(s) { return 'sev sev--' + s; }

  function showList() {
    root.innerHTML = '<div class="co-head"><span class="co-title">Targets</span></div><div class="co-body">' +
      '<div class="cr-grid" style="margin-bottom:20px;">' +
      '<input id="tg-name" class="co-input" placeholder="Target name">' +
      '<input id="tg-host" class="co-input" placeholder="Host / IP">' +
      '<input id="tg-os" class="co-input" placeholder="OS (optional)">' +
      '<button class="co-btn co-btn--primary" id="tg-add">Add target</button></div>' +
      '<div id="tg-list"><div class="kb-loading">Loading…</div></div></div>';
    root.querySelector('#tg-add').addEventListener('click', function () {
      var body = { name: root.querySelector('#tg-name').value, host: root.querySelector('#tg-host').value, os: root.querySelector('#tg-os').value };
      if (!body.name.trim()) return;
      post('/api/targets/add', body).then(showList);
    });
    get('/api/targets/list').then(function (d) {
      meta.severities = d.severities; meta.statuses = d.statuses;
      var box = root.querySelector('#tg-list');
      if (!d.targets.length) { box.innerHTML = '<div class="co-empty">No targets yet.</div>'; return; }
      box.innerHTML = '<div class="co-grid">' + d.targets.map(function (t) {
        return '<button class="co-card" data-t="' + esc(t.id) + '"><div class="co-card-title">' + esc(t.name) + '</div>' +
          '<div class="co-card-meta">' + esc(t.host || '—') + (t.os ? ' · ' + esc(t.os) : '') + '</div>' +
          '<div class="co-chips"><span class="co-chip status status--' + esc(t.status) + '">' + esc(t.status) + '</span>' +
          '<span class="co-chip">' + t.finding_count + ' finding' + (t.finding_count === 1 ? '' : 's') + '</span>' +
          (t.open_high ? '<span class="co-chip sev sev--high">' + t.open_high + ' high+</span>' : '') + '</div></button>';
      }).join('') + '</div>';
      Array.prototype.forEach.call(box.querySelectorAll('[data-t]'), function (el) { el.addEventListener('click', function () { showDetail(el.getAttribute('data-t')); }); });
    });
  }

  function showDetail(tid) {
    get('/api/targets/list').then(function (d) {
      var t = d.targets.filter(function (x) { return x.id === tid; })[0];
      if (!t) return showList();
      var statusOpts = meta.statuses.map(function (s) { return '<option value="' + s + '"' + (s === t.status ? ' selected' : '') + '>' + s + '</option>'; }).join('');
      var sevOpts = meta.severities.map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
      var findings = (t.findings || []).map(function (f) {
        var ev = (f.evidence || []).map(function (e) {
          return e.image
            ? '<a class="tg-ev" href="/api/targets/evidence/' + esc(e.id) + '" target="_blank" rel="noopener"><img src="/api/targets/evidence/' + esc(e.id) + '" alt="' + esc(e.name) + '"><button class="tg-ev-del" data-ev="' + esc(e.id) + '" title="Remove">×</button></a>'
            : '<span class="tg-ev tg-ev-file"><a href="/api/targets/evidence/' + esc(e.id) + '" target="_blank" rel="noopener">' + esc(e.name) + '</a><button class="tg-ev-del" data-ev="' + esc(e.id) + '" title="Remove">×</button></span>';
        }).join('');
        return '<div class="tg-finding"><span class="' + sevClass(f.severity) + '">' + esc(f.severity) + '</span>' +
          '<div class="tg-finding-body"><div class="tg-finding-title">' + esc(f.title) + '</div>' +
          (f.notes ? '<div class="tg-finding-notes">' + esc(f.notes) + '</div>' : '') +
          '<div class="tg-ev-row">' + ev + '<button class="tg-attach" data-attach="' + esc(f.id) + '">+ evidence</button></div></div>' +
          '<button class="cr-del" data-df="' + esc(f.id) + '">✕</button></div>';
      }).join('') || '<div class="co-muted" style="padding:10px 0;">No findings yet.</div>';
      root.innerHTML = '<div class="co-head"><button class="co-btn" id="tg-back">← Targets</button>' +
        '<span class="co-title" style="margin-left:10px;">' + esc(t.name) + '</span>' +
        '<button class="co-btn co-btn--primary" id="tg-report" style="margin-left:auto;">Generate report</button>' +
        '<button class="co-btn" id="tg-delT" style="margin-left:8px;">Delete target</button></div>' +
        '<input type="file" id="tg-file" accept="image/*,.pdf,.txt,.log" style="display:none;">' +
        '<div class="co-body"><div class="co-muted" style="margin-bottom:14px;">' + esc(t.host || '—') + (t.os ? ' · ' + esc(t.os) : '') +
        ' &nbsp; Status: <select id="tg-status" class="co-input" style="width:auto;display:inline-block;padding:4px 8px;">' + statusOpts + '</select></div>' +
        '<div class="co-title" style="font-size:12px;margin:6px 0 10px;">Findings</div><div id="tg-findings">' + findings + '</div>' +
        '<div class="cr-grid" style="margin-top:16px;">' +
        '<input id="tg-ftitle" class="co-input" placeholder="Finding title">' +
        '<select id="tg-fsev" class="co-input">' + sevOpts + '</select>' +
        '<input id="tg-fnotes" class="co-input" placeholder="Notes (optional)">' +
        '<button class="co-btn co-btn--primary" id="tg-fadd">Add finding</button></div></div>';
      root.querySelector('#tg-back').addEventListener('click', showList);
      root.querySelector('#tg-delT').addEventListener('click', function () { del('/api/targets/' + tid).then(showList); });
      root.querySelector('#tg-status').addEventListener('change', function (e) { post('/api/targets/' + tid + '/status', { status: e.target.value }); });
      root.querySelector('#tg-fadd').addEventListener('click', function () {
        var body = { title: root.querySelector('#tg-ftitle').value, severity: root.querySelector('#tg-fsev').value, notes: root.querySelector('#tg-fnotes').value };
        if (!body.title.trim()) return;
        post('/api/targets/' + tid + '/finding', body).then(function () { showDetail(tid); });
      });
      root.querySelector('#tg-report').addEventListener('click', function () {
        post('/api/reports/from-target', { tid: tid }).then(function (r) {
          if (r.id) { Deck.toast('Report drafted from findings'); document.querySelector('[data-nav="reports"]').click(); }
        });
      });
      var pendingFinding = null;
      var fileInput = root.querySelector('#tg-file');
      fileInput.addEventListener('change', function () {
        if (!fileInput.files.length || !pendingFinding) return;
        var fd = new FormData(); fd.append('file', fileInput.files[0]);
        fetch('/api/targets/' + tid + '/finding/' + pendingFinding + '/evidence', { method: 'POST', body: fd })
          .then(function (r) { return r.json(); }).then(function () { fileInput.value = ''; Deck.toast('Evidence attached'); showDetail(tid); });
      });
      root.querySelector('#tg-findings').addEventListener('click', function (e) {
        var at = e.target.closest('[data-attach]');
        if (at) { pendingFinding = at.getAttribute('data-attach'); fileInput.click(); return; }
        var ed = e.target.closest('[data-ev]');
        if (ed) { e.preventDefault(); del('/api/targets/evidence/' + ed.getAttribute('data-ev')).then(function () { showDetail(tid); }); return; }
        var d2 = e.target.closest('[data-df]'); if (d2) del('/api/targets/' + tid + '/finding/' + d2.getAttribute('data-df')).then(function () { showDetail(tid); });
      });
    });
  }

  window.DeckViews.targets = function (el) { root = el; showList(); };
})();
