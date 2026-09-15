/*
 * Map view — force-directed graph of the vault's [[wikilinks]], off /api/knowledge/graph.
 * Lightweight canvas physics (repulsion + springs + gravity, cooling). Click a node to open.
 */
(function () {
  'use strict';
  var root = null, raf = null;
  function go(id) { var el = document.querySelector('[data-nav="' + id + '"]'); if (el) el.click(); }

  function view(el) { root = el; load(); }

  function load() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    root.innerHTML = '<div class="co-head"><span class="co-title">Map</span></div>' +
      '<div class="co-body" style="padding:0;"><div class="mp-wrap"><canvas class="mp-canvas" id="mp-cv"></canvas>' +
      '<div class="mp-hint">Note-link graph — click a node to open Knowledge</div></div></div>';
    fetch('/api/knowledge/graph').then(function (r) { return r.json(); }).then(start);
  }

  function start(g) {
    var nodes = g.nodes || [], edges = g.edges || [];
    var cv = root.querySelector('#mp-cv'); if (!cv) return;
    if (!nodes.length) { cv.parentNode.innerHTML = '<div class="co-empty" style="padding:30px;">No links yet.<br>Connect notes with <code>[[wikilinks]]</code> and they’ll graph here.</div>'; return; }
    var byId = {}; nodes.forEach(function (n) { byId[n.id] = n; });
    var links = edges.filter(function (e) { return byId[e.s] && byId[e.t]; }).map(function (e) { return { s: byId[e.s], t: byId[e.t] }; });
    var ctx = cv.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 2), W = 0, H = 0;
    function resize() { var r = cv.parentNode.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    resize();
    nodes.forEach(function (n, i) { var a = i / nodes.length * Math.PI * 2, rr = Math.min(W, H) * 0.3; n.x = W / 2 + Math.cos(a) * rr * (0.4 + Math.random()); n.y = H / 2 + Math.sin(a) * rr * (0.4 + Math.random()); n.vx = 0; n.vy = 0; });
    var alpha = 1, hover = null;
    var cs = getComputedStyle(document.documentElement);
    var accent = (cs.getPropertyValue('--deck-accent') || '#c0392b').trim();
    var fg = (cs.getPropertyValue('--fg') || '#cccccc').trim();
    var border = (cs.getPropertyValue('--border') || '#333333').trim();

    function tick() {
      for (var i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        for (var j = i + 1; j < nodes.length; j++) {
          var b = nodes[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 0.01, d = Math.sqrt(d2), f = 900 / d2, fx = dx / d * f, fy = dy / d * f;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
      }
      links.forEach(function (l) { var dx = l.t.x - l.s.x, dy = l.t.y - l.s.y, d = Math.sqrt(dx * dx + dy * dy) + 0.01, f = (d - 70) * 0.02, fx = dx / d * f, fy = dy / d * f; l.s.vx += fx; l.s.vy += fy; l.t.vx -= fx; l.t.vy -= fy; });
      nodes.forEach(function (n) { n.vx += (W / 2 - n.x) * 0.008; n.vy += (H / 2 - n.y) * 0.008; n.vx *= 0.82; n.vy *= 0.82; n.x += n.vx * alpha; n.y += n.vy * alpha; n.x = Math.max(12, Math.min(W - 12, n.x)); n.y = Math.max(12, Math.min(H - 12, n.y)); });
      alpha *= 0.985;
      draw();
      raf = alpha > 0.02 ? requestAnimationFrame(tick) : null;
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = border; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
      links.forEach(function (l) { ctx.beginPath(); ctx.moveTo(l.s.x, l.s.y); ctx.lineTo(l.t.x, l.t.y); ctx.stroke(); });
      ctx.globalAlpha = 1;
      nodes.forEach(function (n) { var rad = 4 + Math.min(n.deg, 10) * 1.2; ctx.beginPath(); ctx.arc(n.x, n.y, rad, 0, Math.PI * 2); ctx.fillStyle = (n === hover) ? accent : fg; ctx.globalAlpha = (n === hover) ? 1 : 0.85; ctx.fill(); });
      ctx.globalAlpha = 1; ctx.fillStyle = fg; ctx.font = '11px "Fira Code", monospace';
      nodes.forEach(function (n) { if (n === hover || n.deg >= 5) { ctx.globalAlpha = (n === hover) ? 1 : 0.6; ctx.fillText(n.label, n.x + 7, n.y + 3); } });
      ctx.globalAlpha = 1;
    }
    function nodeAt(mx, my) { var best = null, bd = 1e9; nodes.forEach(function (n) { var dx = n.x - mx, dy = n.y - my, d = dx * dx + dy * dy, rad = 4 + Math.min(n.deg, 10) * 1.2; if (d < Math.max(rad * rad, 110) && d < bd) { bd = d; best = n; } }); return best; }
    cv.addEventListener('mousemove', function (e) { var r = cv.getBoundingClientRect(); hover = nodeAt(e.clientX - r.left, e.clientY - r.top); cv.style.cursor = hover ? 'pointer' : 'grab'; if (!raf) draw(); });
    cv.addEventListener('click', function (e) { var r = cv.getBoundingClientRect(); if (nodeAt(e.clientX - r.left, e.clientY - r.top)) go('knowledge'); });
    window.addEventListener('resize', function () { if (root.querySelector('#mp-cv') === cv) { resize(); if (!raf) draw(); } });
    tick();
  }

  window.DeckViews = window.DeckViews || {};
  window.DeckViews.map = view;
})();
