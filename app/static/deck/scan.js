/*
 * Scan Import view — paste nmap/gobuster output → parse → push to Targets + Board.
 */
(function () {
  'use strict';
  var root = null, lastText = '';
  function esc(s) { return (window.Deck ? Deck.esc : String)(s == null ? '' : s); }
  function post(u, b) { return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(function (r) { return r.json(); }); }

  function view(el) {
    root = el;
    root.innerHTML = '<div class="co-head"><span class="co-title">Scan Import</span></div>' +
      '<div class="co-body"><div class="co-muted" style="margin-bottom:8px;">Paste <b>nmap</b> or <b>gobuster/ffuf/feroxbuster</b> output. It parses locally — nothing is scanned.</div>' +
      '<textarea id="sc-in" class="co-input" rows="8" style="font-family:\'Fira Code\',monospace;font-size:12.5px;" placeholder="Nmap scan report for 10.10.10.5&#10;22/tcp   open  ssh     OpenSSH 8.2&#10;80/tcp   open  http    nginx 1.18"></textarea>' +
      '<button class="co-btn co-btn--primary" id="sc-parse" style="margin-top:10px;">Parse</button>' +
      '<div id="sc-out"></div></div>';
    root.querySelector('#sc-parse').addEventListener('click', function () {
      lastText = root.querySelector('#sc-in').value;
      post('/api/scan/parse', { text: lastText }).then(renderParsed);
    });
  }

  function renderParsed(d) {
    var out = root.querySelector('#sc-out');
    if (!d.ports.length && !d.paths.length) { out.innerHTML = '<div class="co-warn" style="margin-top:14px;">Nothing parsed — check the format.</div>'; return; }
    var portsTable = d.ports.length ? '<div class="deck-panel-title" style="margin:18px 0 8px;">Open ports (' + d.ports.length + ')</div>' +
      '<table class="cr-table"><thead><tr><th>Port</th><th>Service</th><th>Version</th></tr></thead><tbody>' +
      d.ports.map(function (p) { return '<tr><td class="cr-mono">' + p.port + '/' + p.proto + '</td><td>' + esc(p.service) + '</td><td class="cr-mono">' + esc(p.version) + '</td></tr>'; }).join('') + '</tbody></table>' : '';
    var pathsList = d.paths.length ? '<div class="deck-panel-title" style="margin:18px 0 8px;">Paths (' + d.paths.length + ')</div>' +
      '<div class="sn-list">' + d.paths.slice(0, 60).map(function (p) { return '<div class="sn-item" style="padding:6px 10px;"><span class="cr-mono">' + esc(p.path) + '</span> <span class="co-chip" style="margin-left:8px;">' + p.status + '</span></div>'; }).join('') + '</div>' : '';
    out.innerHTML =
      '<div style="margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
      '<span class="co-muted">Host: <b>' + esc(d.host || '—') + '</b> · tool: ' + esc(d.tool) + '</span>' +
      (d.ports.length ? '<button class="co-btn co-btn--primary" id="sc-tgt" style="margin-left:auto;">Create target (' + d.ports.length + ' ports)</button>' +
        '<button class="co-btn" id="sc-brd">Add ' + d.ports.length + ' board cards</button>' : '') +
      '</div>' + portsTable + pathsList;
    if (d.ports.length) {
      out.querySelector('#sc-tgt').addEventListener('click', function () {
        post('/api/scan/to-target', { text: lastText, host: d.host, name: d.host || 'Imported target' })
          .then(function (r) { Deck.toast('Target created with ' + r.ports + ' ports'); document.querySelector('[data-nav="targets"]').click(); });
      });
      out.querySelector('#sc-brd').addEventListener('click', function () {
        post('/api/scan/to-board', { text: lastText, host: d.host })
          .then(function (r) { Deck.toast(r.added + ' cards added to Attack Board'); document.querySelector('[data-nav="board"]').click(); });
      });
    }
  }

  window.DeckViews.scan = view;
})();
