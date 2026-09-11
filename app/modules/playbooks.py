"""
Playbooks module — repeatable procedures as markdown checklists with saved run state.

Each playbook is a .md file (headings = sections, `- [ ]` lines = steps). Ticking a
step persists to a runs file, so progress survives reloads. Editing the markdown is the
source of truth; run state is keyed by step index.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

from flask import Blueprint, jsonify, request

bp = Blueprint("playbooks", __name__, url_prefix="/api/playbooks")

PB_DIR = Path(os.environ.get(
    "CYBERDECK_PLAYBOOKS",
    str(Path(__file__).resolve().parents[2] / "data" / "playbooks"),
))
RUNS_FILE = PB_DIR / "_runs.json"

_STEP = re.compile(r"^\s*[-*]\s*\[([ xX])\]\s*(.+?)\s*$")
_HEAD = re.compile(r"^(#{1,3})\s+(.+?)\s*$")

_SEEDS = {
    "web-app-recon.md": """# Web App Recon

## Enumerate
- [ ] Identify the tech stack (Wappalyzer / whatweb)
- [ ] Full port scan, then service scan the open ports
- [ ] Directory & file brute-force (ffuf / gobuster)
- [ ] Enumerate virtual hosts / subdomains

## Inspect
- [ ] Review page source, JS files, and comments for secrets
- [ ] Check robots.txt, sitemap.xml, and .git/ exposure
- [ ] Map every input (params, headers, cookies, forms)

## Test
- [ ] Auth: default creds, weak lockout, session handling
- [ ] Injection: SQLi, command injection, SSTI, XSS
- [ ] Access control: IDOR, forced browsing, privilege boundaries
""",
    "linux-privesc.md": """# Linux Privilege Escalation

## Situational awareness
- [ ] `id`, `sudo -l`, current user + groups
- [ ] Kernel + distro version vs known exploits
- [ ] Running processes and listening services

## Hunt
- [ ] SUID/SGID binaries (`find / -perm -4000 2>/dev/null`)
- [ ] World-writable files, cron jobs, and PATH abuse
- [ ] Readable config / history / backup files with secrets
- [ ] Capabilities (`getcap -r / 2>/dev/null`)

## Escalate
- [ ] Exploit the strongest finding
- [ ] Establish a stable root shell
- [ ] Note the exact steps for the report
""",
}


def _seed():
    PB_DIR.mkdir(parents=True, exist_ok=True)
    if not any(PB_DIR.glob("*.md")):
        for name, body in _SEEDS.items():
            (PB_DIR / name).write_text(body, "utf-8")


def _runs() -> dict:
    if RUNS_FILE.exists():
        try:
            return json.loads(RUNS_FILE.read_text("utf-8"))
        except Exception:
            pass
    return {}


def _save_runs(d: dict):
    PB_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_FILE.write_text(json.dumps(d, indent=2), "utf-8")


def _parse(path: Path):
    title = path.stem
    items, step_idx, total, done_default = [], 0, 0, 0
    for line in path.read_text("utf-8", errors="replace").splitlines():
        mh = _HEAD.match(line)
        ms = _STEP.match(line)
        if mh:
            if mh.group(1) == "#" and title == path.stem:
                title = mh.group(2)
            items.append({"type": "section", "text": mh.group(2), "level": len(mh.group(1))})
        elif ms:
            checked = ms.group(1).lower() == "x"
            items.append({"type": "step", "id": step_idx, "text": ms.group(2), "checked": checked})
            step_idx += 1
            total += 1
    return title, items, total


@bp.route("/list")
def list_playbooks():
    _seed()
    runs = _runs()
    out = []
    for f in sorted(PB_DIR.glob("*.md")):
        title, items, total = _parse(f)
        state = runs.get(f.stem, {})
        done = sum(1 for it in items if it["type"] == "step" and (state.get(str(it["id"]), it["checked"])))
        out.append({"id": f.stem, "title": title, "total": total, "done": done})
    return jsonify(playbooks=out)


@bp.route("/<pid>")
def detail(pid):
    f = PB_DIR / f"{pid}.md"
    if not f.exists():
        return jsonify(error="not found"), 404
    title, items, total = _parse(f)
    state = _runs().get(pid, {})
    for it in items:
        if it["type"] == "step":
            it["checked"] = bool(state.get(str(it["id"]), it["checked"]))
    done = sum(1 for it in items if it["type"] == "step" and it["checked"])
    return jsonify(id=pid, title=title, items=items, total=total, done=done)


@bp.route("/<pid>/toggle", methods=["POST"])
def toggle(pid):
    f = PB_DIR / f"{pid}.md"
    if not f.exists():
        return jsonify(error="not found"), 404
    d = request.get_json(silent=True) or {}
    step = str(d.get("step"))
    checked = bool(d.get("checked"))
    runs = _runs()
    runs.setdefault(pid, {})[step] = checked
    _save_runs(runs)
    return jsonify(ok=True)


@bp.route("/<pid>/reset", methods=["POST"])
def reset(pid):
    runs = _runs()
    if pid in runs:
        del runs[pid]
        _save_runs(runs)
    return jsonify(ok=True)
