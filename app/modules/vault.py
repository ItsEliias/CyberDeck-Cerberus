"""
Vault data layer — the markdown vault on disk is the source of truth (CyberDeck hard rule).

Enforces the containment rule: every path is resolved and checked to live *inside* the
vault root before it is ever read. Nothing outside the root is reachable through the API.
"""
from __future__ import annotations

import os
import posixpath
import re
import urllib.parse
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


# Obsidian image embed ![[pic.png]] → standard markdown image (resolved to the asset API).
_EMBED_IMG = re.compile(r'!\[\[([^\]|]+\.(?:png|jpe?g|gif|svg|webp))\s*(?:\|[^\]]*)?\]\]', re.I)
# Obsidian callout header: > [!type] optional title
_CALLOUT = re.compile(r"^\s*>\s*\[!(\w+)\][+-]?\s*(.*)$")


def _callouts(text: str) -> str:
    """Convert Obsidian callouts (> [!note] ...) to markdown admonitions (!!! note)."""
    lines, out, i = text.split("\n"), [], 0
    while i < len(lines):
        m = _CALLOUT.match(lines[i])
        if m:
            ctype, title = m.group(1).lower(), m.group(2).strip()
            out.append("!!! " + ctype + (f' "{title}"' if title else ""))
            i += 1
            while i < len(lines) and lines[i].lstrip().startswith(">"):
                out.append("    " + re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            out.append("")
        else:
            out.append(lines[i]); i += 1
    return "\n".join(out)


def _prep_note(text: str) -> str:
    text = _EMBED_IMG.sub(lambda m: "![](" + m.group(1).strip() + ")", text)
    text = _callouts(text)
    return _prep_wikilinks(text)


_IMG_SRC = re.compile(r'(<img\b[^>]*?\bsrc=")([^"]+)(")', re.I)


def _rewrite_assets(html: str, relpath: str) -> str:
    """Point note-relative image src at the vault asset endpoint."""
    note_dir = posixpath.dirname(relpath)

    def repl(m):
        src = m.group(2)
        if re.match(r"^(https?:|data:|/)", src, re.I):
            return m.group(0)
        rel = posixpath.normpath(posixpath.join(note_dir, urllib.parse.unquote(src)))
        return m.group(1) + "/api/knowledge/asset?path=" + urllib.parse.quote(rel) + m.group(3)

    return _IMG_SRC.sub(repl, html)


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
            _prep_note(raw),
            extensions=[
                "tables", "sane_lists", "toc", "attr_list", "admonition",
                "pymdownx.tasklist", "pymdownx.superfences", "pymdownx.highlight",
                "pymdownx.betterem", "pymdownx.tilde",
            ],
            extension_configs={
                "pymdownx.tasklist": {"custom_checkbox": True},
                "pymdownx.highlight": {"use_pygments": True, "guess_lang": False, "css_class": "codehl"},
            },
        )
        html = _rewrite_assets(html, relpath)
    except Exception:
        # Minimal fallback: escape + preserve line breaks so notes still read.
        from html import escape
        html = "<pre class='md-fallback'>" + escape(raw) + "</pre>"
    return {"path": relpath, "title": title, "html": html, "raw": raw}


def write_note(relpath: str, content: str) -> dict:
    """Create/overwrite a vault .md file (containment-checked)."""
    target = _safe_resolve(relpath)
    if target.suffix.lower() != ".md":
        raise ValueError("notes must be .md")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return {"path": relpath}


def _note_index() -> dict:
    """stem(lowercased) → first matching relpath, for wikilink resolution."""
    root = vault_root()
    idx = {}
    for r, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in _HIDE]
        for n in files:
            if n.lower().endswith(".md"):
                p = Path(r) / n
                idx.setdefault(p.stem.lower(), str(p.relative_to(root)))
    return idx


def resolve_wikilink(target: str):
    return _note_index().get((target or "").strip().lower())


def backlinks(relpath: str) -> list:
    """Notes that reference this note by [[wikilink]] to its filename."""
    target = _safe_resolve(relpath)
    stem = target.stem.lower()
    root = vault_root()
    out = []
    for r, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in _HIDE]
        for n in files:
            if not n.lower().endswith(".md"):
                continue
            p = Path(r) / n
            if p == target:
                continue
            try:
                text = p.read_text("utf-8", errors="ignore")
            except OSError:
                continue
            for m in _WIKILINK.finditer(text):
                if m.group(1).strip().lower() == stem:
                    out.append({"path": str(p.relative_to(root)), "title": p.stem})
                    break
    return out
