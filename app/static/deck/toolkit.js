/*
 * Toolkit view — offline security tools: encode/decode, hashes, hash-ID, regex,
 * subnet calc, and a ports/commands reference. All client-side except hashing
 * (POST /api/toolkit/hash, since WKWebView can't do SubtleCrypto over http + no MD5).
 */
(function () {
  'use strict';
  var root = null, tab = 'encode';
  function esc(s) { return (window.Deck ? Deck.esc : String)(s == null ? '' : s); }
  var TABS = [['encode', 'Encode / Decode'], ['hash', 'Hashes'], ['hashid', 'Hash ID'], ['regex', 'Regex'], ['subnet', 'Subnet'], ['ref', 'Reference']];

  function view(el) { root = el; render(); }
  function body() { return root.querySelector('#tk-body'); }

  function render() {
    root.innerHTML = '<div class="co-head"><span class="co-title">Toolkit</span></div>' +
      '<div class="tk-tabs">' + TABS.map(function (t) { return '<button class="tk-tab' + (t[0] === tab ? ' tk-tab--on' : '') + '" data-tab="' + t[0] + '">' + esc(t[1]) + '</button>'; }).join('') + '</div>' +
      '<div class="co-body" id="tk-body"></div>';
    Array.prototype.forEach.call(root.querySelectorAll('[data-tab]'), function (b) { b.addEventListener('click', function () { tab = b.getAttribute('data-tab'); render(); }); });
    ({ encode: encodeTab, hash: hashTab, hashid: hashidTab, regex: regexTab, subnet: subnetTab, ref: refTab }[tab])();
  }

  // ── Encode / Decode ──
  function b64e(s) { try { return btoa(unescape(encodeURIComponent(s))); } catch (e) { return 'error'; } }
  function b64d(s) { try { return decodeURIComponent(escape(atob(s.trim()))); } catch (e) { return 'invalid base64'; } }
  function hexe(s) { var o = ''; for (var i = 0; i < s.length; i++) o += ('0' + s.charCodeAt(i).toString(16)).slice(-2); return o; }
  function hexd(s) { s = s.replace(/[^0-9a-fA-F]/g, ''); var o = ''; for (var i = 0; i < s.length; i += 2) o += String.fromCharCode(parseInt(s.substr(i, 2), 16)); return o; }
  function rot13(s) { return s.replace(/[a-zA-Z]/g, function (c) { var b = c <= 'Z' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b); }); }
  function xorHex(s, key) { if (!key) return 'set a key'; var o = ''; for (var i = 0; i < s.length; i++) o += ('0' + (s.charCodeAt(i) ^ key.charCodeAt(i % key.length)).toString(16)).slice(-2); return o; }
  function jwt(s) { var p = s.trim().split('.'); if (p.length < 2) return 'not a JWT'; function d(x) { try { return JSON.stringify(JSON.parse(decodeURIComponent(escape(atob(x.replace(/-/g, '+').replace(/_/g, '/'))))), null, 2); } catch (e) { return '(unreadable)'; } } return 'HEADER\n' + d(p[0]) + '\n\nPAYLOAD\n' + d(p[1]); }

  function encodeTab() {
    body().innerHTML = '<textarea class="tk-in" id="tk-e-in" placeholder="Input…"></textarea>' +
      '<input class="co-input" id="tk-xor-key" placeholder="XOR key (for XOR op)" style="margin:8px 0;" />' +
      '<div class="tk-ops">' + [['b64e', 'Base64 ▸'], ['b64d', '◂ Base64'], ['hexe', 'Hex ▸'], ['hexd', '◂ Hex'], ['urle', 'URL ▸'], ['urld', '◂ URL'], ['rot13', 'ROT13'], ['xor', 'XOR ▸ hex'], ['jwt', 'JWT decode']].map(function (o) { return '<button class="co-btn tk-op" data-op="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      '<textarea class="tk-in tk-out" id="tk-e-out" readonly placeholder="Output"></textarea>';
    var inp = body().querySelector('#tk-e-in'), out = body().querySelector('#tk-e-out'), key = body().querySelector('#tk-xor-key');
    Array.prototype.forEach.call(body().querySelectorAll('.tk-op'), function (b) {
      b.addEventListener('click', function () {
        var s = inp.value, op = b.getAttribute('data-op');
        out.value = op === 'b64e' ? b64e(s) : op === 'b64d' ? b64d(s) : op === 'hexe' ? hexe(s) : op === 'hexd' ? hexd(s) :
          op === 'urle' ? encodeURIComponent(s) : op === 'urld' ? (function () { try { return decodeURIComponent(s); } catch (e) { return 'invalid'; } })() :
          op === 'rot13' ? rot13(s) : op === 'xor' ? xorHex(s, key.value) : op === 'jwt' ? jwt(s) : '';
      });
    });
  }

  // ── Hashes (backend) ──
  function hashTab() {
    body().innerHTML = '<textarea class="tk-in" id="tk-h-in" placeholder="Text to hash…"></textarea>' +
      '<div class="tk-ops"><button class="co-btn co-btn--primary" id="tk-h-go">Hash</button></div><div id="tk-h-out"></div>';
    body().querySelector('#tk-h-go').addEventListener('click', function () {
      var t = body().querySelector('#tk-h-in').value, o = body().querySelector('#tk-h-out');
      o.innerHTML = '<div class="kb-loading">Hashing…</div>';
      fetch('/api/toolkit/hash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) })
        .then(function (r) { return r.json(); }).then(function (d) {
          o.innerHTML = ['md5', 'sha1', 'sha256', 'sha512'].map(function (a) { return '<div class="tk-hrow"><span class="tk-hlabel">' + a.toUpperCase() + '</span><code class="tk-hval">' + esc(d[a]) + '</code></div>'; }).join('');
        }).catch(function () { o.innerHTML = '<div class="co-warn">Hashing failed.</div>'; });
    });
  }

  // ── Hash ID ──
  function hashidTab() {
    body().innerHTML = '<input class="co-input" id="tk-hid-in" placeholder="Paste a hash…" /><div id="tk-hid-out" class="tk-hid-out"></div>';
    var inp = body().querySelector('#tk-hid-in');
    inp.addEventListener('input', function () {
      var h = inp.value.trim(), out = body().querySelector('#tk-hid-out'), g = [];
      if (!h) { out.innerHTML = ''; return; }
      if (/^\$2[aby]\$/.test(h)) g.push('bcrypt');
      if (/^\$1\$/.test(h)) g.push('md5crypt');
      if (/^\$6\$/.test(h)) g.push('sha512crypt');
      if (/^\$y\$|^\$7\$/.test(h)) g.push('yescrypt');
      if (/^[a-f0-9]{32}$/i.test(h)) g.push('MD5', 'NTLM', 'MD4');
      if (/^[a-f0-9]{40}$/i.test(h)) g.push('SHA-1');
      if (/^[a-f0-9]{56}$/i.test(h)) g.push('SHA-224');
      if (/^[a-f0-9]{64}$/i.test(h)) g.push('SHA-256');
      if (/^[a-f0-9]{96}$/i.test(h)) g.push('SHA-384');
      if (/^[a-f0-9]{128}$/i.test(h)) g.push('SHA-512');
      out.innerHTML = g.length ? '<div class="co-muted" style="margin-bottom:6px;">Likely:</div>' + g.map(function (x) { return '<span class="co-chip">' + esc(x) + '</span>'; }).join('') : '<span class="co-muted">Unrecognised format.</span>';
    });
  }

  // ── Regex ──
  var RX = [['IPv4', '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b'], ['Email', '[\\w.+-]+@[\\w-]+\\.[\\w.-]+'], ['URL', 'https?://[^\\s"\'<>]+'], ['MD5', '\\b[a-f0-9]{32}\\b'], ['SHA-256', '\\b[a-f0-9]{64}\\b'], ['MAC', '(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}']];
  function regexTab() {
    body().innerHTML = '<div class="tk-row"><input class="co-input" id="tk-rx" placeholder="pattern" /><input class="co-input tk-flags" id="tk-rf" placeholder="flags" value="g" /></div>' +
      '<div class="tk-ops">' + RX.map(function (p, i) { return '<button class="co-btn tk-rx-p" data-i="' + i + '">' + esc(p[0]) + '</button>'; }).join('') + '</div>' +
      '<textarea class="tk-in" id="tk-rx-t" placeholder="test text…"></textarea><div id="tk-rx-o"></div>';
    var rx = body().querySelector('#tk-rx'), rf = body().querySelector('#tk-rf'), txt = body().querySelector('#tk-rx-t'), out = body().querySelector('#tk-rx-o');
    function run() {
      try {
        var re = new RegExp(rx.value, rf.value.replace(/[^gimsuy]/g, '')), m, ms = [];
        if (re.global) { while ((m = re.exec(txt.value)) !== null) { ms.push(m[0]); if (m.index === re.lastIndex) re.lastIndex++; if (ms.length > 200) break; } }
        else { m = re.exec(txt.value); if (m) ms.push(m[0]); }
        out.innerHTML = '<div class="co-muted">' + ms.length + ' match' + (ms.length === 1 ? '' : 'es') + '</div>' + ms.slice(0, 100).map(function (x) { return '<code class="tk-match">' + esc(x) + '</code>'; }).join(' ');
      } catch (e) { out.innerHTML = '<div class="co-warn">' + esc(e.message) + '</div>'; }
    }
    [rx, rf, txt].forEach(function (e) { e.addEventListener('input', run); });
    Array.prototype.forEach.call(body().querySelectorAll('.tk-rx-p'), function (b) { b.addEventListener('click', function () { rx.value = RX[+b.getAttribute('data-i')][1]; run(); }); });
  }

  // ── Subnet ──
  function subnetTab() {
    body().innerHTML = '<div class="tk-row"><input class="co-input" id="tk-cidr" placeholder="e.g. 192.168.1.0/24" /><button class="co-btn co-btn--primary" id="tk-cidr-go">Calc</button></div><div id="tk-cidr-o"></div>';
    function calc() {
      var v = body().querySelector('#tk-cidr').value.trim(), out = body().querySelector('#tk-cidr-o');
      var mm = v.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/);
      if (!mm) { out.innerHTML = '<div class="co-warn">Enter IP/prefix, e.g. 10.0.0.0/24</div>'; return; }
      var oct = [+mm[1], +mm[2], +mm[3], +mm[4]], p = +mm[5];
      if (p < 0 || p > 32 || oct.some(function (o) { return o > 255; })) { out.innerHTML = '<div class="co-warn">Out of range.</div>'; return; }
      var ip = (oct[0] << 24 | oct[1] << 16 | oct[2] << 8 | oct[3]) >>> 0;
      var mask = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0, net = (ip & mask) >>> 0, bc = (net | (~mask >>> 0)) >>> 0;
      function s(x) { return [x >>> 24 & 255, x >>> 16 & 255, x >>> 8 & 255, x & 255].join('.'); }
      var hosts = p >= 31 ? (p === 32 ? 1 : 2) : (bc - net - 1);
      out.innerHTML = '<div class="tk-kv"><span>Network</span><code>' + s(net) + '</code></div>' +
        '<div class="tk-kv"><span>Broadcast</span><code>' + s(bc) + '</code></div>' +
        '<div class="tk-kv"><span>Netmask</span><code>' + s(mask) + '</code></div>' +
        '<div class="tk-kv"><span>Host range</span><code>' + (p >= 31 ? s(net) + ' – ' + s(bc) : s((net + 1) >>> 0) + ' – ' + s((bc - 1) >>> 0)) + '</code></div>' +
        '<div class="tk-kv"><span>Usable hosts</span><code>' + hosts + '</code></div>';
    }
    body().querySelector('#tk-cidr-go').addEventListener('click', calc);
    body().querySelector('#tk-cidr').addEventListener('keydown', function (e) { if (e.key === 'Enter') calc(); });
  }

  // ── Reference ──
  var PORTS = [[20, 'FTP data'], [21, 'FTP'], [22, 'SSH'], [23, 'Telnet'], [25, 'SMTP'], [53, 'DNS'], [67, 'DHCP'], [69, 'TFTP'], [80, 'HTTP'], [88, 'Kerberos'], [110, 'POP3'], [111, 'RPC'], [123, 'NTP'], [135, 'MSRPC'], [139, 'NetBIOS'], [143, 'IMAP'], [161, 'SNMP'], [389, 'LDAP'], [443, 'HTTPS'], [445, 'SMB'], [636, 'LDAPS'], [993, 'IMAPS'], [995, 'POP3S'], [1433, 'MSSQL'], [1521, 'Oracle'], [3306, 'MySQL'], [3389, 'RDP'], [5432, 'PostgreSQL'], [5900, 'VNC'], [6379, 'Redis'], [8080, 'HTTP-alt'], [27017, 'MongoDB']];
  var FLAGS = [['nmap -sS', 'SYN stealth scan'], ['nmap -sV', 'service/version'], ['nmap -sC', 'default scripts'], ['nmap -A', 'aggressive'], ['nmap -p-', 'all 65535 ports'], ['nmap -Pn', 'skip host discovery'], ['ffuf -w list -u URL/FUZZ', 'content fuzzing'], ['gobuster dir -u URL -w list', 'dir brute-force'], ['hashcat -m 0 -a 0 hash list', 'crack MD5 w/ wordlist'], ['hydra -l user -P list ssh://host', 'SSH brute-force'], ['nc -lvnp 4444', 'netcat listener'], ['smbclient -L //host -N', 'list SMB shares (null)']];
  function refTab() {
    body().innerHTML = '<input class="co-input" id="tk-ref-q" placeholder="filter ports / commands…" style="margin-bottom:12px;" />' +
      '<div class="deck-panel-title" style="margin:6px 0 8px;">Common ports</div><div id="tk-ports" class="tk-ref-grid"></div>' +
      '<div class="deck-panel-title" style="margin:18px 0 8px;">Handy commands</div><div id="tk-flags" class="tk-flags"></div>';
    function draw() {
      var q = (body().querySelector('#tk-ref-q').value || '').toLowerCase();
      body().querySelector('#tk-ports').innerHTML = PORTS.filter(function (p) { return !q || ('' + p[0]).indexOf(q) >= 0 || p[1].toLowerCase().indexOf(q) >= 0; }).map(function (p) { return '<div class="tk-port"><b>' + p[0] + '</b> ' + esc(p[1]) + '</div>'; }).join('');
      body().querySelector('#tk-flags').innerHTML = FLAGS.filter(function (f) { return !q || f[0].toLowerCase().indexOf(q) >= 0 || f[1].toLowerCase().indexOf(q) >= 0; }).map(function (f) { return '<div class="tk-flag"><code>' + esc(f[0]) + '</code><span>' + esc(f[1]) + '</span></div>'; }).join('');
    }
    body().querySelector('#tk-ref-q').addEventListener('input', draw); draw();
  }

  window.DeckViews = window.DeckViews || {};
  window.DeckViews.toolkit = view;
})();
