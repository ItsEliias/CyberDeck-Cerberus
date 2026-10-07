"""
CyberDeck-on-Cerberus — Flask entry (P1 skeleton).

Serves the CyberDeck shell (Cerberus's jarvis-v2 HUD look) and, for now, stub JSON
so the shell has something to render. Real per-module blueprints land in P2 under
app/modules/ and get registered here.
"""
from __future__ import annotations

import os
import sys

from flask import Flask, abort, jsonify, render_template, request, send_from_directory

from modules.knowledge import bp as knowledge_bp
from modules.courses import bp as courses_bp
from modules.credentials import bp as credentials_bp
from modules.targets import bp as targets_bp
from modules.netlab import bp as netlab_bp
from modules.home import bp as home_bp
from modules.playbooks import bp as playbooks_bp
from modules.reports import bp as reports_bp
from modules.feeds import bp as feeds_bp
from modules.topology import bp as topology_bp
from modules.board import bp as board_bp
from modules.flashcards import bp as flashcards_bp
from modules.snippets import bp as snippets_bp
from modules.search import bp as search_bp
from modules.activity import bp as activity_bp
from modules.scanparse import bp as scan_bp
from modules.sessions import bp as sessions_bp
from modules.resources import bp as resources_bp
from modules.toolkit import bp as toolkit_bp
from modules.ratings import bp as ratings_bp
from modules.paths import bp as paths_bp
from modules.journal import bp as journal_bp
from modules.glossary import bp as glossary_bp
from modules.cheatsheets import bp as cheatsheets_bp
from modules.profile import bp as profile_bp

# When frozen by PyInstaller, static/ + templates/ are unpacked into sys._MEIPASS.
if getattr(sys, "frozen", False):
    _base = sys._MEIPASS  # type: ignore[attr-defined]
    _static, _templates = os.path.join(_base, "static"), os.path.join(_base, "templates")
else:
    _static, _templates = "static", "templates"

app = Flask(__name__, static_folder=_static, template_folder=_templates)
for _bp in (knowledge_bp, courses_bp, credentials_bp, targets_bp, netlab_bp,
            home_bp, playbooks_bp, reports_bp, feeds_bp, topology_bp, board_bp,
            flashcards_bp, snippets_bp, search_bp, activity_bp, scan_bp, sessions_bp,
            resources_bp, toolkit_bp, ratings_bp, paths_bp, journal_bp, glossary_bp,
            cheatsheets_bp, profile_bp):
    app.register_blueprint(_bp)

# ── The 12 CyberDeck modules the shell navigates between. ──────────────────────
# (label, icon key, blurb) — icons resolved to inline SVG in the template/deck.js.
MODULES = [
    {"id": "home", "label": "Home", "blurb": "What to study next"},
    {"id": "courses", "label": "Courses", "blurb": "Structured study"},
    {"id": "knowledge", "label": "Knowledge", "blurb": "Your vault, Obsidian-style"},
    {"id": "playbooks", "label": "Playbooks", "blurb": "Repeatable procedures"},
    {"id": "flashcards", "label": "Flashcards", "blurb": "Spaced-repetition review"},
    {"id": "progress", "label": "Progress", "blurb": "Streaks + activity heatmap"},
    {"id": "netlab", "label": "NetLab", "blurb": "Network tools"},
    {"id": "targets", "label": "Targets", "blurb": "Engagement targets + findings"},
    {"id": "board", "label": "Attack Board", "blurb": "Kanban of attack progress"},
    {"id": "scan", "label": "Scan Import", "blurb": "Parse nmap/gobuster → targets"},
    {"id": "sessions", "label": "Sessions", "blurb": "CTF/box tracker + timer"},
    {"id": "topology", "label": "Topology", "blurb": "Host graph"},
    {"id": "reports", "label": "Reports", "blurb": "Draft + export"},
    {"id": "credentials", "label": "Credentials", "blurb": "Encrypted vault"},
    {"id": "snippets", "label": "Snippets", "blurb": "Payloads + commands"},
    {"id": "feeds", "label": "Feeds", "blurb": "Security news"},
    {"id": "terminal", "label": "Terminal", "blurb": "Shell"},
]


@app.route("/")
def index():
    return render_template("shell.html", modules=MODULES)


@app.route("/sw.js")
def service_worker():
    # Served from the root (not /static/) so its scope covers the whole app.
    resp = send_from_directory(app.static_folder, "sw.js", mimetype="text/javascript", max_age=0)
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["Service-Worker-Allowed"] = "/"
    return resp


@app.route("/manifest.webmanifest")
def manifest():
    return send_from_directory(app.static_folder, "manifest.webmanifest",
                               mimetype="application/manifest+json", max_age=0)


# ── Phone access over Tailscale ───────────────────────────────────────────────
# `tailscale serve` proxies tailnet requests to this loopback port and adds a
# Tailscale-User-Login header naming who is connecting. When
# CYBERDECK_ALLOWED_USERS is set (comma-separated tailnet logins), only those
# people get in that way. Requests without the header are local (the desktop
# window on this machine) and are unaffected.
def _allowed_users() -> set[str]:
    raw = os.environ.get("CYBERDECK_ALLOWED_USERS", "")
    return {u.strip().lower() for u in raw.split(",") if u.strip()}


@app.before_request
def _tailnet_allowlist():
    login = request.headers.get("Tailscale-User-Login")
    allowed = _allowed_users()
    if login is not None and allowed and login.strip().lower() not in allowed:
        abort(403)


@app.route("/api/health")
def health():
    return jsonify(ok=True, app="cyberdeck-cerberus", phase="P1")


@app.route("/api/modules")
def modules():
    return jsonify(modules=MODULES)


if __name__ == "__main__":
    # Dev server by default (debug + reloader). The desktop launcher
    # (build-macos-app.sh) runs this with CYBERDECK_DEBUG=0 so the reloader
    # doesn't fork a second process the launcher can't track/kill, and
    # CYBERDECK_PORT to pick the loopback port.
    port = int(os.environ.get("CYBERDECK_PORT", "7100"))
    debug = os.environ.get("CYBERDECK_DEBUG", "1") == "1"
    app.run(host="127.0.0.1", port=port, debug=debug, use_reloader=debug, threaded=True)
