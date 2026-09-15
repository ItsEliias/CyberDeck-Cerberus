"""Knowledge module — serves the markdown vault as an Obsidian-style tree + rendered notes."""
from __future__ import annotations

import os
import re
from pathlib import Path

from flask import Blueprint, jsonify, request

from . import vault

# Standard markdown link to another .md note, e.g. [text](../foo/bar.md).
_MDLINK = re.compile(r"\]\(([^)\s]+?\.md)(?:#[^)]*)?\)", re.I)

bp = Blueprint("knowledge", __name__, url_prefix="/api/knowledge")


@bp.route("/tree")
def tree():
    root = vault.vault_root()
    return jsonify(root=str(root), exists=root.exists(), tree=vault.build_tree())


@bp.route("/note")
def note():
    path = request.args.get("path", "")
    try:
        return jsonify(vault.read_note(path))
    except (ValueError, FileNotFoundError) as e:
        return jsonify(error=str(e) or "not found"), 404


@bp.route("/save", methods=["POST"])
def save():
    d = request.get_json(silent=True) or {}
    try:
        vault.write_note(d.get("path", ""), d.get("content", ""))
        return jsonify(vault.read_note(d.get("path", "")))
    except (ValueError, OSError) as e:
        return jsonify(error=str(e)), 400


@bp.route("/create", methods=["POST"])
def create():
    d = request.get_json(silent=True) or {}
    folder = (d.get("folder") or "").strip().strip("/")
    name = (d.get("name") or "Untitled").strip()
    if not name.lower().endswith(".md"):
        name += ".md"
    rel = f"{folder}/{name}" if folder else name
    try:
        vault.write_note(rel, d.get("content", f"# {name[:-3]}\n\n"))
        return jsonify(ok=True, path=rel)
    except (ValueError, OSError) as e:
        return jsonify(error=str(e)), 400


@bp.route("/backlinks")
def backlinks():
    try:
        return jsonify(backlinks=vault.backlinks(request.args.get("path", "")))
    except (ValueError, FileNotFoundError):
        return jsonify(backlinks=[])


@bp.route("/resolve")
def resolve():
    return jsonify(path=vault.resolve_wikilink(request.args.get("target", "")))


@bp.route("/graph")
def graph():
    """Nodes = notes, edges = [[wikilinks]] between them. Capped to the most-connected."""
    root = vault.vault_root()
    nodes, edges = {}, []
    if root.exists():
        index, mdfiles = {}, []
        for r, dirs, files in os.walk(root):
            dirs[:] = [d for d in dirs if not d.startswith(".") and d not in vault._HIDE]
            for n in files:
                if n.lower().endswith(".md") and not n.startswith("."):
                    p = Path(r) / n
                    rel = str(p.relative_to(root))
                    mdfiles.append((rel, p))
                    index[p.stem.lower()] = rel

        def nid(rel):
            if rel not in nodes:
                nodes[rel] = {"id": rel, "label": Path(rel).stem, "deg": 0}
            return nodes[rel]

        for rel, p in mdfiles:
            try:
                text = p.read_text("utf-8", errors="ignore")
            except OSError:
                continue
            seen_t = set()
            targets = [m.group(1).strip() for m in vault._WIKILINK.finditer(text)]
            targets += [Path(m.group(1)).stem for m in _MDLINK.finditer(text)]
            for name in targets:
                tgt = index.get(name.lower())
                if tgt and tgt != rel and tgt not in seen_t:
                    seen_t.add(tgt)
                    nid(rel)["deg"] += 1
                    nid(tgt)["deg"] += 1
                    edges.append({"s": rel, "t": tgt})

    connected = {e["s"] for e in edges} | {e["t"] for e in edges}
    nl = sorted((n for n in nodes.values() if n["id"] in connected), key=lambda x: -x["deg"])[:150]
    keep = {n["id"] for n in nl}
    el = [e for e in edges if e["s"] in keep and e["t"] in keep]
    return jsonify(nodes=nl, edges=el)
