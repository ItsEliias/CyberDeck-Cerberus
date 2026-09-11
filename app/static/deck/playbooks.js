/*
 * Playbooks view — markdown checklists with saved run state, off /api/playbooks.
 */
(function () {
  'use strict';
  var root = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function get(u) { return fetch(u).then(function (r) { return r.json(); }); }
  function post(u, b) { return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(function (r) { return r.json(); }); }

  function showList() {
    root.innerHTML = '<div class="co-head"><span class="co-title">Playbooks</span></div><div class="co-body"><div class="kb-loading">Loading…</div></div>';
    get('/api/playbooks/list').then(function (d) {
      var body = root.querySelector('.co-body');
      if (!d.playbooks.length) { body.innerHTML = '<div class="co-empty">No playbooks.</div>'; return; }
      body.innerHTML = '<div class="co-grid">' + d.playbooks.map(function (p) {
        var pct = p.total ? Math.round(p.done / p.total * 100) : 0;
        return '<button class="co-card" data-p="' + esc(p.id) + '"><div class="co-card-title">' + esc(p.title) + '</div>' +
          '<div class="co-card-meta">' + p.done + ' / ' + p.total + ' steps</div>' +
          '<div class="pb-bar"><div class="pb-bar-fill" style="width:' + pct + '%"></div></div></button>';
      }).join('') + '</div>';
      Array.prototype.forEach.call(body.querySelectorAll('[data-p]'), function (el) { el.addEventListener('click', function () { showDetail(el.getAttribute('data-p')); }); });
    });
  }

  function showDetail(pid) {
    get('/api/playbooks/' + encodeURIComponent(pid)).then(function (d) {
      if (d.error) return showList();
      root.innerHTML = '<div class="co-head"><button class="co-btn" id="pb-back">← Playbooks</button>' +
        '<span class="co-title" style="margin-left:10px;">' + esc(d.title) + '</span>' +
        '<span class="pb-count" id="pb-count">' + d.done + '/' + d.total + '</span>' +
        '<button class="co-btn" id="pb-reset" style="margin-left:12px;">Reset</button></div>' +
        '<div class="co-body"><div class="pb-bar" style="margin-bottom:18px;"><div class="pb-bar-fill" id="pb-fill" style="width:' + (d.total ? d.done / d.total * 100 : 0) + '%"></div></div>' +
        '<div class="pb-steps">' + d.items.map(renderItem).join('') + '</div></div>';
      root.querySelector('#pb-back').addEventListener('click', showList);
      root.querySelector('#pb-reset').addEventListener('click', function () { post('/api/playbooks/' + pid + '/reset').then(function () { showDetail(pid); }); });
      root.querySelector('.pb-steps').addEventListener('click', function (e) {
        var step = e.target.closest('.pb-step'); if (!step) return;
        var id = step.getAttribute('data-step');
        var checked = !step.classList.contains('pb-step--on');
        step.classList.toggle('pb-step--on', checked);
        post('/api/playbooks/' + pid + '/toggle', { step: parseInt(id, 10), checked: checked }).then(function () { updateCount(pid); });
      });
    });
  }

  function renderItem(it) {
    if (it.type === 'section') return '<div class="pb-section pb-h' + it.level + '">' + esc(it.text) + '</div>';
    return '<div class="pb-step' + (it.checked ? ' pb-step--on' : '') + '" data-step="' + it.id + '">' +
      '<span class="pb-check"></span><span class="pb-text">' + esc(it.text) + '</span></div>';
  }

  function updateCount(pid) {
    get('/api/playbooks/' + encodeURIComponent(pid)).then(function (d) {
      var c = root.querySelector('#pb-count'); if (c) c.textContent = d.done + '/' + d.total;
      var f = root.querySelector('#pb-fill'); if (f) f.style.width = (d.total ? d.done / d.total * 100 : 0) + '%';
    });
  }

  window.DeckViews.playbooks = function (el) { root = el; showList(); };
})();
