/*
 * NetLab view — offline network calculators, off /api/netlab.
 * Subnet/CIDR breakdown + common-port reference. All local math, no network calls.
 */
(function () {
  'use strict';
  var root = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function get(u) { return fetch(u).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }); }

  function view(el) {
    root = el;
    root.innerHTML =
      '<div class="co-head"><span class="co-title">NetLab</span></div><div class="co-body">' +
      '<div class="deck-panel" style="margin:0 0 18px;max-width:none;">' +
      '<div class="deck-panel-title" style="margin-bottom:12px;">Subnet calculator</div>' +
      '<div class="co-row"><input id="nl-cidr" class="co-input" placeholder="e.g. 10.10.0.0/24  or  192.168.1.5 255.255.255.0" value="10.10.0.0/24">' +
      '<button class="co-btn co-btn--primary" id="nl-calc">Calculate</button></div>' +
      '<div id="nl-subres" style="margin-top:14px;"></div></div>' +
      '<div class="deck-panel" style="margin:0;max-width:none;">' +
      '<div class="deck-panel-title" style="margin-bottom:12px;">Common ports</div>' +
      '<input id="nl-portq" class="co-input" placeholder="Filter by number or service (e.g. 445, smb, sql)">' +
      '<div id="nl-ports" style="margin-top:12px;"></div></div></div>';

    var cidr = root.querySelector('#nl-cidr');
    root.querySelector('#nl-calc').addEventListener('click', calc);
    cidr.addEventListener('keydown', function (e) { if (e.key === 'Enter') calc(); });
    var pq = root.querySelector('#nl-portq');
    var t; pq.addEventListener('input', function () { clearTimeout(t); t = setTimeout(loadPorts, 150); });
    calc(); loadPorts();
  }

  function calc() {
    var q = root.querySelector('#nl-cidr').value.trim();
    var out = root.querySelector('#nl-subres');
    out.innerHTML = '<div class="kb-loading">…</div>';
    get('/api/netlab/subnet?cidr=' + encodeURIComponent(q)).then(function (r) {
      if (!r.ok) { out.innerHTML = '<div class="co-warn">' + esc(r.j.error || 'invalid input') + '</div>'; return; }
      var d = r.j;
      var rows = [
        ['Network', d.network], ['Broadcast', d.broadcast], ['Netmask', d.netmask], ['Wildcard', d.wildcard],
        ['Prefix', '/' + d.prefix + ' (IPv' + d.version + ')'], ['Usable hosts', d.usable_hosts.toLocaleString()],
        ['Host range', d.first_host ? (d.first_host + ' – ' + d.last_host) : '—'],
        ['Total addresses', d.total_addresses.toLocaleString()], ['Scope', d.is_private ? 'private' : 'public'],
      ];
      out.innerHTML = '<div class="nl-grid">' + rows.map(function (r2) {
        return '<div class="nl-cell"><span class="nl-k">' + r2[0] + '</span><span class="nl-v">' + esc(r2[1]) + '</span></div>';
      }).join('') + '</div>';
    });
  }

  function loadPorts() {
    var q = root.querySelector('#nl-portq').value.trim();
    var out = root.querySelector('#nl-ports');
    get('/api/netlab/ports?q=' + encodeURIComponent(q)).then(function (r) {
      var p = r.j.ports || [];
      if (!p.length) { out.innerHTML = '<div class="co-muted">No matches.</div>'; return; }
      out.innerHTML = '<div class="nl-ports">' + p.map(function (x) {
        return '<div class="nl-port"><span class="nl-port-n">' + x.port + '</span><span class="nl-port-s">' + esc(x.service) + '</span></div>';
      }).join('') + '</div>';
    });
  }

  window.DeckViews.netlab = view;
})();
