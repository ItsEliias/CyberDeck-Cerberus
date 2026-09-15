"""Cheat Sheets — build your own one-page quick-refs as markdown; copy/export.

Simple titled markdown docs you compose (optionally inserting snippets from the UI).
Seeded once with a recon starter so the module isn't empty.
"""
from __future__ import annotations

import json
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path

from flask import Blueprint, jsonify, request

bp = Blueprint("cheatsheets", __name__, url_prefix="/api/cheatsheets")

STORE = Path(os.environ.get(
    "CYBERDECK_CHEATSHEETS",
    str(Path(__file__).resolve().parents[2] / "data" / "cheatsheets.json"),
))

_STARTER = {
    "title": "Recon Quick-Ref",
    "body": ("# Recon Quick-Ref\n\n"
             "## Nmap\n```\nnmap -sC -sV -oA scan <ip>\nnmap -p- --min-rate 5000 <ip>\n```\n\n"
             "## Web content\n```\nffuf -w /usr/share/wordlists/dirb/common.txt -u http://<ip>/FUZZ\ngobuster dir -u http://<ip> -w common.txt\n```\n\n"
             "## SMB\n```\nenum4linux -a <ip>\nsmbclient -L //<ip> -N\n```\n"),
}


def _load() -> dict:
    if STORE.exists():
        try:
            return json.loads(STORE.read_text("utf-8"))
        except Exception:
            pass
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    d = {"sheets": [{"id": secrets.token_hex(6), "title": _STARTER["title"], "body": _STARTER["body"], "updated": now}]}
    _save(d)
    return d


def _save(d: dict):
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(d, indent=2), "utf-8")


@bp.route("/list")
def list_sheets():
    d = _load()
    sheets = sorted(d["sheets"], key=lambda x: x.get("updated", ""), reverse=True)
    return jsonify(sheets=[{"id": s["id"], "title": s["title"], "updated": s.get("updated", "")} for s in sheets])


@bp.route("/<sid>")
def get_sheet(sid):
    s = next((x for x in _load()["sheets"] if x["id"] == sid), None)
    return jsonify(sheet=s) if s else (jsonify(error="not found"), 404)


@bp.route("/save", methods=["POST"])
def save_sheet():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "Untitled").strip()[:120]
    body = data.get("body") or ""
    d = _load()
    sid = data.get("id")
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    s = next((x for x in d["sheets"] if x["id"] == sid), None) if sid else None
    if s:
        s["title"], s["body"], s["updated"] = title, body, now
    else:
        s = {"id": secrets.token_hex(6), "title": title, "body": body, "updated": now}
        d["sheets"].append(s)
    _save(d)
    return jsonify(ok=True, id=s["id"])


@bp.route("/<sid>", methods=["DELETE"])
def delete_sheet(sid):
    d = _load()
    d["sheets"] = [x for x in d["sheets"] if x["id"] != sid]
    _save(d)
    return jsonify(ok=True)
