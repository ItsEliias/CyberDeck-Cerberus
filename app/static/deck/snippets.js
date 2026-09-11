/*
 * Snippets view — payload/command library with live {VAR} substitution, off /api/snippets.
 * Fill LHOST/LPORT/etc once; every command updates for one-click copy.
 */
(function () {
  'use strict';
  var root = null, dataCats = [], vars = [];
  var VKEY = 'cyberdeck.snippetvars';
  function esc(s) { return (window.Deck ? Deck.esc : String)(s == null ? '' : s); }
  function get(u) { return fetch(u).then(function (r) { return r.json(); }); }
  function post(u, b) { return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(function (r) { return r.json(); }); }
  function del(u) { return fetch(u, { method: 'DELETE' }).then(function (r) { return r.json(); }); }

  function vals() { try { return JSON.parse(localStorage.getItem(VKEY)) || {}; } catch (e) { return {}; } }
  function setVal(k, v) { var o = vals(); o[k] = v; localStorage.setItem(VKEY, JSON.stringify(o)); }

  function subst(cmd) {
    var v = vals();
    return cmd.replace(/\{([A-Z]+)\}/g, function (m, k) { return v[k] ? v[k] : m; });
  }

  function view(el) {
    root = el;
    root.innerHTML = '<div class="co-head"><span class="co-title">Snippets</span>' +
      '<button class="co-btn co-btn--primary" id="sn-add" style="margin-left:auto;">+ Snippet</button></div>' +
      '<div class="sn-vars" id="sn-vars"></div>' +
      '<div class="co-body" id="sn-body"><div class="kb-loading">Loading…</div></div>';
    root.querySelector('#sn-add').addEventListener('click', addModal);
    load();
  }

  function load() {
    get('/api/snippets/list').then(function (d) {
      dataCats = d.categories; vars = d.vars;
      renderVars();
      renderBody();
    });
  }

  function renderVars() {
    var v = vals();
    root.querySelector('#sn-vars').innerHTML = vars.map(function (k) {
      return '<label class="sn-var"><span>' + k + '</span><input class="co-input sn-vin" data-k="' + k + '" value="' + esc(v[k] || '') + '" placeholder="' + placeholder(k) + '"></label>';
    }).join('');
    root.querySelectorAll('.sn-vin').forEach(function (inp) {
      inp.addEventListener('input', function () { setVal(inp.getAttribute('data-k'), inp.value); renderBody(); });
    });
  }
  function placeholder(k) { return { LHOST: '10.10.14.2', LPORT: '4444', RHOST: '10.10.10.5', PORT: '8000', URL: 'http://target', WORDLIST: '/usr/share/…' }[k] || ''; }

  function renderBody() {
    var body = root.querySelector('#sn-body');
    body.innerHTML = dataCats.map(function (cat) {
      return '<div class="deck-panel-title" style="margin:6px 0 10px;">' + esc(cat.category) + '</div>' +
        '<div class="sn-list">' + cat.items.map(snip).join('') + '</div>';
    }).join('');
    body.querySelectorAll('.sn-copy').forEach(function (b) {
      b.addEventListener('click', function () {
        var cmd = b.closest('.sn-item').querySelector('.sn-cmd').textContent;
        navigator.clipboard.writeText(cmd).then(function () { Deck.toast('Copied'); b.textContent = 'copied'; setTimeout(function () { b.textContent = 'copy'; }, 1200); });
      });
    });
    body.querySelectorAll('.sn-del').forEach(function (b) {
      b.addEventListener('click', function () { del('/api/snippets/' + b.getAttribute('data-del')).then(load); });
    });
  }

  function snip(s) {
    var rendered = subst(s.command);
    var unresolved = /\{[A-Z]+\}/.test(rendered);
    return '<div class="sn-item"><div class="sn-top"><span class="sn-title">' + esc(s.title) + '</span>' +
      '<div class="sn-btns"><button class="sn-copy">copy</button>' +
      (s.seed ? '' : '<button class="sn-del" data-del="' + esc(s.id) + '" title="Delete">&times;</button>') + '</div></div>' +
      '<code class="sn-cmd' + (unresolved ? ' sn-cmd--todo' : '') + '">' + esc(rendered) + '</code></div>';
  }

  function addModal() {
    Deck.modal({
      title: 'New snippet', width: 560,
      body: '<label class="co-label">Title</label><input id="sn-t" class="co-input">' +
        '<label class="co-label">Category</label><input id="sn-c" class="co-input" value="Custom">' +
        '<label class="co-label">Command (use {LHOST}, {LPORT}, {RHOST}…)</label><textarea id="sn-cmd" class="co-input" rows="3"></textarea>',
      footer: '<button class="co-btn" id="sn-x">Cancel</button><button class="co-btn co-btn--primary" id="sn-s">Add</button>',
      onMount: function (m) {
        m.querySelector('#sn-x').addEventListener('click', Deck.closeModal);
        m.querySelector('#sn-s').addEventListener('click', function () {
          post('/api/snippets/add', { title: m.querySelector('#sn-t').value, category: m.querySelector('#sn-c').value, command: m.querySelector('#sn-cmd').value })
            .then(function (r) { if (r.ok) { Deck.closeModal(); load(); } });
        });
      },
    });
  }

  window.DeckViews.snippets = view;
})();
