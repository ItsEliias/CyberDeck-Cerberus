/*
 * Topology view — interactive host graph (SVG), off /api/topology.
 * Add nodes, drag to position, connect mode to link, import target hosts, delete.
 */
(function () {
  'use strict';
  var root = null, g = { nodes: [], edges: [], kinds: [] };
  var mode = 'select', connectFrom = null, selected = null, drag = null;

  var COLORS = { host: '#4a9eff', router: '#f5a623', firewall: '#e0632a', subnet: '#7c5cfc', service: '#41d1a7', attacker: '#c0392b' };
  function color(k) { return COLORS[k] || 'var(--red)'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function get(u) { return fetch(u).then(function (r) { return r.json(); }); }
  function post(u, b) { return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(function (r) { return r.json(); }); }
  function del(u) { return fetch(u, { method: 'DELETE' }).then(function (r) { return r.json(); }); }

  function view(el) {
    root = el;
    root.innerHTML = '<div class="co-head"><span class="co-title">Topology</span>' +
      '<input id="tp-label" class="co-input" placeholder="Node label (host/IP)" style="max-width:200px;margin-left:12px;">' +
      '<select id="tp-kind" class="co-input" style="max-width:120px;"></select>' +
      '<button class="co-btn" id="tp-add">+ Node</button>' +
      '<button class="co-btn" id="tp-connect">Connect</button>' +
      '<button class="co-btn" id="tp-import">Import targets</button>' +
      '<button class="co-btn" id="tp-del" style="margin-left:auto;">Delete selected</button></div>' +
      '<div class="tp-canvas"><svg id="tp-svg" viewBox="0 0 840 600" preserveAspectRatio="xMidYMid meet"></svg>' +
      '<div class="tp-hint" id="tp-hint">Add nodes, drag to arrange. Click <b>Connect</b> then two nodes to link them.</div></div>';
    load();
    root.querySelector('#tp-add').addEventListener('click', addNode);
    root.querySelector('#tp-connect').addEventListener('click', function () { mode = mode === 'connect' ? 'select' : 'connect'; connectFrom = null; syncMode(); });
    root.querySelector('#tp-import').addEventListener('click', function () { post('/api/topology/import-targets').then(function (r) { hint('Imported ' + (r.added || 0) + ' target host(s).'); load(); }); });
    root.querySelector('#tp-del').addEventListener('click', function () { if (selected) del('/api/topology/node/' + selected).then(function () { selected = null; load(); }); });
    root.querySelector('#tp-label').addEventListener('keydown', function (e) { if (e.key === 'Enter') addNode(); });
  }

  function syncMode() {
    var b = root.querySelector('#tp-connect');
    b.classList.toggle('co-btn--primary', mode === 'connect');
    hint(mode === 'connect' ? 'Connect mode: click a source node, then a target node.' : 'Select mode. Drag nodes to arrange.');
  }
  function hint(t) { var el = root.querySelector('#tp-hint'); if (el) el.innerHTML = t; }

  function load() {
    get('/api/topology/graph').then(function (d) {
      g = d;
      var sel = root.querySelector('#tp-kind');
      if (sel && !sel.options.length) sel.innerHTML = d.kinds.map(function (k) { return '<option>' + k + '</option>'; }).join('');
      render();
    });
  }

  function addNode() {
    var label = root.querySelector('#tp-label').value.trim();
    var kind = root.querySelector('#tp-kind').value;
    if (!label) return;
    post('/api/topology/node', { label: label, kind: kind }).then(function () { root.querySelector('#tp-label').value = ''; load(); });
  }

  function node(id) { return g.nodes.filter(function (n) { return n.id === id; })[0]; }

  function render() {
    var svg = root.querySelector('#tp-svg');
    var edges = g.edges.map(function (e) {
      var a = node(e.from), b = node(e.to); if (!a || !b) return '';
      return '<line class="tp-edge" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" data-edge="' + e.id + '"/>';
    }).join('');
    var nodes = g.nodes.map(function (n) {
      var on = n.id === selected ? ' tp-node--on' : '';
      return '<g class="tp-node' + on + '" data-node="' + n.id + '" transform="translate(' + n.x + ',' + n.y + ')">' +
        '<circle r="22" fill="' + color(n.kind) + '"/>' +
        '<text class="tp-node-label" y="40" text-anchor="middle">' + esc(n.label) + '</text>' +
        '<text class="tp-node-kind" y="4" text-anchor="middle">' + esc((n.kind || '')[0].toUpperCase()) + '</text></g>';
    }).join('');
    svg.innerHTML = edges + nodes;
    if (!g.nodes.length) hint('Empty graph. Add a node, or Import targets.');
    wire(svg);
  }

  function svgPoint(svg, evt) {
    var pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    var m = svg.getScreenCTM().inverse(); var p = pt.matrixTransform(m); return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  function wire(svg) {
    svg.querySelectorAll('.tp-node').forEach(function (gEl) {
      var id = gEl.getAttribute('data-node');
      gEl.addEventListener('mousedown', function (evt) {
        if (mode === 'connect') {
          if (!connectFrom) { connectFrom = id; selected = id; render(); hint('Now click the target node.'); }
          else if (connectFrom !== id) { post('/api/topology/edge', { from: connectFrom, to: id }).then(function () { connectFrom = null; mode = 'select'; selected = null; syncMode(); load(); }); }
          return;
        }
        selected = id; drag = { id: id }; render();
        evt.preventDefault();
      });
    });
    svg.querySelectorAll('.tp-edge').forEach(function (l) {
      l.addEventListener('dblclick', function () { del('/api/topology/edge/' + l.getAttribute('data-edge')).then(load); });
    });
    svg.onmousemove = function (evt) {
      if (!drag) return;
      var p = svgPoint(svg, evt); var n = node(drag.id); if (!n) return;
      n.x = p.x; n.y = p.y; render();
    };
    svg.onmouseup = function () {
      if (drag) { var n = node(drag.id); if (n) post('/api/topology/node/' + drag.id, { x: n.x, y: n.y }); drag = null; }
    };
    svg.onmouseleave = svg.onmouseup;
  }

  window.DeckViews.topology = view;
})();
