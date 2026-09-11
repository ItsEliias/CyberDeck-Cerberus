/*
 * Credentials view — encrypted vault, off /api/credentials.
 * setup (no vault) → unlock (locked) → vault (list + add + reveal + lock).
 */
(function () {
  'use strict';
  var root = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function get(u) { return fetch(u).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }); }
  function post(u, b) { return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }); }
  function del(u) { return fetch(u, { method: 'DELETE' }).then(function (r) { return r.json(); }); }

  function refresh() { get('/api/credentials/status').then(function (r) { render(r.j); }); }

  function render(st) {
    if (!st.configured) return renderSetup();
    if (st.locked) return renderUnlock();
    return renderVault();
  }

  function shell(title, inner, lockBtn) {
    return '<div class="co-head"><span class="co-title">' + esc(title) + '</span>' +
      (lockBtn ? '<button class="co-btn" id="cr-lock">Lock</button>' : '') + '</div>' +
      '<div class="co-body">' + inner + '</div>';
  }

  function renderSetup() {
    root.innerHTML = shell('Credentials — set up', '<div class="co-form" style="max-width:440px;">' +
      '<p class="co-muted" style="margin:0 0 14px;">Create a master password. It encrypts the vault with AES-256-GCM (scrypt-derived key) and is never stored — there is no recovery. Kept in memory only while unlocked.</p>' +
      '<label class="co-label">Master password (min 8)</label><input id="cr-pw" class="co-input" type="password" autocomplete="new-password">' +
      '<label class="co-label" style="margin-top:10px;">Confirm</label><input id="cr-pw2" class="co-input" type="password" autocomplete="new-password">' +
      '<div id="cr-err" class="co-warn"></div>' +
      '<button class="co-btn co-btn--primary" id="cr-create" style="margin-top:12px;">Create vault</button></div>');
    root.querySelector('#cr-create').addEventListener('click', function () {
      var pw = root.querySelector('#cr-pw').value, pw2 = root.querySelector('#cr-pw2').value;
      if (pw.length < 8) return err('At least 8 characters.');
      if (pw !== pw2) return err('Passwords do not match.');
      post('/api/credentials/setup', { password: pw }).then(function (r) { r.ok ? refresh() : err(r.j.error); });
    });
  }

  function renderUnlock() {
    root.innerHTML = shell('Credentials — locked', '<div class="co-form" style="max-width:440px;">' +
      '<label class="co-label">Master password</label><input id="cr-pw" class="co-input" type="password" autocomplete="current-password">' +
      '<div id="cr-err" class="co-warn"></div>' +
      '<button class="co-btn co-btn--primary" id="cr-unlock" style="margin-top:12px;">Unlock</button></div>');
    var pw = root.querySelector('#cr-pw'); pw.focus();
    function go() { post('/api/credentials/unlock', { password: pw.value }).then(function (r) { r.ok ? refresh() : err(r.j.error || 'wrong password'); }); }
    root.querySelector('#cr-unlock').addEventListener('click', go);
    pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
  }

  function renderVault() {
    root.innerHTML = shell('Credentials', '<div id="cr-list" class="co-body" style="padding:0;"><div class="kb-loading">Loading…</div></div>' +
      '<div class="cr-addwrap"><div class="co-title" style="font-size:12px;margin:18px 0 10px;">Add credential</div>' +
      '<div class="cr-grid">' +
      '<input id="cr-label" class="co-input" placeholder="Label (e.g. THM SSH box)">' +
      '<input id="cr-user" class="co-input" placeholder="Username">' +
      '<input id="cr-pass" class="co-input" type="password" placeholder="Password / key">' +
      '<input id="cr-url" class="co-input" placeholder="URL / host (optional)">' +
      '<input id="cr-notes" class="co-input" placeholder="Notes (optional)">' +
      '<button class="co-btn co-btn--primary" id="cr-add">Add</button></div></div>', true);
    root.querySelector('#cr-lock').addEventListener('click', function () { post('/api/credentials/lock').then(refresh); });
    root.querySelector('#cr-add').addEventListener('click', addEntry);
    loadList();
  }

  function loadList() {
    get('/api/credentials/list').then(function (r) {
      if (!r.ok) return refresh();
      var box = root.querySelector('#cr-list');
      var e = r.j.entries || [];
      if (!e.length) { box.innerHTML = '<div class="co-empty" style="padding:30px;">No credentials yet.</div>'; return; }
      box.innerHTML = '<table class="cr-table"><thead><tr><th>Label</th><th>Username</th><th>Password</th><th>URL</th><th></th></tr></thead><tbody>' +
        e.map(function (x) {
          return '<tr data-id="' + esc(x.id) + '"><td>' + esc(x.label) + '</td><td class="cr-mono">' + esc(x.username) + '</td>' +
            '<td class="cr-mono"><span class="cr-pw" data-pw="' + esc(x.id) + '">' + (x.has_password ? '••••••••' : '—') + '</span>' +
            (x.has_password ? ' <button class="cr-eye" data-reveal="' + esc(x.id) + '" title="Reveal">show</button>' : '') + '</td>' +
            '<td class="cr-mono">' + esc(x.url) + '</td>' +
            '<td><button class="cr-del" data-del="' + esc(x.id) + '" title="Delete">✕</button></td></tr>';
        }).join('') + '</tbody></table>';
      box.addEventListener('click', onListClick);
    });
  }

  function onListClick(e) {
    var rev = e.target.closest('[data-reveal]');
    if (rev) {
      var id = rev.getAttribute('data-reveal');
      var span = root.querySelector('.cr-pw[data-pw="' + id + '"]');
      if (rev.textContent === 'hide') { span.textContent = '••••••••'; rev.textContent = 'show'; return; }
      get('/api/credentials/reveal/' + encodeURIComponent(id)).then(function (r) {
        if (r.ok) { span.textContent = r.j.password; rev.textContent = 'hide'; }
      });
      return;
    }
    var d = e.target.closest('[data-del]');
    if (d) { del('/api/credentials/' + encodeURIComponent(d.getAttribute('data-del'))).then(loadList); }
  }

  function addEntry() {
    var body = {
      label: root.querySelector('#cr-label').value, username: root.querySelector('#cr-user').value,
      password: root.querySelector('#cr-pass').value, url: root.querySelector('#cr-url').value,
      notes: root.querySelector('#cr-notes').value,
    };
    if (!body.label.trim()) return;
    post('/api/credentials/add', body).then(function (r) { if (r.ok) renderVault(); });
  }

  function err(m) { var el = root.querySelector('#cr-err'); if (el) el.textContent = m || ''; }

  window.DeckViews.credentials = function (el) { root = el; refresh(); };
})();
