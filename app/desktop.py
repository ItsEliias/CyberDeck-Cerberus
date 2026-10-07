"""
CyberDeck desktop launcher (P4) — a program, not a browser tab.

Starts the Flask app in-process on a random loopback port, then opens it in a native
OS webview window (WebKit on macOS, WebView2 on Windows, GTK on Linux). Nothing is
exposed as a browsable server: the port is random, bound to 127.0.0.1, and closes with
the window. This is also where the Terminal module will live (P4), sandboxed to the app
process rather than reachable on a fixed web port.

Run:  ./.venv/bin/python app/desktop.py
Package later with PyInstaller for a standalone app.
"""
from __future__ import annotations

import socket
import threading
import time
import urllib.request

from datapaths import persist_data_env

persist_data_env()

from app import app  # noqa: E402 — must follow persist_data_env so modules read the env


# A STABLE loopback port so the webview origin (and thus its localStorage — theme,
# prefs, onboarding profile) is the same every launch. A random port made every
# launch a new origin, which reset onboarding + theme each time. Falls back to a
# free port only if this one is busy (rare; that launch won't see prior storage).
_PREFERRED_PORT = 8137


def _free_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _pick_port() -> int:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(("127.0.0.1", _PREFERRED_PORT))
        s.close()
        return _PREFERRED_PORT
    except OSError:
        return _free_port()


def _serve(port: int):
    app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False, threaded=True)


def _wait_ready(port: int, tries: int = 60):
    for _ in range(tries):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=0.3)
            return True
        except Exception:
            time.sleep(0.1)
    return False


def main():
    port = _pick_port()
    threading.Thread(target=_serve, args=(port,), daemon=True).start()
    _wait_ready(port)

    import webview  # imported here so headless component checks don't require a display
    from modules.shell_bridge import DesktopApi
    from modules import profile

    # Window mode is a saved preference (Settings → Display). Frameless/fullscreen can
    # only be chosen at creation in this pywebview, so it applies from the next launch.
    kwargs = dict(width=1400, height=900, min_size=(940, 620))
    mode = profile.window_mode()
    if mode == "fullscreen":
        kwargs["fullscreen"] = True
    elif mode == "borderless":
        kwargs["frameless"] = True
        kwargs["maximized"] = True

    webview.create_window(
        "CyberDeck",
        f"http://127.0.0.1:{port}/",
        js_api=DesktopApi(),   # Terminal talks to this in-process, not over the web port
        **kwargs,
    )
    webview.start()  # blocks on the main thread until the window closes (Cocoa requirement)


if __name__ == "__main__":
    main()
