/*
 * Courses view — platform-agnostic importer + browser, off /api/courses.
 * States: list → import wizard → detail (item list + preview). Indexes in place.
 */
(function () {
  'use strict';

  var root = null;
  var scanCache = null;   // last scan result during import

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtBytes(n) { if (!n) return ''; var u = ['B', 'KB', 'MB', 'GB', 'TB']; var i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return n.toFixed(n < 10 && i > 0 ? 1 : 0) + ' ' + u[i]; }
  var CAT_LABEL = { docs: 'Docs & text', notes: 'Notes', video: 'Video', audio: 'Audio', code: 'Code', images: 'Images', other: 'Other' };
  function catLabel(c) { return CAT_LABEL[c] || c; }

  function get(url) { return fetch(url).then(function (r) { return r.json(); }); }
  function post(url, body) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }); }

  // ── List ──────────────────────────────────────────────────────────────────────
  function showList() {
    scanCache = null;
    root.innerHTML = '<div class="co-head"><span class="co-title">Courses</span>' +
      '<button class="co-btn co-btn--primary" id="co-import">+ Import course</button></div>' +
      '<div id="co-body" class="co-body"><div class="kb-loading">Loading…</div></div>';
    root.querySelector('#co-import').addEventListener('click', showImport);
    get('/api/courses/list').then(function (d) {
      var body = root.querySelector('#co-body');
      var list = d.courses || [];
      if (!list.length) {
        body.innerHTML = '<div class="co-empty">No courses yet.<br>Import a folder of downloaded course material to get started — docs, notes, videos, code.<br><span class="co-muted">Nothing is scraped; it reads files already on your disk and indexes them in place.</span></div>';
        return;
      }
      body.innerHTML = '<div class="co-grid">' + list.map(function (c) {
        var chips = Object.keys(c.counts || {}).map(function (k) { return '<span class="co-chip">' + esc(catLabel(k)) + ' ' + c.counts[k] + '</span>'; }).join('');
        return '<button class="co-card" data-course="' + esc(c.id) + '"><div class="co-card-title">' + esc(c.title) + '</div>' +
          '<div class="co-card-meta">' + (c.total || 0) + ' items</div><div class="co-chips">' + chips + '</div></button>';
      }).join('') + '</div>';
      Array.prototype.forEach.call(body.querySelectorAll('[data-course]'), function (el) {
        el.addEventListener('click', function () { showDetail(el.getAttribute('data-course')); });
      });
    });
  }

  // ── Import wizard ───────────────────────────────────────────────────────────────
  function showImport() {
    root.innerHTML = '<div class="co-head"><span class="co-title">Import course</span>' +
      '<button class="co-btn" id="co-cancel">Cancel</button></div>' +
      '<div class="co-body"><div class="co-form">' +
      '<label class="co-label">Source folder (absolute path)</label>' +
      '<div class="co-row"><input id="co-path" class="co-input" placeholder="/Users/you/Downloads/Some Course" />' +
      '<button class="co-btn co-btn--primary" id="co-scan">Scan</button></div>' +
      '<div class="co-muted">A folder you already have locally — an official app download, a resource pack, your own notes. Nothing leaves your machine.</div>' +
      '<div id="co-scanres"></div></div></div>';
    root.querySelector('#co-cancel').addEventListener('click', showList);
    var pathEl = root.querySelector('#co-path');
    root.querySelector('#co-scan').addEventListener('click', function () { doScan(pathEl.value.trim()); });
    pathEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') doScan(pathEl.value.trim()); });
    pathEl.focus();
  }

  function doScan(path) {
    if (!path) return;
    var out = root.querySelector('#co-scanres');
    out.innerHTML = '<div class="kb-loading">Scanning…</div>';
    get('/api/courses/scan?path=' + encodeURIComponent(path)).then(function (d) {
      if (!d.exists) { out.innerHTML = '<div class="co-warn">Folder not found: ' + esc(d.source || path) + '</div>'; return; }
      scanCache = d;
      var cats = d.categories || {};
      var keys = Object.keys(cats);
      if (!keys.length) { out.innerHTML = '<div class="co-warn">No importable files found in that folder.</div>'; return; }
      var rows = keys.map(function (k) {
        var b = cats[k];
        return '<label class="co-cat"><input type="checkbox" class="co-cat-cb" value="' + k + '" checked>' +
          '<span class="co-cat-name">' + esc(catLabel(k)) + '</span>' +
          '<span class="co-cat-meta">' + b.count + ' file' + (b.count === 1 ? '' : 's') + ' · ' + fmtBytes(b.bytes) + '</span>' +
          '<span class="co-cat-sample">' + (b.sample || []).slice(0, 3).map(esc).join(', ') + '</span></label>';
      }).join('');
      var defTitle = (path.replace(/[\/\\]+$/, '').split(/[\/\\]/).pop()) || 'Course';
      out.innerHTML = '<div class="co-scanhead">Found ' + d.total + ' files — tick what to import:</div>' +
        '<div class="co-cats">' + rows + '</div>' +
        '<label class="co-label" style="margin-top:14px;">Course name</label>' +
        '<input id="co-title" class="co-input" value="' + esc(defTitle) + '" />' +
        '<button class="co-btn co-btn--primary" id="co-do-import" style="margin-top:12px;">Import selected</button>';
      out.querySelector('#co-do-import').addEventListener('click', function () { doImport(path); });
    }).catch(function () { out.innerHTML = '<div class="co-warn">Scan failed.</div>'; });
  }

  function doImport(source) {
    var cats = Array.prototype.map.call(root.querySelectorAll('.co-cat-cb:checked'), function (cb) { return cb.value; });
    var title = (root.querySelector('#co-title') || {}).value || '';
    if (!cats.length) return;
    post('/api/courses/import', { source: source, categories: cats, title: title }).then(function (d) {
      if (d.error) { alert(d.error); return; }
      showDetail(d.course.id);
    });
  }

  // ── Detail (two-pane) ──────────────────────────────────────────────────────────
  function showDetail(cid) {
    root.innerHTML = '<div class="kb-loading">Loading…</div>';
    get('/api/courses/' + encodeURIComponent(cid)).then(function (d) {
      if (d.error) { root.innerHTML = '<div class="co-warn">' + esc(d.error) + '</div>'; return; }
      var c = d.course, cats = d.categories || {};
      var listHtml = Object.keys(cats).map(function (k) {
        var b = cats[k];
        var items = (b.items || []).map(function (it) {
          return '<div class="co-item" data-path="' + esc(it.path) + '" data-cat="' + k + '"><span class="co-item-name">' + esc(it.name) + '</span>' +
            '<span class="co-item-size">' + fmtBytes(it.size) + '</span></div>';
        }).join('');
        return '<div class="co-cat-group"><div class="co-cat-h">' + esc(catLabel(k)) + ' <span>' + b.count + '</span></div>' + items + '</div>';
      }).join('');
      root.innerHTML = '<div class="co-head"><button class="co-btn" id="co-back">← Courses</button>' +
        '<span class="co-title" style="margin-left:10px;">' + esc(c.title) + '</span></div>' +
        '<div class="kb-wrap"><div class="kb-side"><div class="kb-side-head">' + c.total + ' items</div>' +
        '<div class="co-itemlist">' + (listHtml || '<div class="kb-loading">Empty.</div>') + '</div></div>' +
        '<div id="co-preview" class="kb-note"><div class="kb-loading">Select an item to preview.</div></div></div>';
      root.querySelector('#co-back').addEventListener('click', showList);
      Array.prototype.forEach.call(root.querySelectorAll('.co-item'), function (el) {
        el.addEventListener('click', function () { preview(cid, el.getAttribute('data-path'), el.getAttribute('data-cat'), el); });
      });
    });
  }

  function preview(cid, path, cat, el) {
    Array.prototype.forEach.call(root.querySelectorAll('.co-item'), function (x) { x.classList.remove('co-item--on'); });
    if (el) el.classList.add('co-item--on');
    var pane = root.querySelector('#co-preview');
    var url = '/api/courses/file/' + encodeURIComponent(cid) + '?path=' + encodeURIComponent(path);
    var name = path.split(/[\/\\]/).pop();
    var head = '<div class="kb-note-head">' + esc(name) + '</div>';
    if (cat === 'video') { pane.innerHTML = head + '<video class="co-media" src="' + url + '" controls></video>'; return; }
    if (cat === 'audio') { pane.innerHTML = head + '<audio class="co-media" src="' + url + '" controls></audio>'; return; }
    if (cat === 'images') { pane.innerHTML = head + '<img class="co-media" src="' + url + '">'; return; }
    if (/\.pdf$/i.test(name)) { pane.innerHTML = head + '<iframe class="co-frame" src="' + url + '"></iframe>'; return; }
    if (cat === 'notes' || cat === 'code' || /\.(txt|srt|vtt|csv)$/i.test(name)) {
      pane.innerHTML = head + '<div class="kb-loading">Loading…</div>';
      fetch(url).then(function (r) { return r.text(); }).then(function (t) {
        pane.innerHTML = head + '<pre class="md-fallback">' + esc(t) + '</pre>';
      });
      return;
    }
    pane.innerHTML = head + '<div class="co-openext"><a href="' + url + '" target="_blank" rel="noopener">Open “' + esc(name) + '” in a new tab ↗</a></div>';
  }

  window.DeckViews.courses = function (el) { root = el; showList(); };
})();
