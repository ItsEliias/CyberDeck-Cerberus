/*
 * Journal view — timestamped lab/engagement log, off /api/journal. Tag entries by box;
 * "Export write-up" compiles a box's entries into a markdown report (copyable).
 */
(function () {
  'use strict';
  var root = null, curTarget = null;
  function esc(s) { return (window.Deck ? Deck.esc : String)(s == null ? '' : s); }
  function get(u) { return fetch(u).then(function (r) { return r.json(); }); }
  function post(u, b) { return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(function (r) { return r.json(); }); }
  function del(u) { return fetch(u, { method: 'DELETE' }).then(function (r) { return r.json(); }); }

  function view(el) { root = el; load(); }

  function load() {
    root.innerHTML = '<div class="co-head"><span class="co-title">Journal</span>' +
      (curTarget ? '<button class="co-btn" id="jn-export">Export write-up</button>' : '') +
      '<button class="co-btn co-btn--primary" id="jn-add">+ Log entry</button></div>' +
      '<div class="co-body"><div id="jn-targets" class="rs-tags"></div><div id="jn-list"><div class="kb-loading">Loading…</div></div></div>';
    root.querySelector('#jn-add').addEventListener('click', showAdd);
    var exp = root.querySelector('#jn-export'); if (exp) exp.addEventListener('click', exportWriteup);
    get('/api/journal/list' + (curTarget ? '?target=' + encodeURIComponent(curTarget) : '')).then(render);
  }

  function render(d) {
    var tags = root.querySelector('#jn-targets');
    tags.innerHTML = '<button class="rs-tag' + (!curTarget ? ' rs-tag--on' : '') + '" data-t="">All</button>' +
      (d.targets || []).map(function (t) { return '<button class="rs-tag' + (curTarget === t ? ' rs-tag--on' : '') + '" data-t="' + esc(t) + '">' + esc(t) + '</button>'; }).join('');
    Array.prototype.forEach.call(tags.querySelectorAll('[data-t]'), function (b) { b.addEventListener('click', function () { curTarget = b.getAttribute('data-t') || null; load(); }); });
    var list = root.querySelector('#jn-list'), items = d.entries || [];
    if (!items.length) { list.innerHTML = '<div class="co-empty">No entries' + (curTarget ? ' for “' + esc(curTarget) + '”' : '') + ' yet.<br>Log what you did as you work — export a box as a write-up later.</div>'; return; }
    list.innerHTML = items.map(function (e) {
      return '<div class="jn-entry"><div class="jn-top"><span class="jn-target">' + esc(e.target) + '</span>' +
        (e.title ? '<span class="jn-title">' + esc(e.title) + '</span>' : '') +
        '<span class="jn-time">' + esc((e.created || '').slice(0, 16).replace('T', ' ')) + '</span>' +
        '<button class="rs-del" data-del="' + esc(e.id) + '">×</button></div>' +
        '<div class="jn-body">' + esc(e.body) + '</div></div>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('[data-del]'), function (b) { b.addEventListener('click', function () { del('/api/journal/' + b.getAttribute('data-del')).then(load); }); });
  }

  function showAdd() {
    root.innerHTML = '<div class="co-head"><span class="co-title">Log entry</span><button class="co-btn" id="jn-cancel">Cancel</button></div>' +
      '<div class="co-body"><div class="co-form">' +
      '<label class="co-label">Box / target</label><input id="jn-t" class="co-input" placeholder="e.g. HTB: Blue" value="' + esc(curTarget || '') + '" />' +
      '<label class="co-label" style="margin-top:10px;">Title (optional)</label><input id="jn-ti" class="co-input" placeholder="e.g. Foothold via SMB" />' +
      '<label class="co-label" style="margin-top:10px;">What you did</label><textarea id="jn-b" class="tk-in" placeholder="Commands, findings, next steps… (markdown ok)"></textarea>' +
      '<div class="co-row" style="margin-top:12px;"><button class="co-btn co-btn--primary" id="jn-save">Save</button></div><div id="jn-res"></div></div></div>';
    root.querySelector('#jn-cancel').addEventListener('click', load);
    function save() {
      var body = root.querySelector('#jn-b').value.trim();
      if (!body) { root.querySelector('#jn-res').innerHTML = '<div class="co-warn">Write something first.</div>'; return; }
      post('/api/journal/add', { target: root.querySelector('#jn-t').value.trim(), title: root.querySelector('#jn-ti').value.trim(), body: body }).then(function (d) {
        if (d.ok) { curTarget = d.entry.target; load(); } else root.querySelector('#jn-res').innerHTML = '<div class="co-warn">' + esc(d.error || 'Failed.') + '</div>';
      });
    }
    root.querySelector('#jn-save').addEventListener('click', save);
    root.querySelector('#jn-b').focus();
  }

  function exportWriteup() {
    get('/api/journal/writeup?target=' + encodeURIComponent(curTarget)).then(function (d) {
      root.innerHTML = '<div class="co-head"><button class="co-btn" id="jn-back">← Journal</button><span class="co-title" style="margin-left:10px;">Write-up</span>' +
        '<button class="co-btn co-btn--primary" id="jn-copy" style="margin-left:auto;">Copy markdown</button></div>' +
        '<div class="co-body"><pre class="md-fallback" id="jn-md">' + esc(d.markdown) + '</pre></div>';
      root.querySelector('#jn-back').addEventListener('click', load);
      root.querySelector('#jn-copy').addEventListener('click', function () {
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(d.markdown); }
        else { var pre = root.querySelector('#jn-md'), r = document.createRange(); r.selectNode(pre); getSelection().removeAllRanges(); getSelection().addRange(r); try { document.execCommand('copy'); } catch (e) {} getSelection().removeAllRanges(); }
        if (window.Deck) Deck.toast('Copied');
      });
    });
  }

  window.DeckViews = window.DeckViews || {};
  window.DeckViews.journal = view;
})();
