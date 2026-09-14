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

  function plan(ico, main, sub, nav) {
    return '<button class="hm-plan" data-go="' + nav + '"><span class="hm-plan-ico">' + ico + '</span>' +
      '<span class="hm-plan-main">' + main + (sub ? '<span class="hm-plan-sub">' + esc(sub) + '</span>' : '') + '</span>' +
      '<span class="hm-plan-arrow">→</span></button>';
  }

  window.DeckViews.home = function (root) {
    root.innerHTML = '<div class="co-body"><div class="kb-loading">Loading…</div></div>';
    var g = function (u, f) { return fetch(u).then(function (r) { return r.json(); }).catch(function () { return f; }); };
    Promise.all([
      g('/api/home/summary', { vault: {}, courses: {}, targets: {}, credentials: {}, recent_notes: [] }),
      g('/api/flashcards/stats', {}),
      g('/api/playbooks/list', { playbooks: [] }),
      g('/api/activity/summary', {})
    ]).then(function (res) {
      var d = res[0], fc = res[1] || {}, pbs = res[2].playbooks || [], act = res[3] || {};
      // ── Today plan ──
      var due = fc.due || 0;
      var nextPb = pbs.filter(function (p) { return p.total > 0 && p.done < p.total; })
        .sort(function (a, b) { return (b.done / b.total) - (a.done / a.total); })[0];
      var notes = d.recent_notes || [];
      var revisit = notes.length > 3 ? notes[3] : notes[notes.length - 1];
      var today = plan('🎴', due > 0 ? ('Review <b>' + due + '</b> cards due') : 'Reviews all caught up', due > 0 ? 'spaced repetition' : 'nice work', 'flashcards');
      if (nextPb) today += plan('📋', 'Continue “' + esc(nextPb.title) + '”', nextPb.done + '/' + nextPb.total + ' steps', 'playbooks');
      if (revisit) today += plan('📝', 'Revisit “' + esc(revisit.title) + '”', 'from your vault', 'knowledge');
      today += plan('🔥', '<b>' + (act.streak || 0) + '</b>-day streak', act.streak ? 'keep it going' : 'log a study action today', 'progress');

      var cred = d.credentials.configured ? (d.credentials.locked ? '🔒 locked' : '🔓 unlocked') : 'not set up';
      var tiles =
        tile('Notes in vault', (d.vault || {}).notes || 0, (d.vault || {}).ok ? 'browse knowledge' : 'vault missing', 'knowledge') +
        tile('Courses', (d.courses || {}).count || 0, ((d.courses || {}).items || 0) + ' items indexed', 'courses') +
        tile('Targets', (d.targets || {}).count || 0, ((d.targets || {}).findings || 0) + ' findings · ' + ((d.targets || {}).high || 0) + ' high+', 'targets') +
        tile('Credentials', d.credentials && d.credentials.configured ? '•••' : '—', cred, 'credentials');
      var recent = notes.map(function (n) {
        return '<button class="hm-note" data-note="' + esc(n.path) + '"><span class="hm-note-t">' + esc(n.title) + '</span>' +
          '<span class="hm-note-p">' + esc(n.path) + '</span></button>';
      }).join('') || '<div class="co-muted">No notes yet.</div>';
      root.innerHTML = '<div class="co-body">' +
        '<div class="deck-panel-title" style="margin-bottom:12px;">Today</div>' +
        '<div class="hm-today">' + today + '</div>' +
        '<div class="deck-panel-title" style="margin:26px 0 12px;">Overview</div>' +
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
