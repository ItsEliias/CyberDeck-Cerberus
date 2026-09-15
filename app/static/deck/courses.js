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
  var listFilter = 'all';   // all | active | completed

  var ST_LABEL = { planned: 'Planned', 'in-progress': 'In progress', completed: 'Completed' };
  function statusOf(c) { return c.status || (c.kind === 'manual' ? 'completed' : 'in-progress'); }
  function stBadge(c) {
    var s = statusOf(c);
    return '<span class="co-st co-st--' + s + '">' + (ST_LABEL[s] || s) + '</span>';
  }

  function courseCard(c) {
    var chips = Object.keys(c.counts || {}).map(function (k) { return '<span class="co-chip">' + esc(catLabel(k)) + ' ' + c.counts[k] + '</span>'; }).join('');
    var meta = [];
    if (c.provider) meta.push(esc(c.provider));
    meta.push(c.kind === 'manual' ? 'logged manually' : (c.total || 0) + ' items');
    var pct = c.percent || 0;
    var bar = pct > 0 && pct < 100 ? '<div class="co-cardbar"><div class="co-cardbar-f" style="width:' + pct + '%"></div></div>' : '';
    return '<button class="co-card" data-course="' + esc(c.id) + '">' +
      '<div class="co-card-title">' + esc(c.title) + stBadge(c) + '</div>' +
      '<div class="co-card-meta">' + meta.join(' · ') + '</div>' + bar +
      (chips ? '<div class="co-chips">' + chips + '</div>' : '') + '</button>';
  }

  function showList() {
    scanCache = null;
    root.innerHTML = '<div class="co-head"><span class="co-title">Courses</span>' +
      '<button class="co-btn" id="co-add-manual">+ Add manually</button>' +
      '<button class="co-btn" id="co-import-url">+ Import URL</button>' +
      '<button class="co-btn co-btn--primary" id="co-import">+ Import folder</button></div>' +
      '<div id="co-body" class="co-body"><div class="kb-loading">Loading…</div></div>';
    root.querySelector('#co-import').addEventListener('click', showImport);
    root.querySelector('#co-import-url').addEventListener('click', showUrlImport);
    root.querySelector('#co-add-manual').addEventListener('click', showManual);
    get('/api/courses/list').then(function (d) {
      var body = root.querySelector('#co-body');
      var list = d.courses || [];
      if (!list.length) {
        body.innerHTML = '<div class="co-empty">No courses yet.<br><b>Import folder</b> — index course material already on your disk (docs, notes, videos, code).<br><b>Import URL</b> — pull a free article, lesson, or cheat sheet from the web as a markdown course.<br><b>Add manually</b> — log a course you finished elsewhere (no files needed).</div>';
        return;
      }
      var done = list.filter(function (c) { return statusOf(c) === 'completed'; }).length;
      function draw() {
        var shown = list.filter(function (c) {
          var s = statusOf(c);
          return listFilter === 'all' || (listFilter === 'completed' ? s === 'completed' : s !== 'completed');
        });
        var tabs = ['all', 'active', 'completed'].map(function (f) {
          var lbl = f === 'all' ? 'All (' + list.length + ')' : f === 'completed' ? 'Completed (' + done + ')' : 'Active (' + (list.length - done) + ')';
          return '<button class="co-tab' + (listFilter === f ? ' co-tab--on' : '') + '" data-filter="' + f + '">' + lbl + '</button>';
        }).join('');
        body.innerHTML = '<div class="co-tabs">' + tabs + '</div>' +
          (shown.length ? '<div class="co-grid">' + shown.map(courseCard).join('') + '</div>'
            : '<div class="co-empty">Nothing here yet.</div>');
        Array.prototype.forEach.call(body.querySelectorAll('[data-filter]'), function (t) {
          t.addEventListener('click', function () { listFilter = t.getAttribute('data-filter'); draw(); });
        });
        Array.prototype.forEach.call(body.querySelectorAll('[data-course]'), function (el) {
          el.addEventListener('click', function () { showDetail(el.getAttribute('data-course')); });
        });
      }
      draw();
    });
  }

  function showManual() {
    Deck.modal({
      title: 'Add a course manually', width: 500,
      body: '<label class="co-label">Course title *</label><input id="cm-title" class="co-input" placeholder="e.g. TryHackMe — Jr Penetration Tester">' +
        '<label class="co-label">Provider</label><input id="cm-prov" class="co-input" placeholder="TryHackMe, Udemy, Coursera…">' +
        '<label class="co-label">Link (optional)</label><input id="cm-url" class="co-input" placeholder="https://…">' +
        '<label class="co-label">Status</label><select id="cm-status" class="co-input"><option value="completed">Completed</option><option value="in-progress">In progress</option><option value="planned">Planned</option></select>' +
        '<label class="co-label">Notes / what you learned</label><textarea id="cm-notes" class="co-input" rows="3" placeholder="Key takeaways, certificate ID, dates…"></textarea>',
      footer: '<button class="co-btn" id="cm-cancel">Cancel</button><button class="co-btn co-btn--primary" id="cm-ok">Add course</button>',
      onMount: function (m) {
        m.querySelector('#cm-cancel').addEventListener('click', Deck.closeModal);
        m.querySelector('#cm-ok').addEventListener('click', function () {
          var title = m.querySelector('#cm-title').value.trim();
          if (!title) { Deck.toast('Title is required', 'error'); return; }
          post('/api/courses/manual', {
            title: title, provider: m.querySelector('#cm-prov').value.trim(),
            url: m.querySelector('#cm-url').value.trim(), status: m.querySelector('#cm-status').value,
            notes: m.querySelector('#cm-notes').value.trim(),
          }).then(function (d) {
            if (d.error) { Deck.toast(d.error, 'error'); return; }
            Deck.closeModal(); Deck.toast('Course added'); showDetail(d.course.id);
          });
        });
      },
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
      '<div class="co-muted">Fetches a freely-accessible page (article, lesson, cheat sheet) and saves it as a markdown course. A <b>YouTube</b> link imports the video transcript. With crawl on, it follows same-section links to pull a whole multi-page guide. Pages behind a login or paywall won\'t work.</div>' +
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
      var yt = /youtube\.com|youtu\.be/i.test(url);
      var crawl = !yt && root.querySelector('#co-crawl').checked;
      res.innerHTML = '<div class="kb-loading">' + (yt ? 'Fetching transcript…' : crawl ? 'Crawling the section (this can take a minute)…' : 'Fetching…') + '</div>';
      post(yt ? '/api/courses/youtube' : '/api/courses/fetch-url', { url: url, title: titleEl.value.trim(), crawl: crawl }).then(function (d) {
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
      var manual = c.kind === 'manual' || !c.total;
      var st = statusOf(c), pct = c.percent || 0;
      var stBtns = ['planned', 'in-progress', 'completed'].map(function (s) {
        return '<button class="co-stbtn' + (st === s ? ' co-stbtn--on co-stbtn--' + s : '') + '" data-st="' + s + '">' + ST_LABEL[s] + '</button>';
      }).join('');
      var statusbar = '<div class="co-statusbar">' +
        '<div class="co-stbtns">' + stBtns + '</div>' +
        '<div class="co-pctwrap"><input type="range" min="0" max="100" step="5" value="' + pct + '" id="co-pct"><span id="co-pctv" class="co-pctv">' + pct + '%</span></div>' +
        (c.provider ? '<span class="co-provider">' + esc(c.provider) + '</span>' : '') +
        (c.url ? '<a class="co-extlink" href="' + esc(c.url) + '" target="_blank" rel="noopener">Open ↗</a>' : '') +
        (manual ? '' : '<button class="co-btn co-btn--primary" id="co-mkquiz" style="margin-left:auto;">⚡ Make quiz from course</button>') +
        '</div>' +
        '<div class="co-notesrow"><textarea id="co-notes" class="co-input" rows="2" placeholder="Notes / what you learned…">' + esc(c.notes || '') + '</textarea>' +
        '<button class="co-btn" id="co-notes-save">Save notes</button><span id="co-notes-msg" class="co-muted"></span></div>' +
        assignmentsSection(c) +
        '<div id="co-quizbar"></div>';

      var main = manual
        ? '<div class="co-body co-manualbody">' + (c.notes ? '<div class="md-body"><p>' + esc(c.notes).replace(/\n/g, '<br>') + '</p></div>' : '<div class="co-muted">No files — this course was logged manually. Add notes above.</div>') + '</div>'
        : '<div class="kb-wrap"><div class="kb-side"><div class="kb-side-head">' + c.total + ' items</div>' +
          '<div class="co-itemlist">' + (listHtml || '<div class="kb-loading">Empty.</div>') + '</div></div>' +
          '<div id="co-preview" class="kb-note"><div class="kb-loading">Select an item to preview.</div></div></div>';

      root.innerHTML = '<div class="co-head"><button class="co-btn" id="co-back">← Courses</button>' +
        '<span class="co-title" style="margin-left:10px;">' + esc(c.title) + '</span>' +
        '<button class="co-btn co-btn--danger" id="co-del" style="margin-left:auto;">Delete</button></div>' +
        statusbar + main;

      root.querySelector('#co-back').addEventListener('click', showList);
      Array.prototype.forEach.call(root.querySelectorAll('.co-item'), function (el) {
        el.addEventListener('click', function () { preview(cid, el.getAttribute('data-path'), el.getAttribute('data-cat'), el); });
      });
      wireStatus(cid);
      wireAssignments(cid);
      var mq = root.querySelector('#co-mkquiz');
      if (mq) mq.addEventListener('click', function () { makeQuizFromCourse(cid, c.title); });
    });
  }

  // ── Assignments checklist (task #8) ──────────────────────────────────────────────
  function assignmentsSection(c) {
    var items = c.assignments || [];
    var done = items.filter(function (a) { return a.done; }).length;
    var rows = items.map(function (a) {
      return '<div class="co-asg" data-aid="' + a.id + '">' +
        '<label class="co-asg-lbl"><input type="checkbox" class="co-asg-cb"' + (a.done ? ' checked' : '') + '>' +
        '<span class="co-asg-txt' + (a.done ? ' co-asg-txt--done' : '') + '">' + esc(a.text) + '</span></label>' +
        '<button class="co-asg-del" title="Remove">×</button></div>';
    }).join('');
    return '<div class="co-asgwrap">' +
      '<div class="co-asg-head">Assignments &amp; tasks' + (items.length ? ' <span class="co-muted">' + done + '/' + items.length + ' done</span>' : '') + '</div>' +
      '<div class="co-asglist">' + (rows || '<div class="co-muted" style="margin:0 0 6px;">No tasks yet — add assignments, labs or milestones to track.</div>') + '</div>' +
      '<div class="co-asg-add"><input class="co-input" id="co-asg-new" placeholder="Add an assignment or task…"><button class="co-btn" id="co-asg-addbtn">Add</button></div>' +
      '</div>';
  }

  function wireAssignments(cid) {
    function refresh() { showDetail(cid); }
    function send(body) { return post('/api/courses/assignments/' + encodeURIComponent(cid), body); }
    var addInput = root.querySelector('#co-asg-new');
    function add() {
      var t = addInput.value.trim(); if (!t) return;
      send({ action: 'add', text: t }).then(refresh);
    }
    var addBtn = root.querySelector('#co-asg-addbtn');
    if (addBtn) addBtn.addEventListener('click', add);
    if (addInput) addInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
    Array.prototype.forEach.call(root.querySelectorAll('.co-asg'), function (row) {
      var aid = +row.getAttribute('data-aid');
      var cb = row.querySelector('.co-asg-cb');
      if (cb) cb.addEventListener('change', function () { send({ action: 'toggle', id: aid }).then(refresh); });
      var del = row.querySelector('.co-asg-del');
      if (del) del.addEventListener('click', function () { send({ action: 'remove', id: aid }).then(refresh); });
    });
  }

  function makeQuizFromCourse(cid, title) {
    var bar = root.querySelector('#co-quizbar');
    if (!bar) return;
    bar.innerHTML = '<div class="co-quizbox"><span class="co-muted">Reading course material…</span></div>';
    fetch('/api/courses/course-text/' + encodeURIComponent(cid)).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error || !d.text) { bar.innerHTML = '<div class="co-quizbox co-warn">No readable text found in this course.</div>'; return; }
      bar.innerHTML = '<div class="co-quizbox"><span class="co-muted">Building questions from ' + d.files + ' file' + (d.files === 1 ? '' : 's') + '…</span></div>';
      post('/api/flashcards/generate', { text: d.text, deck: title }).then(function (g) {
        var cards = g.proposed || [];
        if (!cards.length) { bar.innerHTML = '<div class="co-quizbox co-warn">Couldn’t find clear Q&amp;A in this course’s text.</div>'; return; }
        bar.innerHTML = '<div class="co-quizbox">Proposed <b>' + cards.length + '</b> questions — ' +
          '<button class="co-btn co-btn--primary" id="co-quiz-save">Save to “' + esc(g.deck) + '” deck</button>' +
          '<span id="co-quiz-msg" class="co-muted"></span></div>';
        root.querySelector('#co-quiz-save').addEventListener('click', function () {
          var saved = 0;
          cards.reduce(function (ch, cd) {
            return ch.then(function () { return post('/api/flashcards/card', { front: cd.front, back: cd.back, deck: g.deck }).then(function () { saved++; }); });
          }, Promise.resolve()).then(function () {
            root.querySelector('#co-quiz-msg').innerHTML = ' Saved ' + saved + ' ✓ — quiz them in <b>Quiz</b> or <b>Flashcards</b>.';
          });
        });
      }).catch(function () { bar.innerHTML = '<div class="co-quizbox co-warn">Generation failed.</div>'; });
    }).catch(function () { bar.innerHTML = '<div class="co-quizbox co-warn">Could not read course.</div>'; });
  }

  function wireStatus(cid) {
    function patch(body, then) {
      post('/api/courses/status/' + encodeURIComponent(cid), body).then(function (d) {
        if (d.error) { Deck.toast(d.error, 'error'); return; }
        if (then) then(d.course);
      });
    }
    Array.prototype.forEach.call(root.querySelectorAll('.co-stbtn'), function (b) {
      b.addEventListener('click', function () {
        patch({ status: b.getAttribute('data-st') }, function () { showDetail(cid); });
      });
    });
    var pct = root.querySelector('#co-pct'), pctv = root.querySelector('#co-pctv');
    if (pct) {
      pct.addEventListener('input', function () { pctv.textContent = pct.value + '%'; });
      pct.addEventListener('change', function () { patch({ percent: +pct.value }, function () { showDetail(cid); }); });
    }
    var ns = root.querySelector('#co-notes-save');
    if (ns) ns.addEventListener('click', function () {
      patch({ notes: root.querySelector('#co-notes').value }, function () {
        var msg = root.querySelector('#co-notes-msg'); if (msg) { msg.textContent = ' Saved ✓'; setTimeout(function () { msg.textContent = ''; }, 1800); }
      });
    });
    var del = root.querySelector('#co-del');
    if (del) del.addEventListener('click', function () {
      Deck.modal({
        title: 'Delete course?', width: 420,
        body: '<div class="co-muted">This removes the course record from CyberDeck. Your original files on disk are never touched.</div>',
        footer: '<button class="co-btn" id="cd-no">Cancel</button><button class="co-btn co-btn--danger" id="cd-yes">Delete</button>',
        onMount: function (m) {
          m.querySelector('#cd-no').addEventListener('click', Deck.closeModal);
          m.querySelector('#cd-yes').addEventListener('click', function () { Deck.closeModal(); doDelete(cid); });
        },
      });
    });
  }

  function doDelete(cid) {
    fetch('/api/courses/' + encodeURIComponent(cid), { method: 'DELETE' }).then(function (r) { return r.json(); }).then(function () {
      Deck.toast('Course deleted'); showList();
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
    if (/\.pdf$/i.test(name)) {
      pane.innerHTML = head + '<div class="co-fc-bar"><button class="co-btn" id="co-pdf-fc">⚡ Make flashcards</button><span id="co-pdf-msg" class="co-muted"></span></div>' +
        '<iframe class="co-frame" src="' + url + '"></iframe>';
      var pmsg = pane.querySelector('#co-pdf-msg');
      pane.querySelector('#co-pdf-fc').addEventListener('click', function () {
        pmsg.textContent = 'Extracting text…';
        fetch('/api/courses/pdf-text/' + encodeURIComponent(cid) + '?path=' + encodeURIComponent(path)).then(function (r) { return r.json(); }).then(function (pd) {
          if (pd.error || !pd.text) { pmsg.textContent = pd.error || 'No selectable text (scanned PDF?)'; return; }
          post('/api/flashcards/generate', { text: pd.text, deck: curCourseTitle || name }).then(function (g) {
            var cards = g.proposed || [];
            if (!cards.length) { pmsg.textContent = 'No clear Q&A found in this PDF.'; return; }
            pmsg.innerHTML = 'Proposed ' + cards.length + ' — <button class="co-btn co-btn--primary" id="co-pdf-save">Save to “' + esc(g.deck) + '”</button>';
            pane.querySelector('#co-pdf-save').addEventListener('click', function () {
              var saved = 0;
              cards.reduce(function (ch, cd) { return ch.then(function () { return post('/api/flashcards/card', { front: cd.front, back: cd.back, deck: g.deck }).then(function () { saved++; }); }); }, Promise.resolve()).then(function () { pmsg.textContent = 'Saved ' + saved + ' ✓'; });
            });
          });
        }).catch(function () { pmsg.textContent = 'Extraction failed.'; });
      });
      return;
    }
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
