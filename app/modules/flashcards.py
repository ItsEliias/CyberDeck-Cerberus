"""
Flashcards module — spaced-repetition review (SM-2) + auto-generation from notes.

Cards persist to JSON with SM-2 scheduling (ease/interval/due). The generator turns a
vault note into proposed Q&A / cloze cards using offline heuristics (definition lines,
headings, bold terms) — no AI required.
"""
from __future__ import annotations

import json
import os
import re
import secrets
from datetime import datetime, timezone, timedelta
from pathlib import Path

from flask import Blueprint, jsonify, request

from . import vault

bp = Blueprint("flashcards", __name__, url_prefix="/api/flashcards")

STORE = Path(os.environ.get(
    "CYBERDECK_FLASHCARDS",
    str(Path(__file__).resolve().parents[2] / "data" / "flashcards.json"),
))


def _today():
    return datetime.now(timezone.utc).date()


def _load() -> dict:
    if STORE.exists():
        try:
            return json.loads(STORE.read_text("utf-8"))
        except Exception:
            pass
    return {"cards": []}


def _save(d: dict):
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(d, indent=2), "utf-8")


def _is_due(card) -> bool:
    try:
        return datetime.fromisoformat(card["due"]).date() <= _today()
    except Exception:
        return True


# ── SM-2 ──────────────────────────────────────────────────────────────────────
def _schedule(card, grade: int):
    """grade: 0 again, 1 hard, 2 good, 3 easy."""
    ease = card.get("ease", 2.5)
    reps = card.get("reps", 0)
    interval = card.get("interval", 0)
    if grade == 0:
        reps = 0
        interval = 0
        ease = max(1.3, ease - 0.2)
        card["lapses"] = card.get("lapses", 0) + 1
    else:
        reps += 1
        if reps == 1:
            interval = 1
        elif reps == 2:
            interval = 6
        else:
            interval = max(1, round(interval * ease))
        ease += {1: -0.15, 2: 0.0, 3: 0.15}[grade]
        ease = max(1.3, ease)
    card["ease"] = round(ease, 2)
    card["reps"] = reps
    card["interval"] = interval
    due = _today() + timedelta(days=interval)
    card["due"] = datetime(due.year, due.month, due.day, tzinfo=timezone.utc).isoformat()
    card["reviewed"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return card


@bp.route("/decks")
def decks():
    d = _load()
    agg = {}
    for c in d["cards"]:
        deck = c.get("deck", "General")
        a = agg.setdefault(deck, {"deck": deck, "total": 0, "due": 0, "new": 0})
        a["total"] += 1
        if _is_due(c):
            a["due"] += 1
        if c.get("reps", 0) == 0:
            a["new"] += 1
    return jsonify(decks=sorted(agg.values(), key=lambda x: x["deck"]))


@bp.route("/due")
def due():
    deck = request.args.get("deck")
    d = _load()
    cards = [c for c in d["cards"] if _is_due(c) and (not deck or c.get("deck") == deck)]
    return jsonify(cards=cards, count=len(cards))


@bp.route("/card", methods=["POST"])
def add_card():
    data = request.get_json(silent=True) or {}
    front = (data.get("front") or "").strip()
    back = (data.get("back") or "").strip()
    if not front or not back:
        return jsonify(error="front and back required"), 400
    d = _load()
    card = {"id": secrets.token_hex(6), "front": front, "back": back,
            "deck": (data.get("deck") or "General").strip(),
            "ease": 2.5, "reps": 0, "interval": 0, "lapses": 0,
            "due": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "created": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    d["cards"].append(card)
    _save(d)
    return jsonify(ok=True, id=card["id"])


@bp.route("/review/<cid>", methods=["POST"])
def review(cid):
    grade = int((request.get_json(silent=True) or {}).get("grade", 2))
    d = _load()
    for c in d["cards"]:
        if c["id"] == cid:
            _schedule(c, grade)
            _save(d)
            return jsonify(ok=True, due=c["due"], interval=c["interval"])
    return jsonify(error="not found"), 404


@bp.route("/<cid>", methods=["DELETE"])
def delete(cid):
    d = _load()
    d["cards"] = [c for c in d["cards"] if c["id"] != cid]
    _save(d)
    return jsonify(ok=True)


@bp.route("/stats")
def stats():
    d = _load()
    return jsonify(total=len(d["cards"]), due=sum(1 for c in d["cards"] if _is_due(c)))


# ── Generator (#4) ─────────────────────────────────────────────────────────────
_DEF = re.compile(r"^\s*[-*]?\s*\*\*(.+?)\*\*\s*[—:\-]\s*(.+?)\s*$")
_DEF2 = re.compile(r"^\s*[-*]\s+([A-Z][\w /()+-]{2,40}?):\s+(.+?)\s*$")
_HEAD = re.compile(r"^(#{2,4})\s+(.+?)\s*$")
_BOLD = re.compile(r"\*\*(.+?)\*\*")


@bp.route("/generate", methods=["POST"])
def generate():
    """Propose cards from a vault note (offline heuristics). Does not save; UI confirms."""
    path = (request.get_json(silent=True) or {}).get("path", "")
    try:
        target = vault._safe_resolve(path)
        text = target.read_text("utf-8", errors="replace")
    except Exception:
        return jsonify(error="note not found"), 404

    proposed, seen = [], set()

    def add(front, back):
        key = front.strip().lower()
        if front and back and key not in seen and len(back) < 400:
            seen.add(key)
            proposed.append({"front": front.strip(), "back": back.strip()})

    lines = text.splitlines()
    pending_head = None
    for i, line in enumerate(lines):
        md = _DEF.match(line) or _DEF2.match(line)
        if md:
            add(md.group(1), md.group(2))
            continue
        mh = _HEAD.match(line)
        if mh:
            pending_head = mh.group(2)
            # find next non-empty paragraph line as the answer
            for nxt in lines[i + 1:i + 6]:
                s = nxt.strip()
                if s and not s.startswith("#") and not s.startswith("|"):
                    add(f"What is {pending_head}?", re.sub(r"[*_`]", "", s))
                    break
            continue
        # cloze from a bolded term in a sentence
        mb = _BOLD.search(line)
        if mb and len(line.strip()) > 30 and not line.strip().startswith("#"):
            term = mb.group(1)
            sentence = re.sub(r"[*_`]", "", line).strip()
            cloze = sentence.replace(term, "[ … ]", 1)
            if "[ … ]" in cloze:
                add(cloze, term)

    return jsonify(deck=Path(path).stem, proposed=proposed[:30], count=len(proposed))
