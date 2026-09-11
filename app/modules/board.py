"""Attack Board module — a kanban of attack progress (ReconDesk-style)."""
from __future__ import annotations

import json
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path

from flask import Blueprint, jsonify, request

bp = Blueprint("board", __name__, url_prefix="/api/board")

STORE = Path(os.environ.get(
    "CYBERDECK_BOARD",
    str(Path(__file__).resolve().parents[2] / "data" / "board.json"),
))
DEFAULT_COLUMNS = [
    {"id": "recon", "name": "Recon"},
    {"id": "foothold", "name": "Foothold"},
    {"id": "privesc", "name": "Priv Esc"},
    {"id": "looted", "name": "Looted"},
]


def _load() -> dict:
    if STORE.exists():
        try:
            d = json.loads(STORE.read_text("utf-8"))
            d.setdefault("columns", DEFAULT_COLUMNS)
            d.setdefault("cards", [])
            return d
        except Exception:
            pass
    return {"columns": list(DEFAULT_COLUMNS), "cards": []}


def _save(d: dict):
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(d, indent=2), "utf-8")


def _cols(d):
    return {c["id"] for c in d["columns"]}


@bp.route("")
def board():
    return jsonify(_load())


@bp.route("/card", methods=["POST"])
def add_card():
    data = request.get_json(silent=True) or {}
    if not (data.get("title") or "").strip():
        return jsonify(error="title required"), 400
    d = _load()
    col = data.get("col") if data.get("col") in _cols(d) else d["columns"][0]["id"]
    card = {"id": secrets.token_hex(6), "col": col, "title": data["title"].strip(),
            "notes": data.get("notes", ""), "target": data.get("target", ""),
            "created": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    d["cards"].append(card)
    _save(d)
    return jsonify(ok=True, card=card)


@bp.route("/card/<cid>", methods=["POST"])
def update_card(cid):
    data = request.get_json(silent=True) or {}
    d = _load()
    for c in d["cards"]:
        if c["id"] == cid:
            if data.get("col") in _cols(d):
                c["col"] = data["col"]
            if "title" in data and data["title"].strip():
                c["title"] = data["title"].strip()
            if "notes" in data:
                c["notes"] = data["notes"]
            if "target" in data:
                c["target"] = data["target"]
            _save(d)
            return jsonify(ok=True)
    return jsonify(error="not found"), 404


@bp.route("/card/<cid>", methods=["DELETE"])
def delete_card(cid):
    d = _load()
    n = len(d["cards"])
    d["cards"] = [c for c in d["cards"] if c["id"] != cid]
    if len(d["cards"]) == n:
        return jsonify(error="not found"), 404
    _save(d)
    return jsonify(ok=True)
