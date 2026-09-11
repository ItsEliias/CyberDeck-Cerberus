"""
Sessions module — CTF/box tracker: per-machine timer, methodology checklist, notes.

The HTB/THM loop: start a box, the timer runs, tick the methodology steps, keep notes.
Timer state = accumulated seconds + a started_at while running; elapsed is computed live.
"""
from __future__ import annotations

import json
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path

from flask import Blueprint, jsonify, request

bp = Blueprint("sessions", __name__, url_prefix="/api/sessions")

STORE = Path(os.environ.get(
    "CYBERDECK_SESSIONS",
    str(Path(__file__).resolve().parents[2] / "data" / "sessions.json"),
))
PLATFORMS = ["HTB", "THM", "PortSwigger", "VulnHub", "PG", "Other"]
DEFAULT_STEPS = [
    "Recon / port scan", "Enumerate services", "Find foothold / initial access",
    "Stabilise shell", "Local enumeration", "Privilege escalation",
    "Root / proof", "Notes → writeup",
]


def _load() -> dict:
    if STORE.exists():
        try:
            return json.loads(STORE.read_text("utf-8"))
        except Exception:
            pass
    return {"sessions": []}


def _save(d: dict):
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(d, indent=2), "utf-8")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _elapsed(s) -> int:
    e = float(s.get("accumulated", 0))
    if s.get("started_at"):
        try:
            e += (_now() - datetime.fromisoformat(s["started_at"])).total_seconds()
        except Exception:
            pass
    return int(e)


def _public(s) -> dict:
    steps = s.get("checklist", [])
    return {"id": s["id"], "name": s["name"], "platform": s.get("platform", "Other"),
            "target": s.get("target", ""), "status": s.get("status", "active"),
            "elapsed": _elapsed(s), "running": bool(s.get("started_at")),
            "notes": s.get("notes", ""), "checklist": steps,
            "done": sum(1 for x in steps if x.get("done")), "total": len(steps),
            "created": s.get("created", "")}


@bp.route("/list")
def list_sessions():
    d = _load()
    return jsonify(sessions=[_public(s) for s in d["sessions"]], platforms=PLATFORMS)


@bp.route("/create", methods=["POST"])
def create():
    data = request.get_json(silent=True) or {}
    if not (data.get("name") or "").strip():
        return jsonify(error="name required"), 400
    d = _load()
    s = {"id": secrets.token_hex(6), "name": data["name"].strip(),
         "platform": data.get("platform") if data.get("platform") in PLATFORMS else "Other",
         "target": data.get("target", "").strip(), "status": "active",
         "accumulated": 0, "started_at": _now().isoformat(), "notes": "",
         "checklist": [{"text": t, "done": False} for t in DEFAULT_STEPS],
         "created": _now().isoformat(timespec="seconds")}
    d["sessions"].insert(0, s)
    _save(d)
    return jsonify(ok=True, id=s["id"])


def _find(d, sid):
    for s in d["sessions"]:
        if s["id"] == sid:
            return s
    return None


@bp.route("/<sid>")
def detail(sid):
    s = _find(_load(), sid)
    return (jsonify(_public(s)) if s else (jsonify(error="not found"), 404))


@bp.route("/<sid>", methods=["POST"])
def update(sid):
    data = request.get_json(silent=True) or {}
    d = _load()
    s = _find(d, sid)
    if not s:
        return jsonify(error="not found"), 404
    if "notes" in data:
        s["notes"] = data["notes"]
    if data.get("status") in ("active", "paused", "done"):
        s["status"] = data["status"]
        if data["status"] == "done" and s.get("started_at"):  # stop the clock on completion
            s["accumulated"] = _elapsed(s)
            s["started_at"] = None
    _save(d)
    return jsonify(_public(s))


@bp.route("/<sid>/timer", methods=["POST"])
def timer(sid):
    action = (request.get_json(silent=True) or {}).get("action")
    d = _load()
    s = _find(d, sid)
    if not s:
        return jsonify(error="not found"), 404
    if action == "pause" and s.get("started_at"):
        s["accumulated"] = _elapsed(s)
        s["started_at"] = None
    elif action == "start" and not s.get("started_at"):
        s["started_at"] = _now().isoformat()
        s["status"] = "active"
    _save(d)
    return jsonify(_public(s))


@bp.route("/<sid>/check", methods=["POST"])
def check(sid):
    data = request.get_json(silent=True) or {}
    idx = data.get("index")
    d = _load()
    s = _find(d, sid)
    if not s:
        return jsonify(error="not found"), 404
    if isinstance(idx, int) and 0 <= idx < len(s.get("checklist", [])):
        s["checklist"][idx]["done"] = bool(data.get("done"))
        _save(d)
    return jsonify(_public(s))


@bp.route("/<sid>", methods=["DELETE"])
def delete(sid):
    d = _load()
    n = len(d["sessions"])
    d["sessions"] = [s for s in d["sessions"] if s["id"] != sid]
    if len(d["sessions"]) == n:
        return jsonify(error="not found"), 404
    _save(d)
    return jsonify(ok=True)
