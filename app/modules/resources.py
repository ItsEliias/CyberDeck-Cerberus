"""Resources module — a bookmark library: save/tag links (title, url, tags, note).

Unlike Courses (which fetches + indexes full content), this is lightweight: just the
link + metadata, with tag filtering. Seeded with a handful of great free references.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

from flask import Blueprint, jsonify, request

bp = Blueprint("resources", __name__, url_prefix="/api/resources")

STORE = Path(os.environ.get(
    "CYBERDECK_RESOURCES",
    str(Path(__file__).resolve().parents[2] / "data" / "resources.json"),
))

# (title, url, tags) — topped up on first load; deleting one keeps it gone unless
# a fresh store is created (same trade-off as the flashcard seeds).
_SEED = [
    ("OWASP Top 10", "https://owasp.org/Top10/", ["web", "reference"]),
    ("PortSwigger Web Security Academy", "https://portswigger.net/web-security", ["web", "training"]),
    ("HackTricks", "https://book.hacktricks.xyz/", ["pentest", "reference"]),
    ("GTFOBins", "https://gtfobins.github.io/", ["privesc", "reference"]),
    ("PayloadsAllTheThings", "https://github.com/swisskyrepo/PayloadsAllTheThings", ["pentest", "payloads"]),
    ("TryHackMe", "https://tryhackme.com", ["training"]),
    ("Hack The Box", "https://www.hackthebox.com", ["training"]),
    ("MITRE ATT&CK", "https://attack.mitre.org/", ["blue-team", "reference"]),
    ("CyberChef", "https://gchq.github.io/CyberChef/", ["tools"]),
    ("crt.sh — certificate search", "https://crt.sh/", ["recon", "tools"]),
]


def _mk(title: str, url: str, tags, note: str = "") -> dict:
    return {"id": secrets.token_hex(6), "title": title, "url": url,
            "tags": list(tags), "note": note,
            "created": datetime.now(timezone.utc).isoformat(timespec="seconds")}


def _save(d: dict):
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(d, indent=2), "utf-8")


def _topup(d: dict) -> dict:
    have = {i.get("url", "") for i in d.get("items", [])}
    changed = False
    for title, url, tags in _SEED:
        if url not in have:
            d.setdefault("items", []).append(_mk(title, url, tags))
            changed = True
    if changed:
        _save(d)
    return d


def _load() -> dict:
    d = {"items": []}
    if STORE.exists():
        try:
            d = json.loads(STORE.read_text("utf-8"))
        except Exception:
            d = {"items": []}
    return _topup(d)


@bp.route("/list")
def list_resources():
    d = _load()
    tag = request.args.get("tag")
    items = d["items"]
    if tag:
        items = [i for i in items if tag in i.get("tags", [])]
    items = sorted(items, key=lambda x: x.get("created", ""), reverse=True)
    tags = sorted({t for i in d["items"] for t in i.get("tags", [])})
    return jsonify(items=items, tags=tags, count=len(items))


@bp.route("/add", methods=["POST"])
def add():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    if not re.match(r"^https?://", url, re.I):
        return jsonify(error="enter an http(s):// URL"), 400
    title = (data.get("title") or "").strip() or urllib.parse.urlparse(url).netloc
    raw = data.get("tags") or []
    if isinstance(raw, str):
        raw = raw.split(",")
    tags = [t.strip().lower() for t in raw if str(t).strip()]
    d = _load()
    item = _mk(title, url, tags, (data.get("note") or "").strip())
    d["items"].append(item)
    _save(d)
    return jsonify(ok=True, item=item)


@bp.route("/<rid>", methods=["DELETE"])
def delete(rid):
    d = _load()
    d["items"] = [i for i in d["items"] if i.get("id") != rid]
    _save(d)
    return jsonify(ok=True)
