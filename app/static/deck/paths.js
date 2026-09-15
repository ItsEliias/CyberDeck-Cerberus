/*
 * Learning Paths view — curated study roadmaps, off /api/paths. Each path is an ordered
 * checklist whose steps jump into the relevant module (course, deck, playbook, quiz…).
 */
(function () {
  'use strict';
  var root = null;
  function esc(s) { return (window.Deck ? Deck.esc : String)(s == null ? '' : s); }
  function get(u) { return fetch(u).then(function (r) { return r.json(); }); }
  function go(id) { var el = document.querySelector('[data-nav="' + id + '"]'); if (el) el.click(); }

  function view(el) { root = el; list(); }

  function list() {
    root.innerHTML = '<div class="co-head"><span class="co-title">Learning Paths</span></div><div class="co-body" id="lp-body"><div class="kb-loading">Loading…</div></div>';
    get('/api/paths/list').then(function (d) {
      root.querySelector('#lp-body').innerHTML = (d.paths || []).map(function (p) {
        var pct = p.total ? Math.round(p.done / p.total * 100) : 0;
        return '<button class="lp-card" data-path="' + esc(p.id) + '"><div class="lp-card-top"><span class="lp-title">' + esc(p.title) + '</span><span class="lp-pct">' + p.done + '/' + p.total + '</span></div>' +
          '<div class="lp-blurb">' + esc(p.blurb) + '</div><div class="lp-bar"><div class="lp-bar-fill" style="width:' + pct + '%"></div></div></button>';
      }).join('');
      Array.prototype.forEach.call(root.querySelectorAll('[data-path]'), function (b) { b.addEventListener('click', function () { detail(b.getAttribute('data-path')); }); });
    });
  }

  function detail(pid) {
    get('/api/paths/' + pid).then(function (p) {
      root.innerHTML = '<div class="co-head"><button class="co-btn" id="lp-back">← Paths</button><span class="co-title" style="margin-left:10px;">' + esc(p.title) + '</span></div>' +
        '<div class="co-body"><p class="deck-muted">' + esc(p.blurb) + '</p><div class="lp-steps">' +
        p.steps.map(function (s) {
          return '<div class="lp-step' + (s.done ? ' lp-step--done' : '') + '"><button class="lp-check" data-step="' + s.i + '" data-done="' + (s.done ? 1 : 0) + '">' + (s.done ? '✓' : '') + '</button>' +
            '<span class="lp-step-text">' + esc(s.text) + '</span>' + (s.nav ? '<button class="co-btn lp-go" data-go="' + esc(s.nav) + '">Open</button>' : '') + '</div>';
        }).join('') + '</div></div>';
      root.querySelector('#lp-back').addEventListener('click', list);
      Array.prototype.forEach.call(root.querySelectorAll('.lp-check'), function (b) {
        b.addEventListener('click', function () {
          var done = b.getAttribute('data-done') !== '1';
          fetch('/api/paths/' + pid + '/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step: +b.getAttribute('data-step'), done: done }) }).then(function () { detail(pid); });
        });
      });
      Array.prototype.forEach.call(root.querySelectorAll('.lp-go'), function (b) { b.addEventListener('click', function () { go(b.getAttribute('data-go')); }); });
    });
  }

  window.DeckViews = window.DeckViews || {};
  window.DeckViews.paths = view;
})();
