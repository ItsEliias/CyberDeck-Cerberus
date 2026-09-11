"""
CyberDeck-on-Cerberus — Flask entry (P1 skeleton).

Serves the CyberDeck shell (Cerberus's jarvis-v2 HUD look) and, for now, stub JSON
so the shell has something to render. Real per-module blueprints land in P2 under
app/modules/ and get registered here.
"""
from __future__ import annotations

from flask import Flask, render_template, jsonify

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

app = Flask(__name__, static_folder="static", template_folder="templates")
for _bp in (knowledge_bp, courses_bp, credentials_bp, targets_bp, netlab_bp,
            home_bp, playbooks_bp, reports_bp, feeds_bp, topology_bp, board_bp,
            flashcards_bp, snippets_bp, search_bp):
    app.register_blueprint(_bp)

# ── The 12 CyberDeck modules the shell navigates between. ──────────────────────
# (label, icon key, blurb) — icons resolved to inline SVG in the template/deck.js.
MODULES = [
    {"id": "home", "label": "Home", "blurb": "What to study next"},
    {"id": "courses", "label": "Courses", "blurb": "Structured study"},
    {"id": "knowledge", "label": "Knowledge", "blurb": "Your vault, Obsidian-style"},
    {"id": "playbooks", "label": "Playbooks", "blurb": "Repeatable procedures"},
    {"id": "flashcards", "label": "Flashcards", "blurb": "Spaced-repetition review"},
    {"id": "netlab", "label": "NetLab", "blurb": "Network tools"},
    {"id": "targets", "label": "Targets", "blurb": "Engagement targets + findings"},
    {"id": "board", "label": "Attack Board", "blurb": "Kanban of attack progress"},
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


@app.route("/api/health")
def health():
    return jsonify(ok=True, app="cyberdeck-cerberus", phase="P1")


@app.route("/api/modules")
def modules():
    return jsonify(modules=MODULES)


if __name__ == "__main__":
    # P1: dev server. P4 wraps this in a desktop shell (pywebview/desktop_bridge).
    app.run(host="127.0.0.1", port=7100, debug=True)
