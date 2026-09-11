"""
Feeds module — security-news RSS/Atom reader, offline-first.

Fetches user-configured feeds on demand (stdlib only), parses RSS + Atom, and caches
results to disk. When the network is down, the cache is served — a normal state, not
an error. Only http/https URLs are fetched, with a short timeout.
"""
from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

from flask import Blueprint, jsonify, request

bp = Blueprint("feeds", __name__, url_prefix="/api/feeds")

DATA = Path(os.environ.get(
    "CYBERDECK_FEEDS",
    str(Path(__file__).resolve().parents[2] / "data" / "feeds"),
))
SUBS_FILE = DATA / "subscriptions.json"
CACHE_FILE = DATA / "cache.json"

_DEFAULTS = [
    {"name": "The Hacker News", "url": "https://feeds.feedburner.com/TheHackersNews"},
    {"name": "BleepingComputer", "url": "https://www.bleepingcomputer.com/feed/"},
    {"name": "Krebs on Security", "url": "https://krebsonsecurity.com/feed/"},
    {"name": "CISA Advisories", "url": "https://www.cisa.gov/cybersecurity-advisories/all.xml"},
]


def _subs() -> list:
    if SUBS_FILE.exists():
        try:
            return json.loads(SUBS_FILE.read_text("utf-8"))
        except Exception:
            pass
    DATA.mkdir(parents=True, exist_ok=True)
    SUBS_FILE.write_text(json.dumps(_DEFAULTS, indent=2), "utf-8")
    return list(_DEFAULTS)


def _save_subs(subs):
    DATA.mkdir(parents=True, exist_ok=True)
    SUBS_FILE.write_text(json.dumps(subs, indent=2), "utf-8")


def _cache() -> dict:
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text("utf-8"))
        except Exception:
            pass
    return {"fetched": None, "items": []}


def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _parse(xml_bytes: bytes, source: str) -> list:
    items = []
    try:
        rootel = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return items
    for el in rootel.iter():
        tag = _strip_ns(el.tag)
        if tag not in ("item", "entry"):
            continue
        title, link, date, summary = "", "", "", ""
        for child in el:
            ct = _strip_ns(child.tag)
            if ct == "title":
                title = (child.text or "").strip()
            elif ct == "link":
                link = (child.get("href") or child.text or "").strip()
            elif ct in ("pubDate", "updated", "published"):
                date = (child.text or "").strip()
            elif ct in ("description", "summary") and not summary:
                summary = (child.text or "").strip()
        if title:
            items.append({"title": title, "link": link, "date": date,
                          "summary": summary[:280], "source": source})
    return items


def _fetch(url: str) -> bytes | None:
    if not url.startswith(("http://", "https://")):
        return None
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "CyberDeck/1.0 (+feeds)"})
        with urllib.request.urlopen(req, timeout=6) as resp:
            return resp.read()
    except Exception:
        return None


@bp.route("/list")
def list_subs():
    return jsonify(subscriptions=_subs())


@bp.route("/items")
def items():
    """Serve cached items; refetch only if ?refresh=1 or cache is empty."""
    cache = _cache()
    refresh = request.args.get("refresh") == "1"
    if not refresh and cache.get("items"):
        return jsonify(fetched=cache["fetched"], items=cache["items"], cached=True)

    all_items, online = [], False
    for sub in _subs():
        raw = _fetch(sub["url"])
        if raw is not None:
            online = True
            all_items.extend(_parse(raw, sub["name"]))
    if online:
        cache = {"fetched": datetime.now(timezone.utc).isoformat(timespec="seconds"), "items": all_items}
        DATA.mkdir(parents=True, exist_ok=True)
        CACHE_FILE.write_text(json.dumps(cache, indent=2), "utf-8")
        return jsonify(fetched=cache["fetched"], items=all_items, cached=False, online=True)
    # Offline: fall back to whatever we cached before (may be empty — normal state).
    return jsonify(fetched=cache.get("fetched"), items=cache.get("items", []), cached=True, online=False)


@bp.route("/add", methods=["POST"])
def add():
    d = request.get_json(silent=True) or {}
    url = (d.get("url") or "").strip()
    name = (d.get("name") or url).strip()
    if not url.startswith(("http://", "https://")):
        return jsonify(error="http(s) URL required"), 400
    subs = _subs()
    subs.append({"name": name, "url": url})
    _save_subs(subs)
    return jsonify(ok=True)


@bp.route("/remove", methods=["POST"])
def remove():
    url = (request.get_json(silent=True) or {}).get("url")
    subs = [s for s in _subs() if s.get("url") != url]
    _save_subs(subs)
    return jsonify(ok=True)
