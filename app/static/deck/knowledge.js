/*
 * Knowledge view — Obsidian-style folder tree + rendered note, off /api/knowledge.
 * Registers into deck.js via window.DeckViews.knowledge.
 */
(function () {
  'use strict';

  var expanded = {};   // path -> bool
  var current = null;   // active note path
  var treeData = null;

  function fileSvg() {
    return '<svg class="kb-file-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  }
  function folderSvg() {
    return '<svg class="kb-folder-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M3 7a2 2 0 0 1 2-2h3.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
  }
  function chevron(open) {
    return '<svg class="kb-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(' + (open ? 90 : 0) + 'deg)"><polyline points="9 18 15 12 9 6"/></svg>';
  }

  function renderItems(items, depth) {
    var html = '';
    items.forEach(function (it) {
      var pad = 'padding-left:' + (8 + depth * 14) + 'px';
      if (it.type === 'folder') {
        var open = !!expanded[it.path];
        html += '<div class="kb-row kb-folder" data-folder="' + esc(it.path) + '" style="' + pad + '">' +
          chevron(open) + folderSvg() + '<span class="kb-name">' + esc(it.name) + '</span>' +
          '<span class="kb-count">' + it.count + '</span></div>';
        if (open) html += '<div class="kb-children">' + renderItems(it.children || [], depth + 1) + '</div>';
      } else {
        var on = current === it.path ? ' kb-file--on' : '';
        html += '<div class="kb-row kb-file' + on + '" data-file="' + esc(it.path) + '" style="' + pad + '">' +
          fileSvg() + '<span class="kb-name">' + esc(it.name) + '</span></div>';
      }
    });
    return html;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function drawTree(rootEl) {
    var side = rootEl.querySelector('#kb-tree');
    side.innerHTML = renderItems(treeData.children || [], 0);
  }

  var currentRaw = '';

  function openNote(rootEl, path) {
    current = path;
    var pane = rootEl.querySelector('#kb-note');
    pane.innerHTML = '<div class="kb-loading">Loading…</div>';
    fetch('/api/knowledge/note?path=' + encodeURIComponent(path))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) { pane.innerHTML = '<div class="kb-loading">' + esc(d.error) + '</div>'; return; }
        currentRaw = d.raw || '';
        fetch('/api/activity/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'read' }) });
        pane.innerHTML =
          '<div class="kb-note-head"><span>' + esc(d.title) + '</span>' +
          '<button class="kb-edit-btn" id="kb-fc">⚡ Flashcards</button>' +
          '<button class="kb-edit-btn" id="kb-edit">Edit</button></div>' +
          '<div id="kb-fc-bar"></div>' +
          '<div class="md-body">' + d.html + '</div>' +
          '<div id="kb-backlinks"></div>';
        pane.scrollTop = 0;
        loadBacklinks(rootEl, path);
      })
      .catch(function () { pane.innerHTML = '<div class="kb-loading">Failed to load note.</div>'; });
    drawTree(rootEl);  // refresh active highlight
  }

  function makeFlashcards(rootEl) {
    var bar = rootEl.querySelector('#kb-fc-bar');
    if (!bar) return;
    bar.innerHTML = '<div class="co-muted" style="padding:6px 0;">Generating…</div>';
    fetch('/api/flashcards/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: current }) })
      .then(function (r) { return r.json(); }).then(function (g) {
        var cards = g.proposed || [];
        if (!cards.length) { bar.innerHTML = '<div class="co-muted" style="padding:6px 0;">No clear Q&amp;A found in this note.</div>'; return; }
        bar.innerHTML = '<div class="co-fc-bar">Proposed ' + cards.length + ' — <button class="kb-edit-btn" id="kb-fc-save">Save to “' + esc(g.deck) + '”</button><span id="kb-fc-msg" class="co-muted"></span></div>';
        bar.querySelector('#kb-fc-save').addEventListener('click', function () {
          var saved = 0;
          cards.reduce(function (ch, cd) {
            return ch.then(function () { return fetch('/api/flashcards/card', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ front: cd.front, back: cd.back, deck: g.deck }) }).then(function () { saved++; }); });
          }, Promise.resolve()).then(function () { bar.querySelector('#kb-fc-msg').textContent = ' Saved ' + saved + ' ✓'; });
        });
      }).catch(function () { bar.innerHTML = '<div class="co-warn">Generation failed.</div>'; });
  }

  function loadBacklinks(rootEl, path) {
    fetch('/api/knowledge/backlinks?path=' + encodeURIComponent(path)).then(function (r) { return r.json(); }).then(function (d) {
      var box = rootEl.querySelector('#kb-backlinks'); if (!box) return;
      var bl = d.backlinks || [];
      if (!bl.length) return;
      box.innerHTML = '<div class="kb-bl-head">// ' + bl.length + ' linked mention' + (bl.length === 1 ? '' : 's') + '</div>' +
        bl.map(function (b) { return '<button class="kb-bl" data-file="' + esc(b.path) + '">' + esc(b.title) + '</button>'; }).join('');
    });
  }

  function editNote(rootEl) {
    var pane = rootEl.querySelector('#kb-note');
    pane.innerHTML = '<div class="kb-note-head"><span>Editing — ' + esc(current) + '</span>' +
      '<span style="margin-left:auto;display:flex;gap:8px;"><button class="kb-edit-btn" id="kb-cancel">Cancel</button>' +
      '<button class="co-btn co-btn--primary" id="kb-save">Save</button></span></div>' +
      '<textarea id="kb-editor" class="kb-editor" spellcheck="false"></textarea>';
    var ta = pane.querySelector('#kb-editor');
    ta.value = currentRaw;
    ta.focus();
    wireAutocomplete(ta);
    pane.querySelector('#kb-cancel').addEventListener('click', function () { if (ta._acCleanup) ta._acCleanup(); openNote(rootEl, current); });
    pane.querySelector('#kb-save').addEventListener('click', function () {
      var content = ta.value;
      if (ta._acCleanup) ta._acCleanup();
      fetch('/api/knowledge/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: current, content: content }) })
        .then(function (r) { return r.json(); }).then(function () { if (window.Deck) Deck.toast('Saved'); openNote(rootEl, current); });
    });
  }

  function resolveWiki(rootEl, target) {
    fetch('/api/knowledge/resolve?target=' + encodeURIComponent(target)).then(function (r) { return r.json(); }).then(function (d) {
      if (d.path) openNote(rootEl, d.path);
      else if (window.Deck) Deck.toast('No note named "' + target + '"', 'error');
    });
  }

  function reloadTree(rootEl, thenOpen) {
    fetch('/api/knowledge/tree').then(function (r) { return r.json(); }).then(function (d) {
      treeData = d.tree; drawTree(rootEl); if (thenOpen) openNote(rootEl, thenOpen);
    });
  }

  function newNoteModal(rootEl) {
    Deck.modal({
      title: 'New note', width: 460,
      body: '<label class="co-label">Folder (optional)</label><input id="kb-nf" class="co-input" placeholder="e.g. 03-thm-notes">' +
        '<label class="co-label">Name</label><input id="kb-nn" class="co-input" placeholder="My note">',
      footer: '<button class="co-btn" id="kb-nc">Cancel</button><button class="co-btn co-btn--primary" id="kb-nok">Create</button>',
      onMount: function (m) {
        m.querySelector('#kb-nc').addEventListener('click', Deck.closeModal);
        m.querySelector('#kb-nok').addEventListener('click', function () {
          var name = m.querySelector('#kb-nn').value.trim(); if (!name) return;
          fetch('/api/knowledge/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: m.querySelector('#kb-nf').value, name: name }) })
            .then(function (r) { return r.json(); }).then(function (d) {
              if (d.error) { Deck.toast(d.error, 'error'); return; }
              Deck.closeModal(); Deck.toast('Note created');
              var parts = d.path.split('/'); var acc = '';
              for (var i = 0; i < parts.length - 1; i++) { acc = acc ? acc + '/' + parts[i] : parts[i]; expanded[acc] = true; }
              reloadTree(rootEl, d.path);
            });
        });
      },
    });
  }

  // ---- Tags -------------------------------------------------------------
  function showAllTags(rootEl) {
    current = null;
    var pane = rootEl.querySelector('#kb-note');
    pane.innerHTML = '<div class="kb-loading">Loading tags…</div>';
    drawTree(rootEl);
    fetch('/api/knowledge/tags').then(function (r) { return r.json(); }).then(function (d) {
      var tags = d.tags || [];
      if (!tags.length) { pane.innerHTML = '<div class="kb-loading">No #tags in the vault yet.</div>'; return; }
      pane.innerHTML = '<div class="kb-note-head"><span># Tags <span class="co-muted">(' + tags.length + ')</span></span></div>' +
        '<div class="kb-tagcloud">' +
        tags.map(function (t) {
          return '<button class="md-tag kb-tagchip" data-tag="' + esc(t.tag) + '">#' + esc(t.tag) + '<span class="kb-tagn">' + t.count + '</span></button>';
        }).join('') + '</div>';
      pane.scrollTop = 0;
    });
  }

  function showTag(rootEl, tag) {
    var pane = rootEl.querySelector('#kb-note');
    pane.innerHTML = '<div class="kb-loading">Loading #' + esc(tag) + '…</div>';
    fetch('/api/knowledge/tags').then(function (r) { return r.json(); }).then(function (d) {
      var hit = (d.tags || []).filter(function (t) { return t.tag.toLowerCase() === tag.toLowerCase(); })[0];
      var notes = hit ? hit.notes : [];
      pane.innerHTML = '<div class="kb-note-head"><button class="kb-edit-btn" id="kb-tagback">← Tags</button>' +
        '<span style="margin-left:8px;">#' + esc(tag) + ' <span class="co-muted">(' + notes.length + ')</span></span></div>' +
        '<div class="kb-taglist">' +
        notes.map(function (n) {
          return '<button class="kb-bl" data-file="' + esc(n.path) + '"><span class="kb-bl-t">' + esc(n.title) + '</span><span class="kb-bl-p">' + esc(n.path) + '</span></button>';
        }).join('') + '</div>';
      pane.scrollTop = 0;
    });
  }

  // ---- [[ ]] autocomplete ----------------------------------------------
  var noteCache = null;
  function ensureNotes(cb) {
    if (noteCache) { cb(noteCache); return; }
    fetch('/api/knowledge/notes').then(function (r) { return r.json(); }).then(function (d) { noteCache = d.notes || []; cb(noteCache); });
  }

  // Pixel position of the textarea caret, via a hidden mirror element.
  function caretXY(ta) {
    var mirror = document.createElement('div');
    var s = getComputedStyle(ta);
    ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'wordSpacing',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth'].forEach(function (p) { mirror.style[p] = s[p]; });
    mirror.style.position = 'absolute'; mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap'; mirror.style.wordWrap = 'break-word';
    mirror.style.width = ta.clientWidth + 'px';
    var r = ta.getBoundingClientRect();
    mirror.style.left = r.left + 'px'; mirror.style.top = r.top + 'px';
    mirror.textContent = ta.value.substring(0, ta.selectionStart);
    var marker = document.createElement('span'); marker.textContent = '​';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    var x = r.left + marker.offsetLeft - ta.scrollLeft;
    var y = r.top + marker.offsetTop - ta.scrollTop;
    var lh = parseFloat(s.lineHeight) || 18;
    document.body.removeChild(mirror);
    return { x: x, y: y + lh };
  }

  function wireAutocomplete(ta) {
    var pop = document.createElement('div');
    pop.className = 'kb-ac'; pop.style.display = 'none';
    document.body.appendChild(pop);
    var matches = [], sel = 0, queryStart = -1;

    function close() { pop.style.display = 'none'; queryStart = -1; matches = []; }

    function render() {
      if (!matches.length) { close(); return; }
      pop.innerHTML = matches.map(function (m, i) {
        return '<div class="kb-ac-item' + (i === sel ? ' on' : '') + '" data-i="' + i + '">' +
          '<span class="kb-ac-t">' + esc(m.title) + '</span><span class="kb-ac-p">' + esc(m.path) + '</span></div>';
      }).join('');
      var xy = caretXY(ta);
      pop.style.left = Math.round(xy.x) + 'px';
      pop.style.top = Math.round(xy.y) + 'px';
      pop.style.display = 'block';
    }

    function refresh() {
      var upto = ta.value.substring(0, ta.selectionStart);
      var m = /\[\[([^\]\n|]*)$/.exec(upto);
      if (!m) { close(); return; }
      queryStart = m.index;              // position of the "[["
      var q = m[1].toLowerCase();
      ensureNotes(function (notes) {
        matches = notes.filter(function (n) { return n.title.toLowerCase().indexOf(q) !== -1; }).slice(0, 8);
        sel = 0; render();
      });
    }

    function accept(i) {
      var m = matches[i]; if (!m) return;
      var before = ta.value.substring(0, queryStart);
      var after = ta.value.substring(ta.selectionStart);
      // strip an auto-inserted trailing ]] if present, then re-add cleanly.
      after = after.replace(/^\]\]/, '');
      var insert = '[[' + m.title + ']]';
      ta.value = before + insert + after;
      var caret = (before + insert).length;
      ta.setSelectionRange(caret, caret);
      close(); ta.focus();
    }

    ta.addEventListener('input', refresh);
    ta.addEventListener('keydown', function (e) {
      if (pop.style.display === 'none') return;
      if (e.key === 'ArrowDown') { sel = (sel + 1) % matches.length; render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = (sel - 1 + matches.length) % matches.length; render(); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === 'Tab') { accept(sel); e.preventDefault(); }
      else if (e.key === 'Escape') { close(); }
    });
    pop.addEventListener('mousedown', function (e) {
      var it = e.target.closest('.kb-ac-item'); if (!it) return;
      e.preventDefault(); accept(parseInt(it.getAttribute('data-i'), 10));
    });
    ta.addEventListener('blur', function () { setTimeout(close, 150); });
    ta.addEventListener('scroll', function () { if (pop.style.display !== 'none') render(); });
    ta._acCleanup = function () { if (pop.parentNode) pop.parentNode.removeChild(pop); };
  }

  window.DeckViews.knowledge = function (root) {
    root.innerHTML =
      '<div class="kb-wrap">' +
      '  <div class="kb-side"><div class="kb-side-head">Vault<button class="kb-new-btn" id="kb-tags" title="Browse tags">#</button><button class="kb-new-btn" id="kb-new" title="New note">+</button></div><div id="kb-tree" class="kb-tree"></div></div>' +
      '  <div id="kb-note" class="kb-note"><div class="kb-loading">Select a note from the vault.</div></div>' +
      '</div>';

    root.addEventListener('click', function (e) {
      var tg = e.target.closest('.md-tag');
      if (tg) { showTag(root, tg.getAttribute('data-tag') || tg.textContent.replace(/^#/, '')); return; }
      var wl = e.target.closest('.md-wikilink');
      if (wl) { resolveWiki(root, wl.getAttribute('data-target') || wl.textContent); return; }
      if (e.target.closest('#kb-tagback')) { showAllTags(root); return; }
      if (e.target.closest('#kb-tags')) { showAllTags(root); return; }
      if (e.target.closest('#kb-edit')) { editNote(root); return; }
      if (e.target.closest('#kb-fc')) { makeFlashcards(root); return; }
      if (e.target.closest('#kb-new')) { newNoteModal(root); return; }
      var bl = e.target.closest('.kb-bl');
      if (bl) { openNote(root, bl.getAttribute('data-file')); return; }
      var folder = e.target.closest('.kb-folder');
      if (folder) { var p = folder.getAttribute('data-folder'); expanded[p] = !expanded[p]; drawTree(root); return; }
      var file = e.target.closest('.kb-file');
      if (file) openNote(root, file.getAttribute('data-file'));
    });

    fetch('/api/knowledge/tree').then(function (r) { return r.json(); }).then(function (d) {
      if (!d.exists) {
        root.querySelector('#kb-tree').innerHTML = '<div class="kb-loading">Vault not found:<br>' + esc(d.root) + '</div>';
        return;
      }
      treeData = d.tree;
      // auto-expand top level
      (treeData.children || []).forEach(function (c) { if (c.type === 'folder') expanded[c.path] = true; });
      // deep-link from the command palette: open a specific note + expand its folders
      var pending = window.__deckPendingNote;
      if (pending) {
        window.__deckPendingNote = null;
        var parts = pending.split('/'); var acc = '';
        for (var i = 0; i < parts.length - 1; i++) { acc = acc ? acc + '/' + parts[i] : parts[i]; expanded[acc] = true; }
        drawTree(root);
        openNote(root, pending);
      } else {
        drawTree(root);
      }
    });
  };
})();
