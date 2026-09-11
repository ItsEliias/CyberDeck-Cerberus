/*
 * Attack Board view — kanban of attack progress, off /api/board.
 * Drag cards between columns; add via modal. ReconDesk-style.
 */
(function () {
  'use strict';
  var root = null, data = { columns: [], cards: [] };
  function esc(s) { return (window.Deck ? Deck.esc : String)(s == null ? '' : s); }
  function get(u) { return fetch(u).then(function (r) { return r.json(); }); }
  function post(u, b) { return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(function (r) { return r.json(); }); }
  function del(u) { return fetch(u, { method: 'DELETE' }).then(function (r) { return r.json(); }); }

  function view(el) { root = el; load(); }

  function load() {
    root.innerHTML = '<div class="co-head"><span class="co-title">Attack Board</span></div><div class="bd-wrap" id="bd-wrap"><div class="kb-loading">Loading…</div></div>';
    get('/api/board').then(function (d) { data = d; render(); });
  }

  function render() {
    var wrap = root.querySelector('#bd-wrap');
    wrap.innerHTML = data.columns.map(function (col) {
      var cards = data.cards.filter(function (c) { return c.col === col.id; });
      return '<div class="bd-col" data-col="' + col.id + '">' +
        '<div class="bd-col-head"><span>' + esc(col.name) + '</span><span class="bd-col-n">' + cards.length + '</span>' +
        '<button class="bd-add" data-add="' + col.id + '" title="Add card">+</button></div>' +
        '<div class="bd-cards" data-drop="' + col.id + '">' + cards.map(cardHtml).join('') + '</div></div>';
    }).join('');
    wire(wrap);
  }

  function cardHtml(c) {
    return '<div class="bd-card" draggable="true" data-card="' + esc(c.id) + '">' +
      '<div class="bd-card-top"><span class="bd-card-title">' + esc(c.title) + '</span>' +
      '<button class="bd-card-del" data-del="' + esc(c.id) + '">&times;</button></div>' +
      (c.target ? '<div class="bd-card-target">' + esc(c.target) + '</div>' : '') +
      (c.notes ? '<div class="bd-card-notes">' + esc(c.notes) + '</div>' : '') + '</div>';
  }

  function wire(wrap) {
    // add
    wrap.querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () { addCard(b.getAttribute('data-add')); });
    });
    // delete
    wrap.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); del('/api/board/card/' + b.getAttribute('data-del')).then(load); });
    });
    // drag
    wrap.querySelectorAll('.bd-card').forEach(function (card) {
      card.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', card.getAttribute('data-card')); card.classList.add('bd-card--drag'); });
      card.addEventListener('dragend', function () { card.classList.remove('bd-card--drag'); });
    });
    wrap.querySelectorAll('[data-drop]').forEach(function (zone) {
      zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('bd-drop--over'); });
      zone.addEventListener('dragleave', function () { zone.classList.remove('bd-drop--over'); });
      zone.addEventListener('drop', function (e) {
        e.preventDefault(); zone.classList.remove('bd-drop--over');
        var id = e.dataTransfer.getData('text/plain');
        var col = zone.getAttribute('data-drop');
        var c = data.cards.filter(function (x) { return x.id === id; })[0];
        if (c && c.col !== col) { c.col = col; render(); post('/api/board/card/' + id, { col: col }); }
      });
    });
  }

  function addCard(col) {
    Deck.modal({
      title: 'New card', width: 440,
      body: '<label class="co-label">Title</label><input id="bd-t" class="co-input" placeholder="e.g. nmap full TCP scan">' +
        '<label class="co-label">Target (optional)</label><input id="bd-tg" class="co-input" placeholder="10.10.1.5">' +
        '<label class="co-label">Notes (optional)</label><input id="bd-n" class="co-input" placeholder="details / command">',
      footer: '<button class="co-btn" id="bd-cancel">Cancel</button><button class="co-btn co-btn--primary" id="bd-ok">Add card</button>',
      onMount: function (m) {
        function go() {
          var title = m.querySelector('#bd-t').value.trim(); if (!title) return;
          post('/api/board/card', { title: title, col: col, target: m.querySelector('#bd-tg').value, notes: m.querySelector('#bd-n').value })
            .then(function () { Deck.closeModal(); load(); });
        }
        m.querySelector('#bd-ok').addEventListener('click', go);
        m.querySelector('#bd-cancel').addEventListener('click', Deck.closeModal);
        m.querySelector('#bd-t').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      },
    });
  }

  window.DeckViews.board = view;
})();
