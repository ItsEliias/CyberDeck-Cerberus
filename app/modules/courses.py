"""
Courses module — a platform-agnostic importer.

Point it at any folder of course material you already have on disk (official app
downloads, resource packs, your own notes). It scans + classifies the files, you pick
which categories to import, and it indexes them **in place** — media is never copied
(CyberDeck media rule). Course records are tiny JSON manifests referencing the source.

Deliberately does no scraping/DRM work: it only reads files that already exist locally.
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from flask import Blueprint, jsonify, request, send_file, abort

bp = Blueprint("courses", __name__, url_prefix="/api/courses")

COURSES_DIR = Path(os.environ.get(
    "CYBERDECK_COURSES",
    str(Path(__file__).resolve().parents[2] / "data" / "courses"),
))

# Extension → category. UI selects at category level.
CATEGORIES = {
    "docs": {".pdf", ".ppt", ".pptx", ".doc", ".docx", ".txt", ".rtf", ".odt",
             ".csv", ".xlsx", ".epub", ".srt", ".vtt"},
    "notes": {".md", ".markdown"},
    "video": {".mp4", ".mkv", ".mov", ".webm", ".avi", ".m4v"},
    "audio": {".mp3", ".m4a", ".wav", ".ogg", ".flac"},
    "code": {".py", ".js", ".ts", ".sh", ".c", ".cpp", ".h", ".java", ".rb", ".go",
             ".rs", ".html", ".css", ".json", ".yaml", ".yml", ".sql", ".php"},
    "images": {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"},
}
_EXT2CAT = {ext: cat for cat, exts in CATEGORIES.items() for ext in exts}
_HIDE = {".git", ".DS_Store", "__MACOSX", "node_modules"}


def _cat_of(p: Path) -> str:
    return _EXT2CAT.get(p.suffix.lower(), "other")


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "course"


def _records():
    COURSES_DIR.mkdir(parents=True, exist_ok=True)
    out = []
    for f in sorted(COURSES_DIR.glob("*.json")):
        try:
            out.append(json.loads(f.read_text("utf-8")))
        except Exception:
            continue
    return out


def _record(cid: str):
    f = COURSES_DIR / f"{cid}.json"
    if not f.exists():
        return None
    try:
        return json.loads(f.read_text("utf-8"))
    except Exception:
        return None


def scan_folder(source: Path, selected: set | None = None) -> dict:
    """Walk `source`, classify files by category. If `selected` given, keep only those."""
    cats: dict[str, dict] = {}
    total = 0
    if source.exists() and source.is_dir():
        for root, dirs, files in os.walk(source):
            dirs[:] = [d for d in dirs if d not in _HIDE and not d.startswith(".")]
            for name in files:
                if name.startswith(".") or name in _HIDE:
                    continue
                p = Path(root) / name
                cat = _cat_of(p)
                if selected is not None and cat not in selected:
                    continue
                try:
                    size = p.stat().st_size
                except OSError:
                    size = 0
                rel = str(p.relative_to(source))
                b = cats.setdefault(cat, {"count": 0, "bytes": 0, "items": []})
                b["count"] += 1
                b["bytes"] += size
                b["items"].append({"path": rel, "name": name, "size": size})
                total += 1
    return {"categories": cats, "total": total}


@bp.route("/list")
def list_courses():
    return jsonify(courses=_records())


@bp.route("/scan")
def scan():
    """Preview a source folder's contents grouped by category (for the import picker)."""
    source = Path(request.args.get("path", "")).expanduser()
    if not str(source):
        return jsonify(error="no path"), 400
    result = scan_folder(source)
    # Trim item lists in the preview to keep the payload light; counts stay exact.
    for cat, b in result["categories"].items():
        b["sample"] = [it["name"] for it in b["items"][:5]]
        del b["items"]
    return jsonify(source=str(source), exists=source.exists() and source.is_dir(), **result)


@bp.route("/import", methods=["POST"])
def import_course():
    data = request.get_json(silent=True) or {}
    source = Path(str(data.get("source", ""))).expanduser()
    title = (data.get("title") or source.name or "Course").strip()
    selected = [c for c in (data.get("categories") or []) if c in CATEGORIES or c == "other"]
    if not source.exists() or not source.is_dir():
        return jsonify(error="source folder not found"), 400
    if not selected:
        return jsonify(error="pick at least one category"), 400

    COURSES_DIR.mkdir(parents=True, exist_ok=True)
    cid = _slug(title)
    base, i = cid, 2
    while (COURSES_DIR / f"{cid}.json").exists():
        cid = f"{base}-{i}"; i += 1

    counts = scan_folder(source, set(selected))
    rec = {
        "id": cid, "title": title, "source": str(source.resolve()),
        "categories": selected, "total": counts["total"],
        "counts": {c: b["count"] for c, b in counts["categories"].items()},
        "imported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (COURSES_DIR / f"{cid}.json").write_text(json.dumps(rec, indent=2), "utf-8")
    return jsonify(course=rec)


@bp.route("/<cid>")
def detail(cid):
    rec = _record(cid)
    if not rec:
        return jsonify(error="not found"), 404
    # Re-scan source live so the listing is always current (index-in-place).
    result = scan_folder(Path(rec["source"]), set(rec["categories"]))
    return jsonify(course=rec, categories=result["categories"], total=result["total"])


@bp.route("/<cid>", methods=["DELETE"])
def remove(cid):
    f = COURSES_DIR / f"{cid}.json"
    if f.exists():
        f.unlink()
        return jsonify(ok=True)
    return jsonify(error="not found"), 404


@bp.route("/file/<cid>")
def serve_file(cid):
    """Serve one file from a course's source folder, with containment to that folder."""
    rec = _record(cid)
    if not rec:
        abort(404)
    root = Path(rec["source"]).resolve()
    rel = (request.args.get("path") or "").lstrip("/\\")
    target = (root / rel).resolve()
    if target != root and root not in target.parents:
        abort(403)
    if not target.is_file():
        abort(404)
    return send_file(str(target))
