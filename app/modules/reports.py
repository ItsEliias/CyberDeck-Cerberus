"""Reports module — markdown report drafts + rendered HTML export (print-to-PDF)."""
from __future__ import annotations

import os
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path

from flask import Blueprint, jsonify, request, Response

bp = Blueprint("reports", __name__, url_prefix="/api/reports")

REPORTS_DIR = Path(os.environ.get(
    "CYBERDECK_REPORTS",
    str(Path(__file__).resolve().parents[2] / "data" / "reports"),
))

_TEMPLATE = """# {title}

## Executive summary

_Brief, non-technical overview of the engagement and its risk._

## Scope

- Target:
- Dates:
- Rules of engagement:

## Findings

### 1. Finding title — Severity

**Description.**

**Impact.**

**Evidence.**

**Remediation.**

## Conclusion
"""


def _path(rid: str) -> Path:
    return REPORTS_DIR / f"{rid}.md"


def _title_of(text: str, fallback: str) -> str:
    for line in text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return fallback


@bp.route("/list")
def list_reports():
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    out = []
    for f in sorted(REPORTS_DIR.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True):
        text = f.read_text("utf-8", errors="replace")
        out.append({
            "id": f.stem, "title": _title_of(text, f.stem),
            "updated": datetime.fromtimestamp(f.stat().st_mtime, timezone.utc).isoformat(timespec="seconds"),
            "words": len(text.split()),
        })
    return jsonify(reports=out)


@bp.route("/create", methods=["POST"])
def create():
    title = ((request.get_json(silent=True) or {}).get("title") or "Untitled report").strip()
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    rid = secrets.token_hex(6)
    _path(rid).write_text(_TEMPLATE.format(title=title), "utf-8")
    return jsonify(ok=True, id=rid)


@bp.route("/<rid>")
def get(rid):
    f = _path(rid)
    if not f.exists():
        return jsonify(error="not found"), 404
    text = f.read_text("utf-8", errors="replace")
    return jsonify(id=rid, title=_title_of(text, rid), content=text)


@bp.route("/<rid>", methods=["POST"])
def save(rid):
    f = _path(rid)
    if not f.exists():
        return jsonify(error="not found"), 404
    content = (request.get_json(silent=True) or {}).get("content", "")
    f.write_text(content, "utf-8")
    return jsonify(ok=True, title=_title_of(content, rid))


@bp.route("/<rid>", methods=["DELETE"])
def delete(rid):
    f = _path(rid)
    if not f.exists():
        return jsonify(error="not found"), 404
    f.unlink()
    return jsonify(ok=True)


@bp.route("/<rid>/export")
def export(rid):
    """Standalone HTML render — open in a tab and print → PDF."""
    f = _path(rid)
    if not f.exists():
        return jsonify(error="not found"), 404
    text = f.read_text("utf-8", errors="replace")
    title = _title_of(text, rid)
    try:
        import markdown
        body = markdown.markdown(text, extensions=["fenced_code", "tables", "toc", "sane_lists"])
    except Exception:
        from html import escape
        body = "<pre>" + escape(text) + "</pre>"
    safe_title = re.sub(r"[<>&]", "", title)
    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>{safe_title}</title>
<style>
  body {{ font-family: Georgia, 'Times New Roman', serif; max-width: 820px; margin: 40px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.6; }}
  h1 {{ border-bottom: 3px solid #c0392b; padding-bottom: 8px; }}
  h2 {{ border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 1.6em; }}
  h3 {{ color: #c0392b; }}
  code {{ background: #f4f4f4; padding: 2px 5px; border-radius: 3px; font-family: 'Courier New', monospace; }}
  pre {{ background: #f4f4f4; padding: 12px; border-radius: 6px; overflow-x: auto; }}
  table {{ border-collapse: collapse; width: 100%; }} th, td {{ border: 1px solid #ccc; padding: 6px 10px; }}
  @media print {{ body {{ margin: 0; }} }}
</style></head><body>{body}</body></html>"""
    return Response(html, mimetype="text/html")
