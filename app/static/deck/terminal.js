/*
 * Terminal view — a sandboxed command runner.
 * In the desktop app it talks to Python via window.pywebview.api (in-process, NOT the
 * web port). In the browser/dev build there is no bridge, so it disables itself — the
 * shell deliberately never rides the HTTP server.
 */
(function () {
  'use strict';
  var root = null, history = [], hidx = 0;
  function esc(s) { return (window.Deck ? Deck.esc : String)(s == null ? '' : s); }
  function shortCwd(p) { if (!p) return '~'; var home = p.match(/^\/Users\/[^/]+|^\/home\/[^/]+|^[A-Za-z]:\\Users\\[^\\]+/); return home ? '~' + p.slice(home[0].length) : p; }

  function api() { return (window.pywebview && window.pywebview.api && window.pywebview.api.term_run) ? window.pywebview.api : null; }

  function view(el) {
    root = el;
    if (!api()) {
      // Might not be injected yet in the desktop app — wait briefly for pywebviewready.
      var waited = false;
      window.addEventListener('pywebviewready', function () { if (root === el) render(); }, { once: true });
      setTimeout(function () { if (!waited && root === el) render(); }, 350);
      waited = true;
      render();  // render fallback immediately; upgrades if the bridge appears
    } else {
      render();
    }
  }

  function render() {
    var live = !!api();
    root.innerHTML = '<div class="co-head"><span class="co-title">Terminal</span>' +
      '<span class="rp-status" id="tm-cwd"></span></div>' +
      '<div class="tm-wrap"><div class="tm-out" id="tm-out"></div>' +
      (live
        ? '<div class="tm-inrow"><span class="tm-prompt" id="tm-p">$</span><input class="tm-in" id="tm-in" spellcheck="false" autocomplete="off" autocapitalize="off"></div>'
        : '<div class="tm-notice">// Terminal is disabled in the browser build.<br>It runs only inside the <b>CyberDeck desktop app</b>, sandboxed to the app process (never exposed on a network port). Launch <code>CyberDeck.app</code> / <code>CyberDeck.exe</code> to use it.</div>') +
      '</div>';
    if (!live) return;

    var out = root.querySelector('#tm-out');
    var input = root.querySelector('#tm-in');
    print(out, 'CyberDeck terminal — commands run on this machine, in the app sandbox.', 'tm-sys');
    refreshCwd();
    input.focus();
    root.querySelector('.tm-wrap').addEventListener('click', function () { input.focus(); });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var cmd = input.value; input.value = '';
        if (cmd.trim()) { history.push(cmd); hidx = history.length; }
        runCmd(cmd, out);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); if (hidx > 0) { hidx--; input.value = history[hidx] || ''; }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault(); if (hidx < history.length) { hidx++; input.value = history[hidx] || ''; }
      }
    });
  }

  function refreshCwd() {
    var a = api(); if (!a) return;
    Promise.resolve(a.term_cwd()).then(function (cwd) {
      var p = root.querySelector('#tm-p'), s = root.querySelector('#tm-cwd');
      if (p) p.textContent = shortCwd(cwd) + ' $';
      if (s) s.textContent = cwd;
    });
  }

  function runCmd(cmd, out) {
    var a = api(); if (!a) return;
    var promptTxt = (root.querySelector('#tm-p') || {}).textContent || '$';
    print(out, promptTxt + ' ' + cmd, 'tm-cmd');
    Promise.resolve(a.term_run(cmd)).then(function (r) {
      if (r.clear) { out.innerHTML = ''; refreshCwd(); return; }
      if (r.out) print(out, r.out, r.code ? 'tm-err' : '');
      var p = root.querySelector('#tm-p'), s = root.querySelector('#tm-cwd');
      if (p) p.textContent = shortCwd(r.cwd) + ' $';
      if (s) s.textContent = r.cwd;
      out.scrollTop = out.scrollHeight;
    });
  }

  function print(out, text, cls) {
    var d = document.createElement('div');
    d.className = 'tm-line' + (cls ? ' ' + cls : '');
    d.textContent = text;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
  }

  window.DeckViews.terminal = view;
})();
