/*
 * Flashcards view — SM-2 spaced repetition + generate-from-note, off /api/flashcards.
 * decks → review (front → reveal → grade) ; add card + generate via modals.
 */
(function () {
  'use strict';
  var root = null, session = null, noteList = null;
  function esc(s) { return (window.Deck ? Deck.esc : String)(s == null ? '' : s); }
  function get(u) { return fetch(u).then(function (r) { return r.json(); }); }
  function post(u, b) { return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(function (r) { return r.json(); }); }

  function view(el) { root = el; showDecks(); }

  function showDecks() {
    session = null;
    root.innerHTML = '<div class="co-head"><span class="co-title">Flashcards</span>' +
      '<button class="co-btn" id="fc-gen" style="margin-left:auto;">Generate from note</button>' +
      '<button class="co-btn co-btn--primary" id="fc-add" style="margin-left:8px;">+ Card</button></div>' +
      '<div class="co-body"><div id="fc-decks"><div class="kb-loading">Loading…</div></div></div>';
    root.querySelector('#fc-add').addEventListener('click', function () { addCardModal(); });
    root.querySelector('#fc-gen').addEventListener('click', genModal);
    get('/api/flashcards/decks').then(function (d) {
      var box = root.querySelector('#fc-decks');
      var due = d.decks.reduce(function (a, x) { return a + x.due; }, 0);
      var head = due ? '<button class="co-btn co-btn--primary fc-reviewall" data-deck="">Review all due (' + due + ')</button>' : '<div class="co-muted">Nothing due — nicely kept up.</div>';
      if (!d.decks.length) { box.innerHTML = '<div class="co-empty">No cards yet.<br>Add one, or Generate from a note.</div>'; return; }
      box.innerHTML = '<div style="margin-bottom:16px;">' + head + '</div><div class="co-grid">' + d.decks.map(function (dk) {
        return '<div class="co-card fc-deck"><div class="co-card-title">' + esc(dk.deck) + '</div>' +
          '<div class="co-card-meta">' + dk.total + ' cards · ' + dk.new + ' new</div>' +
          '<div class="co-chips"><span class="co-chip' + (dk.due ? ' fc-due' : '') + '">' + dk.due + ' due</span></div>' +
          (dk.due ? '<button class="co-btn co-btn--primary fc-review" data-deck="' + esc(dk.deck) + '" style="margin-top:10px;">Review</button>' : '') + '</div>';
      }).join('') + '</div>';
      box.addEventListener('click', function (e) {
        var r = e.target.closest('.fc-review, .fc-reviewall'); if (r) startReview(r.getAttribute('data-deck'));
      });
    });
  }

  function startReview(deck) {
    get('/api/flashcards/due' + (deck ? '?deck=' + encodeURIComponent(deck) : '')).then(function (d) {
      if (!d.cards.length) return showDecks();
      session = { cards: d.cards, i: 0, done: 0 };
      renderCard();
    });
  }

  function renderCard() {
    var c = session.cards[session.i];
    if (!c) return finishReview();
    root.innerHTML = '<div class="co-head"><button class="co-btn" id="fc-quit">← Decks</button>' +
      '<span class="pb-count" style="margin-left:auto;">' + (session.i + 1) + ' / ' + session.cards.length + '</span></div>' +
      '<div class="fc-review-wrap"><div class="fc-card"><div class="fc-front">' + esc(c.front) + '</div>' +
      '<div class="fc-back" id="fc-back" style="display:none;"><hr>' + esc(c.back) + '</div></div>' +
      '<div class="fc-actions" id="fc-actions"><button class="co-btn co-btn--primary" id="fc-show" style="min-width:200px;">Show answer</button></div></div>';
    root.querySelector('#fc-quit').addEventListener('click', showDecks);
    root.querySelector('#fc-show').addEventListener('click', reveal);
  }

  function reveal() {
    root.querySelector('#fc-back').style.display = 'block';
    root.querySelector('#fc-actions').innerHTML =
      '<button class="co-btn fc-grade" data-g="0">Again</button>' +
      '<button class="co-btn fc-grade" data-g="1">Hard</button>' +
      '<button class="co-btn co-btn--primary fc-grade" data-g="2">Good</button>' +
      '<button class="co-btn fc-grade" data-g="3">Easy</button>';
    root.querySelector('#fc-actions').addEventListener('click', function (e) {
      var b = e.target.closest('.fc-grade'); if (!b) return;
      var c = session.cards[session.i];
      post('/api/flashcards/review/' + c.id, { grade: parseInt(b.getAttribute('data-g'), 10) });
      post('/api/activity/log', { kind: 'review' });
      session.i++; session.done++; renderCard();
    });
  }

  function finishReview() {
    root.innerHTML = '<div class="co-head"><button class="co-btn" id="fc-quit">← Decks</button></div>' +
      '<div class="co-body"><div class="co-empty">Reviewed ' + session.done + ' card' + (session.done === 1 ? '' : 's') + '. 🎉<br>Come back tomorrow for the next batch.</div></div>';
    root.querySelector('#fc-quit').addEventListener('click', showDecks);
  }

  function addCardModal(front, back, deck) {
    Deck.modal({
      title: 'New card', width: 480,
      body: '<label class="co-label">Front</label><textarea id="fc-f" class="co-input" rows="2">' + esc(front || '') + '</textarea>' +
        '<label class="co-label">Back</label><textarea id="fc-b" class="co-input" rows="3">' + esc(back || '') + '</textarea>' +
        '<label class="co-label">Deck</label><input id="fc-d" class="co-input" value="' + esc(deck || 'General') + '">',
      footer: '<button class="co-btn" id="fc-c">Cancel</button><button class="co-btn co-btn--primary" id="fc-s">Add</button>',
      onMount: function (m) {
        m.querySelector('#fc-c').addEventListener('click', Deck.closeModal);
        m.querySelector('#fc-s').addEventListener('click', function () {
          post('/api/flashcards/card', { front: m.querySelector('#fc-f').value, back: m.querySelector('#fc-b').value, deck: m.querySelector('#fc-d').value })
            .then(function (r) { if (r.ok) { Deck.closeModal(); Deck.toast('Card added'); showDecks(); } });
        });
      },
    });
  }

  function genModal() {
    ensureNotes(function (notes) {
      var opts = notes.map(function (p) { return '<option value="' + esc(p) + '">'; }).join('');
      Deck.modal({
        title: 'Generate cards from a note', width: 520,
        body: '<label class="co-label">Note path</label><input id="fc-note" class="co-input" list="fc-notes" placeholder="type to find a note…">' +
          '<datalist id="fc-notes">' + opts + '</datalist>' +
          '<div class="co-muted" style="margin:8px 0 0;">Pulls definitions, headings, and bold terms into Q&amp;A / cloze cards. You choose which to keep.</div>' +
          '<div id="fc-proposed"></div>',
        footer: '<button class="co-btn" id="fc-gc">Close</button><button class="co-btn co-btn--primary" id="fc-gg">Generate</button>',
        onMount: function (m) {
          m.querySelector('#fc-gc').addEventListener('click', Deck.closeModal);
          m.querySelector('#fc-gg').addEventListener('click', function () {
            var path = m.querySelector('#fc-note').value.trim(); if (!path) return;
            var out = m.querySelector('#fc-proposed'); out.innerHTML = '<div class="kb-loading">Generating…</div>';
            post('/api/flashcards/generate', { path: path }).then(function (d) {
              if (!d.proposed || !d.proposed.length) { out.innerHTML = '<div class="co-warn">No cards found in that note.</div>'; return; }
              out.innerHTML = '<div class="co-scanhead">' + d.proposed.length + ' proposed — untick any to skip:</div>' +
                '<div class="fc-proplist">' + d.proposed.map(function (p, i) {
                  return '<label class="fc-prop"><input type="checkbox" class="fc-pcb" data-i="' + i + '" checked>' +
                    '<span><b>' + esc(p.front) + '</b><br><span class="co-muted">' + esc(p.back) + '</span></span></label>';
                }).join('') + '</div>' +
                '<button class="co-btn co-btn--primary" id="fc-addsel" style="margin-top:10px;">Add selected to deck "' + esc(d.deck) + '"</button>';
              window._fcProposed = { deck: d.deck, cards: d.proposed };
              out.querySelector('#fc-addsel').addEventListener('click', addGenerated);
            });
          });
        },
      });
    });
  }

  function addGenerated() {
    var sel = Array.prototype.filter.call(document.querySelectorAll('.fc-pcb'), function (cb) { return cb.checked; });
    var deck = window._fcProposed.deck, cards = window._fcProposed.cards;
    var chain = Promise.resolve();
    sel.forEach(function (cb) {
      var p = cards[parseInt(cb.getAttribute('data-i'), 10)];
      chain = chain.then(function () { return post('/api/flashcards/card', { front: p.front, back: p.back, deck: deck }); });
    });
    chain.then(function () { Deck.closeModal(); Deck.toast(sel.length + ' cards added'); showDecks(); });
  }

  function ensureNotes(cb) {
    if (noteList) return cb(noteList);
    get('/api/knowledge/tree').then(function (d) {
      var out = [];
      (function walk(items) { (items || []).forEach(function (it) { if (it.type === 'file') out.push(it.path); else walk(it.children); }); })(d.tree && d.tree.children);
      noteList = out; cb(out);
    });
  }

  window.DeckViews.flashcards = view;
})();
