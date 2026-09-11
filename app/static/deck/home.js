/*
 * Home view — dashboard aggregating the modules, off /api/home/summary.
 */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function go(id) { var el = document.querySelector('[data-nav="' + id + '"]'); if (el) el.click(); }

  function tile(label, value, sub, nav) {
    return '<button class="hm-tile" data-go="' + nav + '"><div class="hm-tile-val">' + value + '</div>' +
      '<div class="hm-tile-label">' + esc(label) + '</div>' + (sub ? '<div class="hm-tile-sub">' + esc(sub) + '</div>' : '') + '</button>';
  }

  window.DeckViews.home = function (root) {
    root.innerHTML = '<div class="co-body"><div class="kb-loading">Loading…</div></div>';
    fetch('/api/home/summary').then(function (r) { return r.json(); }).then(function (d) {
      var cred = d.credentials.configured ? (d.credentials.locked ? '🔒 locked' : '🔓 unlocked') : 'not set up';
      var tiles =
        tile('Notes in vault', d.vault.notes, d.vault.ok ? 'browse knowledge' : 'vault missing', 'knowledge') +
        tile('Courses', d.courses.count, d.courses.items + ' items indexed', 'courses') +
        tile('Targets', d.targets.count, d.targets.findings + ' findings · ' + d.targets.high + ' high+', 'targets') +
        tile('Credentials', d.credentials.configured ? '•••' : '—', cred, 'credentials');
      var recent = (d.recent_notes || []).map(function (n) {
        return '<button class="hm-note" data-note="' + esc(n.path) + '"><span class="hm-note-t">' + esc(n.title) + '</span>' +
          '<span class="hm-note-p">' + esc(n.path) + '</span></button>';
      }).join('') || '<div class="co-muted">No notes yet.</div>';
      root.innerHTML = '<div class="co-body">' +
        '<div class="deck-panel-title" style="margin-bottom:12px;">Overview</div>' +
        '<div class="hm-tiles">' + tiles + '</div>' +
        '<div class="deck-panel-title" style="margin:26px 0 12px;">Recently updated notes</div>' +
        '<div class="hm-notes">' + recent + '</div></div>';
      root.querySelector('.co-body').addEventListener('click', function (e) {
        var t = e.target.closest('[data-go]'); if (t) return go(t.getAttribute('data-go'));
        var n = e.target.closest('[data-note]'); if (n) go('knowledge');
      });
    }).catch(function () { root.innerHTML = '<div class="co-body"><div class="co-warn">Failed to load summary.</div></div>'; });
  };
})();
