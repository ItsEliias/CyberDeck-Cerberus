/*
 * Courses view — platform-agnostic importer + browser, off /api/courses.
 * States: list → import wizard → detail (item list + preview). Indexes in place.
 */
(function () {
  'use strict';

  var root = null;
  var scanCache = null;   // last scan result during import
  var curCourseTitle = '';   // title of the course currently open in detail (deck name for flashcards)

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
      '<button class="co-btn" id="co-import-url">+ Import URL</button>' +
      '<button class="co-btn co-btn--primary" id="co-import">+ Import folder</button></div>' +
      '<div id="co-body" class="co-body"><div class="kb-loading">Loading…</div></div>';
    root.querySelector('#co-import').addEventListener('click', showImport);
    root.querySelector('#co-import-url').addEventListener('click', showUrlImport);
    get('/api/courses/list').then(function (d) {
      var body = root.querySelector('#co-body');
      var list = d.courses || [];
      if (!list.length) {
        body.innerHTML = '<div class="co-empty">No courses yet.<br><b>Import folder</b> — index course material already on your disk (docs, notes, videos, code).<br><b>Import URL</b> — pull a free article, lesson, or cheat sheet from the web as a markdown course.</div>';
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

  // ── Import from URL ─────────────────────────────────────────────────────────────
  var _OWASP = 'https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master/cheatsheets/';
  var RECOMMENDED = [
    { t: 'SQL Injection Prevention', u: _OWASP + 'SQL_Injection_Prevention_Cheat_Sheet.md' },
    { t: 'Cross-Site Scripting (XSS) Prevention', u: _OWASP + 'Cross_Site_Scripting_Prevention_Cheat_Sheet.md' },
    { t: 'Authentication', u: _OWASP + 'Authentication_Cheat_Sheet.md' },
    { t: 'Authorization', u: _OWASP + 'Authorization_Cheat_Sheet.md' },
    { t: 'Access Control', u: _OWASP + 'Access_Control_Cheat_Sheet.md' },
    { t: 'Password Storage', u: _OWASP + 'Password_Storage_Cheat_Sheet.md' },
    { t: 'Session Management', u: _OWASP + 'Session_Management_Cheat_Sheet.md' },
    { t: 'Input Validation', u: _OWASP + 'Input_Validation_Cheat_Sheet.md' },
    { t: 'CSRF Prevention', u: _OWASP + 'Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.md' },
    { t: 'File Upload', u: _OWASP + 'File_Upload_Cheat_Sheet.md' },
    { t: 'Cryptographic Storage', u: _OWASP + 'Cryptographic_Storage_Cheat_Sheet.md' },
    { t: 'REST Security', u: _OWASP + 'REST_Security_Cheat_Sheet.md' }
  ];

  function showUrlImport() {
    var rows = RECOMMENDED.map(function (r, i) {
      return '<div class="co-rec-row"><span class="co-rec-title">' + esc(r.t) + '</span>' +
        '<button class="co-btn co-rec-btn" data-import="' + i + '">Import</button></div>';
    }).join('');
    root.innerHTML = '<div class="co-head"><span class="co-title">Import from URL</span>' +
      '<button class="co-btn" id="co-cancel">Cancel</button></div>' +
      '<div class="co-body"><div class="co-form">' +
      '<label class="co-label">Page URL</label>' +
      '<input id="co-url" class="co-input" placeholder="https://portswigger.net/web-security/sql-injection" />' +
      '<label class="co-label" style="margin-top:10px;">Title (optional)</label>' +
      '<input id="co-url-title" class="co-input" placeholder="Auto-detected from the page" />' +
      '<label class="co-check" style="margin-top:10px;"><input type="checkbox" id="co-crawl"> Crawl linked pages in the same section (whole guide, up to 40 pages)</label>' +
      '<div class="co-row" style="margin-top:12px;"><button class="co-btn co-btn--primary" id="co-url-go">Fetch &amp; import</button></div>' +
      '<div class="co-muted">Fetches a freely-accessible page (article, lesson, cheat sheet) and saves it as a markdown course. With crawl on, it follows same-section links to pull a whole multi-page guide. Pages behind a login or paywall won\'t work.</div>' +
      '<div id="co-url-res"></div>' +
      '<div class="co-rec"><div class="co-rec-head"><span>Recommended — OWASP Cheat Sheets (free, CC-BY-SA)</span>' +
      '<button class="co-btn" id="co-rec-all">Import all</button></div>' + rows + '</div>' +
      '</div></div>';
    root.querySelector('#co-cancel').addEventListener('click', showList);
    var urlEl = root.querySelector('#co-url');
    var titleEl = root.querySelector('#co-url-title');
    var res = root.querySelector('#co-url-res');
    function go() {
      var url = urlEl.value.trim();
      if (!/^https?:\/\//i.test(url)) { res.innerHTML = '<div class="co-warn">Enter a full http(s):// URL.</div>'; return; }
      var crawl = root.querySelector('#co-crawl').checked;
      res.innerHTML = '<div class="kb-loading">' + (crawl ? 'Crawling the section (this can take a minute)…' : 'Fetching…') + '</div>';
      post('/api/courses/fetch-url', { url: url, title: titleEl.value.trim(), crawl: crawl }).then(function (d) {
        if (d.course) showDetail(d.course.id);
        else res.innerHTML = '<div class="co-warn">' + esc(d.error || 'Import failed.') + '</div>';
      }).catch(function () { res.innerHTML = '<div class="co-warn">Import failed.</div>'; });
    }
    root.querySelector('#co-url-go').addEventListener('click', go);
    urlEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });

    // One recommended resource → returns a promise; updates its own button.
    function importOne(btn) {
      var r = RECOMMENDED[+btn.getAttribute('data-import')];
      if (btn.disabled) return Promise.resolve();
      btn.disabled = true; btn.textContent = '…';
      return post('/api/courses/fetch-url', { url: r.u }).then(function (d) {
        if (d.course) { btn.textContent = '✓ Imported'; btn.classList.add('co-rec-done'); }
        else { btn.disabled = false; btn.textContent = 'Retry'; btn.title = d.error || 'failed'; }
      }).catch(function () { btn.disabled = false; btn.textContent = 'Retry'; });
    }
    Array.prototype.forEach.call(root.querySelectorAll('[data-import]'), function (btn) {
      btn.addEventListener('click', function () { importOne(btn); });
    });
    root.querySelector('#co-rec-all').addEventListener('click', function () {
      var btns = Array.prototype.slice.call(root.querySelectorAll('[data-import]'));
      btns.reduce(function (chain, btn) { return chain.then(function () { return importOne(btn); }); }, Promise.resolve());
    });
    urlEl.focus();
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
      curCourseTitle = c.title || '';
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
        pane.innerHTML = head +
          '<div class="co-fc-bar"><button class="co-btn" id="co-mkfc">⚡ Make flashcards</button>' +
          '<span id="co-fc-msg" class="co-muted"></span></div>' +
          '<pre class="md-fallback">' + esc(t) + '</pre>';
        var msg = pane.querySelector('#co-fc-msg');
        pane.querySelector('#co-mkfc').addEventListener('click', function () {
          msg.textContent = 'Generating…';
          post('/api/flashcards/generate', { text: t, deck: curCourseTitle || name }).then(function (g) {
            var cards = g.proposed || [];
            if (!cards.length) { msg.textContent = 'No clear Q&A found in this file.'; return; }
            msg.innerHTML = 'Proposed ' + cards.length + ' — <button class="co-btn co-btn--primary" id="co-fc-save">Save to “' + esc(g.deck) + '”</button>';
            pane.querySelector('#co-fc-save').addEventListener('click', function () {
              var saved = 0;
              cards.reduce(function (ch, cd) {
                return ch.then(function () { return post('/api/flashcards/card', { front: cd.front, back: cd.back, deck: g.deck }).then(function () { saved++; }); });
              }, Promise.resolve()).then(function () { msg.textContent = 'Saved ' + saved + ' cards to Flashcards ✓'; });
            });
          }).catch(function () { msg.textContent = 'Generation failed.'; });
        });
      });
      return;
    }
    pane.innerHTML = head + '<div class="co-openext"><a href="' + url + '" target="_blank" rel="noopener">Open “' + esc(name) + '” in a new tab ↗</a></div>';
  }

  window.DeckViews.courses = function (el) { root = el; showList(); };
})();
