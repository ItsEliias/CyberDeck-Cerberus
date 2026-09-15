"""Journal module — a timestamped lab/engagement log (idea 11) that also compiles into
a CTF write-up (idea 12).

Each entry is tagged to a box/target. Log as you work; export a box's entries as a
structured markdown write-up for your portfolio.
"""
from __future__ import annotations

import json
import os
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path

from flask import Blueprint, jsonify, request

bp = Blueprint("journal", __name__, url_prefix="/api/journal")

STORE = Path(os.environ.get(
    "CYBERDECK_JOURNAL",
    str(Path(__file__).resolve().parents[2] / "data" / "journal.json"),
))


def _load() -> dict:
    if STORE.exists():
        try:
            return json.loads(STORE.read_text("utf-8"))
        except Exception:
            pass
    return {"entries": []}


def _save(d: dict):
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(d, indent=2), "utf-8")


@bp.route("/list")
def list_entries():
    target = request.args.get("target")
    d = _load()
    items = [e for e in d["entries"] if not target or e.get("target") == target]
    items = sorted(items, key=lambda x: x.get("created", ""), reverse=True)
    targets = sorted({e.get("target", "") for e in d["entries"] if e.get("target")})
    return jsonify(entries=items, targets=targets, count=len(items))


@bp.route("/add", methods=["POST"])
def add():
    data = request.get_json(silent=True) or {}
    body = (data.get("body") or "").strip()
    if not body:
        return jsonify(error="body required"), 400
    d = _load()
    e = {"id": secrets.token_hex(6),
         "target": (data.get("target") or "General").strip()[:80],
         "title": (data.get("title") or "").strip()[:120],
         "body": body,
         "created": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    d["entries"].append(e)
    _save(d)
    return jsonify(ok=True, entry=e)


@bp.route("/<eid>", methods=["DELETE"])
def delete(eid):
    d = _load()
    d["entries"] = [e for e in d["entries"] if e.get("id") != eid]
    _save(d)
    return jsonify(ok=True)


@bp.route("/writeup")
def writeup():
    """Compile a target's entries (oldest→newest) into a markdown write-up."""
    target = request.args.get("target") or "General"
    d = _load()
    items = sorted([e for e in d["entries"] if e.get("target") == target],
                   key=lambda x: x.get("created", ""))
    lines = ["# " + target + " — Write-up", "",
             "_" + str(len(items)) + " log entr" + ("y" if len(items) == 1 else "ies") + "._", ""]
    for e in items:
        head = e.get("title") or e.get("created", "")[:16].replace("T", " ")
        lines += ["## " + head, ""]
        if e.get("title") and e.get("created"):
            lines += ["> " + e["created"][:16].replace("T", " "), ""]
        lines += [e.get("body", ""), ""]
    md = "\n".join(lines)
    slug = re.sub(r"[^a-z0-9]+", "-", target.lower()).strip("-") or "writeup"
    return jsonify(markdown=md, filename=slug + "-writeup.md", entries=len(items))
