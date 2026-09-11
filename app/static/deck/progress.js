/*
 * Progress view — streak, activity heatmap, totals, vault coverage. /api/activity + tree.
 */
(function () {
  'use strict';
  function esc(s) { return (window.Deck ? Deck.esc : String)(s == null ? '' : s); }

  function level(c) { return c === 0 ? 0 : c < 3 ? 1 : c < 6 ? 2 : c < 12 ? 3 : 4; }

  function heatmap(days) {
    // 140 days → 20 columns of 7 (week-aligned by index). Simple week grid.
    var cells = days.map(function (d) {
      return '<div class="pg-cell pg-l' + level(d.count) + '" title="' + d.date + ': ' + d.count + ' action' + (d.count === 1 ? '' : 's') + '"></div>';
    }).join('');
    return '<div class="pg-heat">' + cells + '</div>';
  }

  function view(root) {
    root.innerHTML = '<div class="co-head"><span class="co-title">Progress</span></div><div class="co-body" id="pg-body"><div class="kb-loading">Loading…</div></div>';
    Promise.all([
      fetch('/api/activity/summary').then(function (r) { return r.json(); }),
      fetch('/api/knowledge/tree').then(function (r) { return r.json(); }).catch(function () { return { tree: { children: [] } }; }),
    ]).then(function (res) {
      var a = res[0], tree = res[1].tree || { children: [] };
      var body = root.querySelector('#pg-body');
      var kinds = Object.keys(a.by_kind || {}).map(function (k) { return '<span class="co-chip">' + esc(k) + ' ' + a.by_kind[k] + '</span>'; }).join('') || '<span class="co-muted">no activity logged yet</span>';
      var cover = (tree.children || []).filter(function (c) { return c.type === 'folder'; }).map(function (f) {
        return '<div class="pg-cov"><span class="pg-cov-name">' + esc(f.name) + '</span><span class="pg-cov-n">' + (f.count || 0) + '</span></div>';
      }).join('');
      body.innerHTML =
        '<div class="pg-stats">' +
        stat(a.streak + '🔥', 'day streak') + stat(a.longest, 'longest streak') +
        stat(a.today, 'today') + stat(a.week, 'this week') + stat(a.total, 'all-time actions') +
        '</div>' +
        '<div class="deck-panel-title" style="margin:26px 0 10px;">Activity — last 20 weeks</div>' +
        heatmap(a.heatmap || []) +
        '<div class="pg-legend">less <span class="pg-cell pg-l0"></span><span class="pg-cell pg-l1"></span><span class="pg-cell pg-l2"></span><span class="pg-cell pg-l3"></span><span class="pg-cell pg-l4"></span> more</div>' +
        '<div class="deck-panel-title" style="margin:26px 0 10px;">By type</div><div class="co-chips">' + kinds + '</div>' +
        '<div class="deck-panel-title" style="margin:26px 0 10px;">Vault coverage</div><div class="pg-covwrap">' + cover + '</div>';
    });
  }
  function stat(v, l) { return '<div class="pg-stat"><div class="pg-stat-v">' + v + '</div><div class="pg-stat-l">' + esc(l) + '</div></div>'; }

  window.DeckViews.progress = view;
})();
