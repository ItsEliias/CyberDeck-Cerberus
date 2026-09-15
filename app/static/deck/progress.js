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
    var g = function (u, f) { return fetch(u).then(function (r) { return r.json(); }).catch(function () { return f; }); };
    Promise.all([
      g('/api/activity/summary', {}),
      g('/api/knowledge/tree', { tree: { children: [] } }),
      g('/api/courses/list', { courses: [] }),
      g('/api/flashcards/stats', {}),
      g('/api/flashcards/decks', { decks: [] }),
      g('/api/playbooks/list', { playbooks: [] }),
      g('/api/resources/list', { items: [] }),
      g('/api/ratings/list', { ratings: {} }),
    ]).then(function (res) {
      var a = res[0], tree = res[1].tree || { children: [] };
      var courses = res[2].courses || [], fc = res[3] || {}, decks = res[4].decks || [];
      var pbs = res[5].playbooks || [], rs = res[6] || {}, ratings = res[7].ratings || {};
      var body = root.querySelector('#pg-body');

      // ── What you've learned ──
      var pbDone = pbs.filter(function (p) { return p.total > 0 && p.done >= p.total; }).length;
      var learned = '<div class="pg-stats">' +
        stat(fc.mature || 0, 'cards mastered') +
        stat((fc.reviewed || 0) + '/' + (fc.total || 0), 'cards reviewed') +
        stat(pbDone + '/' + pbs.length, 'playbooks done') +
        stat(courses.length, 'courses') +
        stat(rs.count != null ? rs.count : (rs.items || []).length, 'bookmarks') +
        '</div>';
      // Topics covered — de-duped across decks, playbooks, courses.
      var seen = {}, uniq = [];
      decks.map(function (d) { return d.deck; })
        .concat(pbs.map(function (p) { return p.title; }))
        .concat(courses.map(function (c) { return c.title; }))
        .forEach(function (t) { var k = (t || '').toLowerCase(); if (t && !seen[k]) { seen[k] = 1; uniq.push(t); } });
      var topics = uniq.slice(0, 28).map(function (t) { return '<span class="co-chip">' + esc(t) + '</span>'; }).join('') ||
        '<span class="co-muted">import a course or review some cards to build this</span>';

      // ── Self-assessment (weak-area heatmap) ──
      var assess = uniq.slice(0, 24).map(function (t) {
        var r = ratings[t] || 0;
        var dots = [1, 2, 3, 4, 5].map(function (n) { return '<button class="sa-dot' + (n <= r ? ' sa-dot--on' : '') + '" data-topic="' + esc(t) + '" data-r="' + n + '" title="' + n + '/5"></button>'; }).join('');
        return '<div class="sa-row sa-r' + r + '"><span class="sa-topic">' + esc(t) + '</span><span class="sa-dots">' + dots + '</span></div>';
      }).join('') || '<span class="co-muted">rate topics once you have decks/courses</span>';

      var kinds = Object.keys(a.by_kind || {}).map(function (k) { return '<span class="co-chip">' + esc(k) + ' ' + a.by_kind[k] + '</span>'; }).join('') || '<span class="co-muted">no activity logged yet</span>';
      var cover = (tree.children || []).filter(function (c) { return c.type === 'folder'; }).map(function (f) {
        return '<div class="pg-cov"><span class="pg-cov-name">' + esc(f.name) + '</span><span class="pg-cov-n">' + (f.count || 0) + '</span></div>';
      }).join('');

      body.innerHTML =
        '<div class="deck-panel-title" style="margin:2px 0 10px;">What you’ve learned</div>' + learned +
        '<div class="deck-panel-title" style="margin:24px 0 10px;">Topics covered</div><div class="co-chips">' + topics + '</div>' +
        '<div class="deck-panel-title" style="margin:26px 0 10px;">Self-assessment <span class="co-muted" style="font-weight:400;text-transform:none;letter-spacing:0;">— rate your confidence; red = revisit</span></div>' +
        '<div class="sa-grid">' + assess + '</div>' +
        '<div class="deck-panel-title" style="margin:26px 0 10px;">Streak &amp; activity</div>' +
        '<div class="pg-stats">' +
        stat(a.streak + '🔥', 'day streak') + stat(a.longest || 0, 'longest') +
        stat(a.today || 0, 'today') + stat(a.week || 0, 'this week') + stat(a.total || 0, 'all-time') +
        '</div>' +
        '<div class="deck-panel-title" style="margin:26px 0 10px;">Activity — last 20 weeks</div>' +
        heatmap(a.heatmap || []) +
        '<div class="pg-legend">less <span class="pg-cell pg-l0"></span><span class="pg-cell pg-l1"></span><span class="pg-cell pg-l2"></span><span class="pg-cell pg-l3"></span><span class="pg-cell pg-l4"></span> more</div>' +
        '<div class="deck-panel-title" style="margin:26px 0 10px;">By type</div><div class="co-chips">' + kinds + '</div>' +
        '<div class="deck-panel-title" style="margin:26px 0 10px;">Vault coverage</div><div class="pg-covwrap">' + cover + '</div>';

      body.addEventListener('click', function (e) {
        var dot = e.target.closest ? e.target.closest('.sa-dot') : null;
        if (!dot) return;
        var topic = dot.getAttribute('data-topic'), r = +dot.getAttribute('data-r');
        var nr = (ratings[topic] || 0) === r ? 0 : r;   // click the same level to clear
        fetch('/api/ratings/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: topic, rating: nr }) })
          .then(function () { ratings[topic] = nr; view(root); });
      });
    });
  }
  function stat(v, l) { return '<div class="pg-stat"><div class="pg-stat-v">' + v + '</div><div class="pg-stat-l">' + esc(l) + '</div></div>'; }

  window.DeckViews.progress = view;
})();
