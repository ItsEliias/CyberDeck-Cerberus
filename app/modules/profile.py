"""
Profile + app preferences — stored server-side so they survive relaunches.

The packaged app runs in a native webview whose localStorage is NOT reliably
persisted between launches, so the onboarding flag / identity / theme / window mode
must live on disk (under the app's persistent data dir, mapped in desktop.py) rather
than in the browser. Single-user + offline, so this is a plain JSON file, no auth.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from flask import Blueprint, jsonify, request

bp = Blueprint("profile", __name__, url_prefix="/api/profile")

STORE = Path(os.environ.get(
    "CYBERDECK_PROFILE",
    str(Path(__file__).resolve().parents[2] / "data" / "profile.json"),
))

WINDOW_MODES = {"windowed", "fullscreen", "borderless"}


def _load() -> dict:
    if STORE.exists():
        try:
            d = json.loads(STORE.read_text("utf-8"))
            return d if isinstance(d, dict) else {}
        except Exception:
            pass
    return {}


def _save(d: dict) -> None:
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(d, indent=2), "utf-8")


def get_profile() -> dict:
    """Read the saved profile (used by desktop.py to pick the window mode)."""
    return _load()


def window_mode() -> str:
    m = _load().get("window_mode", "windowed")
    return m if m in WINDOW_MODES else "windowed"


@bp.route("", methods=["GET"])
def get():
    return jsonify(profile=_load())


@bp.route("", methods=["POST"])
def post():
    """Merge the posted fields into the stored profile (partial saves are fine)."""
    incoming = request.get_json(silent=True)
    if not isinstance(incoming, dict):
        return jsonify(error="expected a profile object"), 400
    cur = _load()
    cur.update(incoming)
    if "window_mode" in cur and cur["window_mode"] not in WINDOW_MODES:
        cur["window_mode"] = "windowed"
    _save(cur)
    return jsonify(profile=cur)
