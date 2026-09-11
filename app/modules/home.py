"""Home module — a dashboard aggregating the other modules' state."""
from __future__ import annotations

import os
from pathlib import Path

from flask import Blueprint, jsonify

from . import vault, courses, targets, credentials

bp = Blueprint("home", __name__, url_prefix="/api/home")


def _recent_notes(limit=6):
    root = vault.vault_root()
    if not root.exists():
        return []
    files = []
    for r, dirs, names in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in vault._HIDE]
        for n in names:
            if n.lower().endswith(".md") and not n.startswith("."):
                p = Path(r) / n
                try:
                    files.append((p.stat().st_mtime, str(p.relative_to(root)), p.stem))
                except OSError:
                    pass
    files.sort(reverse=True)
    return [{"path": p, "title": t} for _, p, t in files[:limit]]


@bp.route("/summary")
def summary():
    # Notes
    try:
        note_count = vault.build_tree().get("count", 0)
        vault_ok = vault.vault_root().exists()
    except Exception:
        note_count, vault_ok = 0, False

    # Courses
    try:
        course_recs = courses._records()
        course_items = sum(c.get("total", 0) for c in course_recs)
    except Exception:
        course_recs, course_items = [], 0

    # Targets + findings
    try:
        tdata = targets._load()["targets"]
        findings = sum(len(t.get("findings", [])) for t in tdata)
        high = sum(1 for t in tdata for f in t.get("findings", []) if f.get("severity") in ("high", "critical"))
    except Exception:
        tdata, findings, high = [], 0, 0

    # Credentials
    cred_file = credentials._load_file()

    return jsonify(
        vault={"ok": vault_ok, "notes": note_count, "root": str(vault.vault_root())},
        courses={"count": len(course_recs), "items": course_items},
        targets={"count": len(tdata), "findings": findings, "high": high},
        credentials={"configured": cred_file is not None, "locked": credentials._state["key"] is None},
        recent_notes=_recent_notes(),
    )
