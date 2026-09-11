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

from app import app  # the Flask application


def _free_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


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
    port = _free_port()
    threading.Thread(target=_serve, args=(port,), daemon=True).start()
    _wait_ready(port)

    import webview  # imported here so headless component checks don't require a display
    from modules.shell_bridge import DesktopApi

    webview.create_window(
        "CyberDeck",
        f"http://127.0.0.1:{port}/",
        js_api=DesktopApi(),   # Terminal talks to this in-process, not over the web port
        width=1400, height=900, min_size=(940, 620),
    )
    webview.start()  # blocks on the main thread until the window closes (Cocoa requirement)


if __name__ == "__main__":
    main()
