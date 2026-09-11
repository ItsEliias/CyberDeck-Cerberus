"""Targets module — engagement targets + findings. Plain JSON store (no secrets here)."""
from __future__ import annotations

import json
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path

from flask import Blueprint, jsonify, request, send_file, abort

bp = Blueprint("targets", __name__, url_prefix="/api/targets")

STORE = Path(os.environ.get(
    "CYBERDECK_TARGETS",
    str(Path(__file__).resolve().parents[2] / "data" / "targets.json"),
))
EVIDENCE_DIR = Path(os.environ.get(
    "CYBERDECK_EVIDENCE",
    str(Path(__file__).resolve().parents[2] / "data" / "evidence"),
))
SEVERITIES = ["info", "low", "medium", "high", "critical"]
STATUSES = ["scoping", "active", "reporting", "done"]
_IMG_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


def _load() -> dict:
    if STORE.exists():
        try:
            return json.loads(STORE.read_text("utf-8"))
        except Exception:
            pass
    return {"targets": []}


def _save(data: dict):
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(data, indent=2), "utf-8")


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@bp.route("/list")
def list_targets():
    data = _load()
    for t in data["targets"]:
        f = t.get("findings", [])
        t["finding_count"] = len(f)
        t["open_high"] = sum(1 for x in f if x.get("severity") in ("high", "critical"))
    return jsonify(targets=data["targets"], severities=SEVERITIES, statuses=STATUSES)


@bp.route("/add", methods=["POST"])
def add_target():
    d = request.get_json(silent=True) or {}
    if not (d.get("name") or "").strip():
        return jsonify(error="name required"), 400
    data = _load()
    t = {"id": secrets.token_hex(6), "name": d["name"].strip(), "host": d.get("host", "").strip(),
         "os": d.get("os", "").strip(), "status": d.get("status", "scoping"),
         "findings": [], "created": _now()}
    data["targets"].append(t)
    _save(data)
    return jsonify(ok=True, id=t["id"])


@bp.route("/<tid>", methods=["DELETE"])
def delete_target(tid):
    data = _load()
    n = len(data["targets"])
    data["targets"] = [t for t in data["targets"] if t["id"] != tid]
    if len(data["targets"]) == n:
        return jsonify(error="not found"), 404
    _save(data)
    return jsonify(ok=True)


@bp.route("/<tid>/status", methods=["POST"])
def set_status(tid):
    status = (request.get_json(silent=True) or {}).get("status")
    data = _load()
    for t in data["targets"]:
        if t["id"] == tid:
            t["status"] = status if status in STATUSES else t["status"]
            _save(data)
            return jsonify(ok=True)
    return jsonify(error="not found"), 404


@bp.route("/<tid>/finding", methods=["POST"])
def add_finding(tid):
    d = request.get_json(silent=True) or {}
    if not (d.get("title") or "").strip():
        return jsonify(error="title required"), 400
    data = _load()
    for t in data["targets"]:
        if t["id"] == tid:
            fnd = {"id": secrets.token_hex(6), "title": d["title"].strip(),
                   "severity": d.get("severity") if d.get("severity") in SEVERITIES else "info",
                   "notes": d.get("notes", ""), "created": _now()}
            t.setdefault("findings", []).append(fnd)
            _save(data)
            return jsonify(ok=True, id=fnd["id"])
    return jsonify(error="not found"), 404


@bp.route("/<tid>/finding/<fid>", methods=["DELETE"])
def delete_finding(tid, fid):
    data = _load()
    for t in data["targets"]:
        if t["id"] == tid:
            t["findings"] = [f for f in t.get("findings", []) if f["id"] != fid]
            _save(data)
            return jsonify(ok=True)
    return jsonify(error="not found"), 404


# ── Evidence attachments (#9) ─────────────────────────────────────────────────
def _hex(s):
    return bool(s) and all(c in "0123456789abcdef" for c in s)


@bp.route("/<tid>/finding/<fid>/evidence", methods=["POST"])
def add_evidence(tid, fid):
    if "file" not in request.files:
        return jsonify(error="no file"), 400
    f = request.files["file"]
    name = f.filename or "evidence"
    ext = Path(name).suffix.lower() or ".bin"
    eid = secrets.token_hex(8)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    dest = EVIDENCE_DIR / (eid + ext)
    f.save(str(dest))
    data = _load()
    for t in data["targets"]:
        if t["id"] == tid:
            for fnd in t.get("findings", []):
                if fnd["id"] == fid:
                    fnd.setdefault("evidence", []).append(
                        {"id": eid, "name": name, "ext": ext, "image": ext in _IMG_EXT})
                    _save(data)
                    return jsonify(ok=True, id=eid, image=ext in _IMG_EXT)
    dest.unlink(missing_ok=True)
    return jsonify(error="finding not found"), 404


@bp.route("/evidence/<eid>")
def get_evidence(eid):
    if not _hex(eid):
        abort(404)
    for p in EVIDENCE_DIR.glob(eid + ".*"):
        return send_file(str(p))
    abort(404)


@bp.route("/evidence/<eid>", methods=["DELETE"])
def del_evidence(eid):
    if not _hex(eid):
        return jsonify(error="bad id"), 400
    for p in EVIDENCE_DIR.glob(eid + ".*"):
        p.unlink(missing_ok=True)
    data = _load()
    for t in data["targets"]:
        for fnd in t.get("findings", []):
            ev = fnd.get("evidence", [])
            keep = [e for e in ev if e["id"] != eid]
            if len(keep) != len(ev):
                fnd["evidence"] = keep
                _save(data)
    return jsonify(ok=True)
