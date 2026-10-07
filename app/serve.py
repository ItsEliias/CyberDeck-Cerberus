"""
CyberDeck headless server, for an always-on machine (homelab, mini PC).

Runs the same app as the desktop window, without the window, on a production
WSGI server (waitress). It listens on 127.0.0.1 only; reach it from your phone
with `tailscale serve` (see docs/PHONE.md), never by opening the port.

    python app/serve.py              # 127.0.0.1:8137, shared per-user data
    python app/serve.py --port 9000

Data lives in the same per-user folder as the desktop app (override with
CYBERDECK_DATA), so on one machine both see the same decks and notes. Point
CYBERDECK_VAULT at your notes vault as usual.

The Terminal module is not available here: it only exists inside the desktop
window's in-process bridge and is never reachable over HTTP.
"""
from __future__ import annotations

import argparse
import logging

from datapaths import persist_data_env

persist_data_env(force=True)

from app import app  # noqa: E402 - must follow persist_data_env so modules read the env

DEFAULT_PORT = 8137  # same as the desktop window, so one `tailscale serve` works for either


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Run CyberDeck without a window.")
    parser.add_argument("--host", default="127.0.0.1",
                        help="bind address (default 127.0.0.1; keep it loopback and use tailscale serve)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args(argv)

    from waitress import serve

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger(__name__).info("CyberDeck on http://%s:%d", args.host, args.port)
    serve(app, host=args.host, port=args.port, threads=8, ident="cyberdeck")


if __name__ == "__main__":
    main()
