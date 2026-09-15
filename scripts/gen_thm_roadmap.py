#!/usr/bin/env python3
"""Generate app/static/data/thm-roadmap.json from Hunterdii/TryHackMe-Roadmap's README.

The roadmap is 500+ free TryHackMe rooms grouped by topic (CC0-1.0, public domain).
We turn each topic heading into a CyberDeck Learning Path and each room into a
checkable step that links out to tryhackme.com. The maintainer's own [x] ticks are
ignored — every room starts unchecked so it tracks *your* progress.

Usage:
    curl -sL https://raw.githubusercontent.com/Hunterdii/TryHackMe-Roadmap/main/README.md -o /tmp/thm_roadmap.md
    python3 scripts/gen_thm_roadmap.py /tmp/thm_roadmap.md
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SOURCE = "https://github.com/Hunterdii/TryHackMe-Roadmap"

# A room line: - [ ] or [x], then [label](url) where the url is a THM room.
_ROOM = re.compile(r"^\s*-\s*\[[ xX]\]\s*\[([^\]]+)\]\((https?://[^)]+)\)")
_H2 = re.compile(r"^##\s+(.*\S)\s*$")


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "topic"


def _clean_title(text: str) -> str:
    """'🕵️ TryHackMe | Intro to Logs' -> 'Intro to Logs'."""
    if "|" in text:
        text = text.split("|")[-1]
    # strip leading emoji / symbols / whitespace
    return re.sub(r"^[^\w(]+", "", text).strip()


def _clean_heading(h: str) -> str:
    return re.sub(r"^[^\w]+", "", h).strip()


def parse(md: str) -> list:
    paths, cur = [], None
    for line in md.splitlines():
        h = _H2.match(line)
        if h:
            title = _clean_heading(h.group(1))
            cur = {"id": "thm-" + _slug(title), "title": title,
                   "source": "thm", "steps": []}
            paths.append(cur)
            continue
        m = _ROOM.match(line)
        if m and cur is not None and "tryhackme.com" in m.group(2):
            cur["steps"].append({"text": _clean_title(m.group(1)), "url": m.group(2).strip()})
    # keep only sections that actually hold rooms (drops ToC / meta headings)
    paths = [p for p in paths if p["steps"]]
    for p in paths:
        n = len(p["steps"])
        p["blurb"] = f"{n} free TryHackMe room{'' if n == 1 else 's'} · {p['title']}"
    return paths


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/thm_roadmap.md")
    md = src.read_text("utf-8", errors="replace")
    paths = parse(md)
    out = {
        "source": SOURCE,
        "license": "CC0-1.0",
        "note": "Curated by Hunterdii; imported into CyberDeck as Learning Paths.",
        "paths": paths,
    }
    dest = Path(__file__).resolve().parents[1] / "app" / "static" / "roadmaps" / "thm-roadmap.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=2, ensure_ascii=False), "utf-8")
    total = sum(len(p["steps"]) for p in paths)
    print(f"wrote {dest}")
    print(f"topics: {len(paths)} | rooms: {total}")
    for p in paths[:6]:
        print(f"  - {p['title']}: {len(p['steps'])}")


if __name__ == "__main__":
    main()
