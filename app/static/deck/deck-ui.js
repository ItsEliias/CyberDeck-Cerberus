/*
 * Shared UI — Cerberus-style modal + toast. Uses Cerberus's real modal classes
 * (.modal-overlay / .modal-content / .modal-header / .modal-body / .modal-close) so
 * pop-ups match the rest of the app, with the accent glow layered on.
 */
(function () {
  'use strict';
  var openEl = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function close() {
    if (!openEl) return;
    openEl.classList.add('deck-modal--closing');
    var el = openEl; openEl = null;
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 140);
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  /**
   * modal({ title, body, width, onMount, footer })
   *  - body: HTML string. onMount(contentEl) runs after insert (wire inputs there).
   *  - returns the content element.
   */
  function modal(opts) {
    close();
    opts = opts || {};
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay deck-modal-overlay';
    overlay.innerHTML =
      '<div class="modal-content deck-modal cerberus-glow" style="max-width:' + (opts.width || 460) + 'px">' +
      '<div class="modal-header deck-modal-header"><span class="deck-modal-title">' + esc(opts.title || '') + '</span>' +
      '<button class="modal-close deck-modal-close" aria-label="Close">&times;</button></div>' +
      '<div class="modal-body deck-modal-body">' + (opts.body || '') + '</div>' +
      (opts.footer ? '<div class="deck-modal-footer">' + opts.footer + '</div>' : '') +
      '</div>';
    document.body.appendChild(overlay);
    openEl = overlay;
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('.deck-modal-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    var content = overlay.querySelector('.deck-modal');
    if (opts.onMount) opts.onMount(content);
    var f = content.querySelector('input, textarea, select');
    if (f) setTimeout(function () { f.focus(); }, 20);
    return content;
  }

  function toast(msg, kind) {
    var t = document.createElement('div');
    t.className = 'deck-toast' + (kind ? ' deck-toast--' + kind : '');
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('deck-toast--in'); });
    setTimeout(function () { t.classList.remove('deck-toast--in'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 250); }, 2600);
  }

  window.Deck = { modal: modal, closeModal: close, toast: toast, esc: esc };
})();
