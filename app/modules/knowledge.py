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
