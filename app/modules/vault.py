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

# Vault root resolution (portable across macOS / Windows / Linux):
#   1. CYBERDECK_VAULT env var wins (point it at your own Obsidian vault).
#   2. else the CyberBase dev vault, if it happens to exist on this machine.
#   3. else a per-user vault under ~/Documents/CyberDeck/Vault, created on demand
#      so a fresh install (e.g. a Windows laptop) has a working Knowledge base.
_CYBERBASE = "/Users/codyliddell/Documents/Claude/Projects/Cyberdeck/.reference/CyberBase"
_USER_VAULT = Path.home() / "Documents" / "CyberDeck" / "Vault"


def _resolve_vault_root() -> Path:
    env = os.environ.get("CYBERDECK_VAULT")
    if env:
        return Path(env).expanduser()
    if Path(_CYBERBASE).exists():
        return Path(_CYBERBASE)
    try:
        _USER_VAULT.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    return _USER_VAULT


VAULT_ROOT = _resolve_vault_root()

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


# Obsidian inline #tag: starts with a letter/underscore, allows nested tags via "/".
# Lookbehind skips headings (## …), URL/anchor fragments — foo#bar, [x](#anchor),
# (#anchor) TOC links — and HTML entities (&#…).
_TAG = re.compile(r"(?<![\w#/&(])#([A-Za-z_][\w/-]*)")
# Regions we must NOT scan for tags: fenced blocks and inline code.
_CODE_SPAN = re.compile(r"```.*?```|~~~.*?~~~|`[^`\n]+`", re.S)


def _tag_repl(m) -> str:
    tag = m.group(1)
    return f'<span class="md-tag" data-tag="{tag}">#{tag}</span>'


def _prep_tags(text: str) -> str:
    """Turn #tags into clickable spans, leaving code spans/fences untouched."""
    out, last = [], 0
    for m in _CODE_SPAN.finditer(text):
        out.append(_TAG.sub(_tag_repl, text[last:m.start()]))
        out.append(m.group(0))
        last = m.end()
    out.append(_TAG.sub(_tag_repl, text[last:]))
    return "".join(out)


def extract_tags(text: str) -> list:
    """Ordered, de-duplicated list of #tags in a note (code excluded)."""
    tags, seen, last = [], set(), 0

    def scan(seg: str):
        for m in _TAG.finditer(seg):
            t = m.group(1)
            if t.lower() not in seen:
                seen.add(t.lower())
                tags.append(t)

    for m in _CODE_SPAN.finditer(text):
        scan(text[last:m.start()])
        last = m.end()
    scan(text[last:])
    return tags


# Obsidian image embed ![[pic.png]] → standard markdown image (resolved to the asset API).
_EMBED_IMG = re.compile(r'!\[\[([^\]|]+\.(?:png|jpe?g|gif|svg|webp))\s*(?:\|[^\]]*)?\]\]', re.I)
# Obsidian note embed ![[Other Note]] (no image extension) → inline the other note.
_EMBED_NOTE = re.compile(r'!\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]')
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


def _prep_note(text: str, embeds: list | None = None, depth: int = 0) -> str:
    text = _EMBED_IMG.sub(lambda m: "![](" + m.group(1).strip() + ")", text)
    if embeds is not None and depth < 1:
        def erepl(m):
            i = len(embeds)
            embeds.append(m.group(1).strip())
            return f"\n\nZZEMBED{i}ZZ\n\n"
        text = _EMBED_NOTE.sub(erepl, text)
    else:
        # too deep to embed further: drop the marker so we never recurse forever.
        text = _EMBED_NOTE.sub(lambda m: "", text)
    text = _callouts(text)
    text = _prep_tags(text)
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


def _expand_embeds(html: str, embeds: list, depth: int) -> str:
    """Replace ZZEMBEDnZZ placeholders with the rendered HTML of each embedded note."""
    from html import escape
    idx = _note_index()
    for i, name in enumerate(embeds):
        token = f"ZZEMBED{i}ZZ"
        rel = idx.get(name.lower())
        block = None
        if rel:
            try:
                child = _safe_resolve(rel)
                craw = child.read_text(encoding="utf-8", errors="replace")
                chtml = _to_html(craw, rel, depth + 1)
                block = (
                    '<div class="md-embed">'
                    '<a class="md-embed-h md-wikilink" data-target="' + escape(name) + '">'
                    '<span class="md-embed-i">⧉</span>' + escape(child.stem) + '</a>'
                    '<div class="md-embed-body">' + chtml + '</div></div>'
                )
            except Exception:
                block = None
        if block is None:
            block = '<div class="md-embed md-embed-missing">Unresolved embed: ' + escape(name) + '</div>'
        html = html.replace("<p>" + token + "</p>", block).replace(token, block)
    return html


def _to_html(raw: str, relpath: str, depth: int = 0) -> str:
    """Render a note body to HTML (embeds expanded up to one level deep)."""
    embeds: list = []
    prepped = _prep_note(raw, embeds, depth)
    try:
        import markdown  # optional dep; graceful fallback if absent
        html = markdown.markdown(
            prepped,
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
        return "<pre class='md-fallback'>" + escape(raw) + "</pre>"
    if embeds:
        html = _expand_embeds(html, embeds, depth)
    return html


def read_note(relpath: str) -> dict:
    """Return {path,title,html,raw,tags} for a vault .md file, or raise ValueError/FileNotFoundError."""
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
    return {"path": relpath, "title": title, "html": _to_html(raw, relpath, 0), "raw": raw, "tags": extract_tags(raw)}


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


def note_list() -> list:
    """Every note as {path,title}, title-sorted — feeds the [[ ]] autocomplete."""
    root = vault_root()
    out = []
    for r, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in _HIDE]
        for n in files:
            if n.lower().endswith(".md") and not n.startswith("."):
                p = Path(r) / n
                out.append({"path": str(p.relative_to(root)), "title": p.stem})
    out.sort(key=lambda x: x["title"].lower())
    return out


def all_tags() -> list:
    """Every #tag across the vault → [{tag,count,notes:[{path,title}]}], most-used first."""
    root = vault_root()
    tags: dict = {}
    for r, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in _HIDE]
        for n in files:
            if not n.lower().endswith(".md") or n.startswith("."):
                continue
            p = Path(r) / n
            try:
                text = p.read_text("utf-8", errors="ignore")
            except OSError:
                continue
            for t in extract_tags(text):
                e = tags.setdefault(t.lower(), {"tag": t, "count": 0, "notes": []})
                e["count"] += 1
                e["notes"].append({"path": str(p.relative_to(root)), "title": p.stem})
    return sorted(tags.values(), key=lambda x: (-x["count"], x["tag"].lower()))


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
