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


def _course_pages(q: str, limit: int):
    """Search inside imported courses' files. Skips any course whose source is the
    vault (already covered by _notes), and caps work so search stays snappy."""
    hits = []
    vroot = str(vault.vault_root().resolve())
    for c in courses._records():
        try:
            src = Path(c.get("source", "")).resolve()
        except Exception:
            continue
        if not src.exists() or not src.is_dir() or str(src).startswith(vroot):
            continue
        scanned, per = 0, 0
        for r, dirs, files in os.walk(src):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for n in files:
                if n.startswith(".") or not n.lower().endswith((".md", ".txt")):
                    continue
                scanned += 1
                if scanned > 300:
                    break
                p = Path(r) / n
                name_hit = q in n.lower()
                body_hit = False
                if not name_hit:
                    try:
                        body_hit = q in p.read_text("utf-8", errors="ignore").lower()
                    except OSError:
                        body_hit = False
                if name_hit or body_hit:
                    hits.append({"type": "course", "title": p.stem, "sub": c["title"] + " · course",
                                 "nav": "courses", "course": c["id"]})
                    per += 1
                if per >= 3 or len(hits) >= limit:
                    break
            if per >= 3 or len(hits) >= limit or scanned > 300:
                break
        if len(hits) >= limit:
            break
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
    results.extend(_course_pages(q, 8))

    return jsonify(results=results[:40], query=q)
