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
    return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
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
          chevron(open) + '<span class="kb-name">' + esc(it.name) + '</span>' +
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

  function openNote(rootEl, path) {
    current = path;
    var pane = rootEl.querySelector('#kb-note');
    pane.innerHTML = '<div class="kb-loading">Loading…</div>';
    fetch('/api/knowledge/note?path=' + encodeURIComponent(path))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.error) { pane.innerHTML = '<div class="kb-loading">' + esc(d.error) + '</div>'; return; }
        pane.innerHTML = '<div class="kb-note-head">' + esc(d.title) + '</div>' +
          '<div class="md-body">' + d.html + '</div>';
        pane.scrollTop = 0;
      })
      .catch(function () { pane.innerHTML = '<div class="kb-loading">Failed to load note.</div>'; });
    drawTree(rootEl);  // refresh active highlight
  }

  window.DeckViews.knowledge = function (root) {
    root.innerHTML =
      '<div class="kb-wrap">' +
      '  <div class="kb-side"><div class="kb-side-head">Vault</div><div id="kb-tree" class="kb-tree"></div></div>' +
      '  <div id="kb-note" class="kb-note"><div class="kb-loading">Select a note from the vault.</div></div>' +
      '</div>';

    root.addEventListener('click', function (e) {
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
      drawTree(root);
    });
  };
})();
