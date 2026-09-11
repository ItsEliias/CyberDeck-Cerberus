"""Search module — one query across notes, targets, findings, playbooks, snippets, courses."""
from __future__ import annotations

import os
from pathlib import Path

from flask import Blueprint, jsonify, request

from . import vault, targets, playbooks, snippets, courses

bp = Blueprint("search", __name__, url_prefix="/api/search")


def _notes(q: str, limit: int):
    root = vault.vault_root()
    hits = []
    if not root.exists():
        return hits
    for r, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in vault._HIDE]
        for n in files:
            if not n.lower().endswith(".md") or n.startswith("."):
                continue
            p = Path(r) / n
            rel = str(p.relative_to(root))
            name_hit = q in n.lower()
            body_hit = False
            if not name_hit:
                try:
                    body_hit = q in p.read_text("utf-8", errors="ignore").lower()
                except OSError:
                    body_hit = False
            if name_hit or body_hit:
                hits.append({"type": "note", "title": p.stem, "sub": rel,
                             "nav": "knowledge", "path": rel, "where": "title" if name_hit else "body"})
                if len(hits) >= limit:
                    return hits
    return hits


@bp.route("")
def search():
    q = (request.args.get("q") or "").strip().lower()
    if len(q) < 2:
        return jsonify(results=[], query=q)
    results = []

    results.extend(_notes(q, 10))

    for t in targets._load()["targets"]:
        if q in t.get("name", "").lower() or q in t.get("host", "").lower():
            results.append({"type": "target", "title": t["name"], "sub": t.get("host", ""), "nav": "targets"})
        for f in t.get("findings", []):
            if q in f.get("title", "").lower():
                results.append({"type": "finding", "title": f["title"], "sub": t["name"] + " · " + f.get("severity", ""), "nav": "targets"})

    try:
        for f in sorted(playbooks.PB_DIR.glob("*.md")):
            title, _, _ = playbooks._parse(f)
            if q in title.lower() or q in f.stem.lower():
                results.append({"type": "playbook", "title": title, "sub": "playbook", "nav": "playbooks"})
    except Exception:
        pass

    for s in snippets._load()["snippets"]:
        if q in s["title"].lower() or q in s["command"].lower():
            results.append({"type": "snippet", "title": s["title"], "sub": s["category"], "nav": "snippets"})

    for c in courses._records():
        if q in c.get("title", "").lower():
            results.append({"type": "course", "title": c["title"], "sub": "course", "nav": "courses"})

    return jsonify(results=results[:40], query=q)
