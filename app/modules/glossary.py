"""Glossary — auto-extracted term → definition pairs from the vault.

Scans notes for `**Term** — definition` / `- Term: definition` lines (the same shapes
the flashcard generator recognises) and de-dupes into a searchable term bank.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

from flask import Blueprint, jsonify

from . import vault

bp = Blueprint("glossary", __name__, url_prefix="/api/glossary")

_DEF = re.compile(r"^\s*[-*]?\s*\*\*(.+?)\*\*\s*[—:\-]\s*(.+?)\s*$")
_DEF2 = re.compile(r"^\s*[-*]\s+([A-Z][\w /()+-]{2,40}?):\s+(.+?)\s*$")


def _clean(s: str) -> str:
    return re.sub(r"[*_`]", "", s).strip()


@bp.route("")
def glossary():
    root = vault.vault_root()
    terms = {}
    if root.exists():
        for r, dirs, files in os.walk(root):
            dirs[:] = [d for d in dirs if not d.startswith(".") and d not in vault._HIDE]
            for n in files:
                if not n.lower().endswith(".md") or n.startswith("."):
                    continue
                p = Path(r) / n
                try:
                    text = p.read_text("utf-8", errors="ignore")
                except OSError:
                    continue
                rel = str(p.relative_to(root))
                for line in text.splitlines():
                    m = _DEF.match(line) or _DEF2.match(line)
                    if not m:
                        continue
                    term, defn = _clean(m.group(1)), _clean(m.group(2))
                    key = term.lower()
                    if term and defn and 2 <= len(term) <= 60 and len(defn) < 320 and key not in terms:
                        terms[key] = {"term": term, "definition": defn, "path": rel}
    items = sorted(terms.values(), key=lambda x: x["term"].lower())
    return jsonify(terms=items[:800], count=len(items))
