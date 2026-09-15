/*
 * Quiz view — multiple-choice mock exam built from your flashcards, off /api/flashcards/quiz.
 * Pick a deck + length → answer MCQs (distractors drawn from other cards) → scored results
 * with the ones to review. Results + a study action are logged.
 */
(function () {
  'use strict';
  var root = null, state = null;
  function esc(s) { return (window.Deck ? Deck.esc : String)(s == null ? '' : s); }
  function get(u) { return fetch(u).then(function (r) { return r.json(); }); }
  function post(u, b) { return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(function (r) { return r.json(); }); }

  function view(el) { root = el; start(); }

  function start() {
    root.innerHTML = '<div class="co-head"><span class="co-title">Quiz</span></div>' +
      '<div class="co-body"><div class="co-form">' +
      '<label class="co-label">Deck</label><select class="co-input" id="qz-deck"><option value="">All decks</option></select>' +
      '<label class="co-label" style="margin-top:10px;">Questions</label><select class="co-input" id="qz-n"><option>10</option><option>20</option><option>30</option></select>' +
      '<div class="co-row" style="margin-top:14px;"><button class="co-btn co-btn--primary" id="qz-start">Start quiz</button></div>' +
      '<div id="qz-hist" style="margin-top:22px;"></div></div></div>';
    get('/api/flashcards/decks').then(function (d) {
      var sel = root.querySelector('#qz-deck');
      (d.decks || []).forEach(function (dk) { var o = document.createElement('option'); o.value = dk.deck; o.textContent = dk.deck + ' (' + dk.total + ')'; sel.appendChild(o); });
    });
    get('/api/flashcards/quiz-history').then(function (d) {
      var h = d.history || []; if (!h.length) return;
      root.querySelector('#qz-hist').innerHTML = '<div class="deck-panel-title" style="margin-bottom:8px;">Recent scores</div>' +
        h.map(function (r) { var pct = r.total ? Math.round(r.score / r.total * 100) : 0; return '<div class="qz-hrow"><span>' + esc(r.deck) + '</span><span class="qz-pct">' + r.score + '/' + r.total + ' · ' + pct + '%</span></div>'; }).join('');
    });
    root.querySelector('#qz-start').addEventListener('click', function () {
      var deck = root.querySelector('#qz-deck').value, n = root.querySelector('#qz-n').value;
      get('/api/flashcards/quiz?n=' + n + (deck ? '&deck=' + encodeURIComponent(deck) : '')).then(function (d) {
        if (!d.questions || !d.questions.length) { root.querySelector('#qz-hist').innerHTML = '<div class="co-warn">Not enough cards to quiz.</div>'; return; }
        state = { qs: d.questions, i: 0, score: 0, missed: [], deck: deck || 'All', answered: false };
        question();
      });
    });
  }

  function question() {
    var q = state.qs[state.i];
    root.innerHTML = '<div class="co-head"><span class="co-title">Quiz</span><span class="co-muted" style="margin-left:auto;">' + (state.i + 1) + ' / ' + state.qs.length + '</span></div>' +
      '<div class="co-body"><div class="qz-q">' + esc(q.front) + '</div><div class="qz-choices">' +
      q.choices.map(function (c, idx) { return '<button class="qz-choice" data-i="' + idx + '">' + esc(c) + '</button>'; }).join('') + '</div></div>';
    Array.prototype.forEach.call(root.querySelectorAll('.qz-choice'), function (btn) {
      btn.addEventListener('click', function () {
        if (state.answered) return; state.answered = true;
        var chosen = q.choices[+btn.getAttribute('data-i')];
        if (chosen === q.correct) state.score++; else state.missed.push(q);
        Array.prototype.forEach.call(root.querySelectorAll('.qz-choice'), function (b) {
          var val = q.choices[+b.getAttribute('data-i')];
          if (val === q.correct) b.classList.add('qz-correct');
          else if (b === btn) b.classList.add('qz-wrong');
          b.disabled = true;
        });
        var next = document.createElement('button');
        next.className = 'co-btn co-btn--primary'; next.style.marginTop = '14px';
        next.textContent = (state.i + 1 < state.qs.length) ? 'Next' : 'See results';
        next.addEventListener('click', function () { state.answered = false; state.i++; if (state.i < state.qs.length) question(); else results(); });
        root.querySelector('.co-body').appendChild(next);
        next.focus();
      });
    });
  }

  function results() {
    var pct = Math.round(state.score / state.qs.length * 100);
    post('/api/flashcards/quiz-result', { deck: state.deck, score: state.score, total: state.qs.length });
    post('/api/activity/log', { kind: 'quiz' });
    var missed = state.missed.map(function (q) { return '<div class="qz-miss"><div class="qz-miss-q">' + esc(q.front) + '</div><div class="qz-miss-a">' + esc(q.correct) + '</div></div>'; }).join('') || '<div class="co-muted">Perfect — nothing missed! 🎉</div>';
    root.innerHTML = '<div class="co-head"><span class="co-title">Quiz results</span></div><div class="co-body">' +
      '<div class="qz-score"><div class="qz-score-v">' + state.score + ' / ' + state.qs.length + '</div><div class="qz-score-p">' + pct + '%</div></div>' +
      '<div class="co-row" style="margin:14px 0;"><button class="co-btn co-btn--primary" id="qz-again">New quiz</button></div>' +
      '<div class="deck-panel-title" style="margin:10px 0 8px;">Review these</div>' + missed + '</div>';
    root.querySelector('#qz-again').addEventListener('click', start);
  }

  window.DeckViews = window.DeckViews || {};
  window.DeckViews.quiz = view;
})();
