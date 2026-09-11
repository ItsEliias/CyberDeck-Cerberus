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
          '<button class="kb-edit-btn" id="kb-edit">Edit</button></div>' +
          '<div class="md-body">' + d.html + '</div>' +
          '<div id="kb-backlinks"></div>';
        pane.scrollTop = 0;
        loadBacklinks(rootEl, path);
      })
      .catch(function () { pane.innerHTML = '<div class="kb-loading">Failed to load note.</div>'; });
    drawTree(rootEl);  // refresh active highlight
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
    pane.querySelector('#kb-editor').value = currentRaw;
    pane.querySelector('#kb-editor').focus();
    pane.querySelector('#kb-cancel').addEventListener('click', function () { openNote(rootEl, current); });
    pane.querySelector('#kb-save').addEventListener('click', function () {
      var content = pane.querySelector('#kb-editor').value;
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

  window.DeckViews.knowledge = function (root) {
    root.innerHTML =
      '<div class="kb-wrap">' +
      '  <div class="kb-side"><div class="kb-side-head">Vault<button class="kb-new-btn" id="kb-new" title="New note">+</button></div><div id="kb-tree" class="kb-tree"></div></div>' +
      '  <div id="kb-note" class="kb-note"><div class="kb-loading">Select a note from the vault.</div></div>' +
      '</div>';

    root.addEventListener('click', function (e) {
      var wl = e.target.closest('.md-wikilink');
      if (wl) { resolveWiki(root, wl.getAttribute('data-target') || wl.textContent); return; }
      if (e.target.closest('#kb-edit')) { editNote(root); return; }
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
