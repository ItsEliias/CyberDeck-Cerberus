"""Ratings module — per-topic confidence self-ratings (1-5) for the weak-area heatmap.

Topics are just strings (deck / playbook / course names the UI supplies); this only
stores {topic: rating}. Rating 0/None clears it.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

from flask import Blueprint, jsonify, request

bp = Blueprint("ratings", __name__, url_prefix="/api/ratings")

STORE = Path(os.environ.get(
    "CYBERDECK_RATINGS",
    str(Path(__file__).resolve().parents[2] / "data" / "ratings.json"),
))


def _load() -> dict:
    if STORE.exists():
        try:
            return json.loads(STORE.read_text("utf-8"))
        except Exception:
            pass
    return {}


def _save(d: dict):
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(d, indent=2), "utf-8")


@bp.route("/list")
def list_ratings():
    return jsonify(ratings=_load())


@bp.route("/set", methods=["POST"])
def set_rating():
    data = request.get_json(silent=True) or {}
    topic = (data.get("topic") or "").strip()
    if not topic:
        return jsonify(error="topic required"), 400
    d = _load()
    try:
        rating = int(data.get("rating") or 0)
    except (TypeError, ValueError):
        rating = 0
    if rating <= 0:
        d.pop(topic, None)
    else:
        d[topic] = max(1, min(5, rating))
    _save(d)
    return jsonify(ok=True)
