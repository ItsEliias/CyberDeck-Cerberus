"""Learning Paths — curated study roadmaps that thread the app's own modules
(courses, playbooks, flashcards, quiz, toolkit). Steps are checkable and completion
persists; the paths themselves are seeded here.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from flask import Blueprint, jsonify, request

bp = Blueprint("paths", __name__, url_prefix="/api/paths")

STORE = Path(os.environ.get(
    "CYBERDECK_PATHS",
    str(Path(__file__).resolve().parents[2] / "data" / "paths.json"),
))


def _load_bundled(rel: str) -> dict:
    """Read a JSON asset bundled under app/static (works frozen + in dev)."""
    candidates = [Path(__file__).resolve().parents[1] / "static" / rel]
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(Path(meipass) / "static" / rel)
    for c in candidates:
        try:
            if c.exists():
                return json.loads(c.read_text("utf-8"))
        except Exception:
            break
    return {}


# Extra paths imported from the TryHackMe roadmap (CC0, Hunterdii/TryHackMe-Roadmap).
_THM = _load_bundled("roadmaps/thm-roadmap.json")
THM_PATHS = _THM.get("paths", [])
THM_SOURCE = _THM.get("source", "")

PATHS = [
    {"id": "web-pentest", "title": "Web App Pentester",
     "blurb": "From OWASP basics to testing a live app.",
     "steps": [
         {"text": "Skim the OWASP Top 10 (bookmarked in Resources)", "nav": "resources"},
         {"text": "Import & read the SQLi + XSS prevention cheat sheets", "nav": "courses"},
         {"text": "Drill the Web Vulns flashcard deck", "nav": "flashcards"},
         {"text": "Work through the OWASP Top 10 Web Testing playbook", "nav": "playbooks"},
         {"text": "Quiz yourself on Web Vulns", "nav": "quiz"},
     ]},
    {"id": "blue-team", "title": "Blue Team / SOC Analyst",
     "blurb": "Detection, incident response, and the ATT&CK mindset.",
     "steps": [
         {"text": "Explore MITRE ATT&CK (bookmarked in Resources)", "nav": "resources"},
         {"text": "Drill the Blue Team / IR flashcard deck", "nav": "flashcards"},
         {"text": "Walk the Incident Response playbook (SANS PICERL)", "nav": "playbooks"},
         {"text": "Quiz yourself on Blue Team / IR", "nav": "quiz"},
     ]},
    {"id": "foundations", "title": "Foundations → Security+",
     "blurb": "Networking, ports, and the core security concepts.",
     "steps": [
         {"text": "Review common ports + the OSI model (Toolkit → Reference)", "nav": "toolkit"},
         {"text": "Drill the Security+ Core and Common Ports decks", "nav": "flashcards"},
         {"text": "Follow the Cybersecurity Learning Roadmap playbook", "nav": "playbooks"},
         {"text": "Quiz yourself on Security+ Core", "nav": "quiz"},
     ]},
]

# Curated paths first, then the TryHackMe roadmap topics.
PATHS = PATHS + THM_PATHS


def _runs() -> dict:
    if STORE.exists():
        try:
            return json.loads(STORE.read_text("utf-8"))
        except Exception:
            pass
    return {}


def _save(d: dict):
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(d, indent=2), "utf-8")


@bp.route("/list")
def list_paths():
    runs = _runs()
    out = []
    for p in PATHS:
        st = runs.get(p["id"], {})
        done = sum(1 for i in range(len(p["steps"])) if st.get(str(i)))
        out.append({"id": p["id"], "title": p["title"], "blurb": p["blurb"],
                    "total": len(p["steps"]), "done": done, "source": p.get("source", "core")})
    return jsonify(paths=out, thm_source=THM_SOURCE)


@bp.route("/thm-rooms")
def thm_rooms():
    """Every TryHackMe room across the 28 topics, flat, with per-room done state.
    Powers the 'all rooms' browse/search/tag-filter view."""
    runs = _runs()
    rooms, topics = [], []
    for p in PATHS:
        if p.get("source") != "thm":
            continue
        st = runs.get(p["id"], {})
        done = sum(1 for i in range(len(p["steps"])) if st.get(str(i)))
        topics.append({"id": p["id"], "title": p["title"], "total": len(p["steps"]), "done": done})
        for i, s in enumerate(p["steps"]):
            rooms.append({"pid": p["id"], "topic": p["title"], "i": i,
                          "text": s["text"], "url": s.get("url"), "done": bool(st.get(str(i)))})
    return jsonify(rooms=rooms, topics=topics, total=len(rooms),
                   done=sum(1 for r in rooms if r["done"]), source=THM_SOURCE)


@bp.route("/<pid>")
def detail(pid):
    p = next((x for x in PATHS if x["id"] == pid), None)
    if not p:
        return jsonify(error="not found"), 404
    st = _runs().get(pid, {})
    steps = [{"i": i, "text": s["text"], "nav": s.get("nav"), "url": s.get("url"),
              "done": bool(st.get(str(i)))}
             for i, s in enumerate(p["steps"])]
    return jsonify(id=pid, title=p["title"], blurb=p["blurb"], steps=steps,
                   source=p.get("source", "core"),
                   total=len(steps), done=sum(1 for s in steps if s["done"]))


@bp.route("/<pid>/toggle", methods=["POST"])
def toggle(pid):
    d = request.get_json(silent=True) or {}
    runs = _runs()
    runs.setdefault(pid, {})[str(d.get("step"))] = bool(d.get("done"))
    _save(runs)
    return jsonify(ok=True)
