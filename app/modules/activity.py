"""Activity module — logs study activity per day; computes streaks + a heatmap."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone, timedelta, date
from pathlib import Path

from flask import Blueprint, jsonify, request

bp = Blueprint("activity", __name__, url_prefix="/api/activity")

STORE = Path(os.environ.get(
    "CYBERDECK_ACTIVITY",
    str(Path(__file__).resolve().parents[2] / "data" / "activity.json"),
))


def _load() -> dict:
    if STORE.exists():
        try:
            return json.loads(STORE.read_text("utf-8"))
        except Exception:
            pass
    return {"log": {}}


def _save(d: dict):
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(d, indent=2), "utf-8")


def _today() -> date:
    return datetime.now(timezone.utc).date()


def log_event(kind: str = "study"):
    d = _load()
    key = _today().isoformat()
    day = d["log"].setdefault(key, {})
    day[kind] = day.get(kind, 0) + 1
    _save(d)


@bp.route("/log", methods=["POST"])
def log():
    kind = (request.get_json(silent=True) or {}).get("kind", "study")
    log_event(str(kind)[:20])
    return jsonify(ok=True)


def _day_total(day: dict) -> int:
    return sum(day.values()) if isinstance(day, dict) else int(day or 0)


@bp.route("/summary")
def summary():
    d = _load()
    log = d["log"]
    active = {k for k, v in log.items() if _day_total(v) > 0}

    # Current streak: count back from today (or yesterday if nothing yet today).
    today = _today()
    cur = 0
    probe = today if today.isoformat() in active else today - timedelta(days=1)
    while probe.isoformat() in active:
        cur += 1
        probe -= timedelta(days=1)

    # Longest streak across all logged days.
    longest = 0
    for k in active:
        try:
            dt = date.fromisoformat(k)
        except ValueError:
            continue
        if (dt - timedelta(days=1)).isoformat() not in active:  # a run start
            run, p = 0, dt
            while p.isoformat() in active:
                run += 1
                p += timedelta(days=1)
            longest = max(longest, run)

    # Heatmap: last 140 days.
    heat = []
    for i in range(139, -1, -1):
        dt = today - timedelta(days=i)
        heat.append({"date": dt.isoformat(), "count": _day_total(log.get(dt.isoformat(), {}))})

    totals = {}
    for v in log.values():
        if isinstance(v, dict):
            for kind, n in v.items():
                totals[kind] = totals.get(kind, 0) + n
    grand = sum(totals.values())
    week = sum(h["count"] for h in heat[-7:])

    return jsonify(streak=cur, longest=longest, today=_day_total(log.get(today.isoformat(), {})),
                   week=week, total=grand, by_kind=totals, heatmap=heat)
