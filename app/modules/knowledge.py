"""Knowledge module — serves the markdown vault as an Obsidian-style tree + rendered notes."""
from __future__ import annotations

from flask import Blueprint, jsonify, request

from . import vault

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
