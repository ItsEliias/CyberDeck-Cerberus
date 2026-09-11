"""
Vault data layer — the markdown vault on disk is the source of truth (CyberDeck hard rule).

Enforces the containment rule: every path is resolved and checked to live *inside* the
vault root before it is ever read. Nothing outside the root is reachable through the API.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

# Vault root: override with CYBERDECK_VAULT, else default to the CyberBase vault
# that ships with the Electron project (used here for testing).
_DEFAULT = "/Users/codyliddell/Documents/Claude/Projects/Cyberdeck/.reference/CyberBase"
VAULT_ROOT = Path(os.environ.get("CYBERDECK_VAULT", _DEFAULT)).expanduser()

# Folders we never surface in the tree.
_HIDE = {".git", ".obsidian", ".claude-flow", ".claude", "node_modules", "__pycache__"}


def vault_root() -> Path:
    return VAULT_ROOT.resolve()


def _safe_resolve(relpath: str) -> Path:
    """Resolve a vault-relative path and guarantee it stays inside the vault root."""
    root = vault_root()
    # Reject absolute paths and any traversal outright before touching the fs.
    rel = (relpath or "").lstrip("/\\")
    target = (root / rel).resolve()
    if target != root and root not in target.parents:
        raise ValueError("path escapes vault root")
    return target


def _numkey(name: str):
    """Folder-first, numeric-aware sort key (so 02- sorts before 10-)."""
    parts = re.split(r"(\d+)", name)
    return [int(p) if p.isdigit() else p.lower() for p in parts]


def build_tree() -> dict:
    """Nested {name,type,path,children,count} tree of folders + .md files."""
    root = vault_root()

    def walk(d: Path) -> list:
        items = []
        try:
            entries = list(d.iterdir())
        except OSError:
            return items
        folders, files = [], []
        for e in entries:
            if e.name.startswith(".") or e.name in _HIDE:
                continue
            if e.is_dir():
                folders.append(e)
            elif e.is_file() and e.suffix.lower() == ".md":
                files.append(e)
        for f in sorted(folders, key=lambda p: _numkey(p.name)):
            kids = walk(f)
            count = sum(c.get("count", 0) if c["type"] == "folder" else 1 for c in kids)
            items.append({
                "name": f.name, "type": "folder",
                "path": str(f.relative_to(root)), "children": kids, "count": count,
            })
        for f in sorted(files, key=lambda p: _numkey(p.name)):
            items.append({
                "name": f.stem, "type": "file", "path": str(f.relative_to(root)),
            })
        return items

    kids = walk(root)
    count = sum(c.get("count", 0) if c["type"] == "folder" else 1 for c in kids)
    return {"name": root.name, "type": "folder", "path": "", "children": kids, "count": count}


# [[wikilink]] → styled span (targets resolved client-side later).
_WIKILINK = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")


def _prep_wikilinks(text: str) -> str:
    def repl(m):
        target, label = m.group(1), m.group(2) or m.group(1)
        return f'<span class="md-wikilink" data-target="{target.strip()}">{label.strip()}</span>'
    return _WIKILINK.sub(repl, text)


def read_note(relpath: str) -> dict:
    """Return {path,title,html} for a vault .md file, or raise ValueError/FileNotFoundError."""
    target = _safe_resolve(relpath)
    if target.suffix.lower() != ".md" or not target.is_file():
        raise FileNotFoundError(relpath)
    raw = target.read_text(encoding="utf-8", errors="replace")
    title = target.stem
    # First H1 wins as the title, if present.
    for line in raw.splitlines():
        if line.startswith("# "):
            title = line[2:].strip()
            break
    try:
        import markdown  # optional dep; graceful fallback if absent
        html = markdown.markdown(
            _prep_wikilinks(raw),
            extensions=["fenced_code", "tables", "toc", "sane_lists"],
        )
    except Exception:
        # Minimal fallback: escape + preserve line breaks so notes still read.
        from html import escape
        html = "<pre class='md-fallback'>" + escape(raw) + "</pre>"
    return {"path": relpath, "title": title, "html": html}
