"""
Scan importer — parse pasted nmap / dir-brute output and push into Targets + Attack Board.

Pure text parsing (no scanning is performed here); it reads output the user already has.
"""
from __future__ import annotations

import re
import secrets

from flask import Blueprint, jsonify, request

from . import targets, board

bp = Blueprint("scan", __name__, url_prefix="/api/scan")

_HOST = re.compile(r"Nmap scan report for (?:.*?\(([\d.]+)\)|([\d.]+|[\w.-]+))")
# [ \t] not \s for separators — \s would eat the newline and swallow the next port line.
_PORT = re.compile(r"^(\d{1,5})/(tcp|udp)[ \t]+(open|filtered|closed|open\|filtered)[ \t]+(\S+)(?:[ \t]+([^\n]*?))?[ \t]*$", re.M)
_PATH = re.compile(r"(/\S*)\s*\(Status:\s*(\d{3})\)(?:\s*\[Size:\s*(\d+)\])?", re.I)
_FEROX = re.compile(r"^(\d{3})\s+\w+\s+.*?\s(https?://\S+)$", re.M)


def parse(text: str) -> dict:
    host = None
    mh = _HOST.search(text or "")
    if mh:
        host = mh.group(1) or mh.group(2)

    ports = []
    for m in _PORT.finditer(text or ""):
        if m.group(3).startswith("open"):
            ports.append({"port": int(m.group(1)), "proto": m.group(2), "state": m.group(3),
                          "service": m.group(4), "version": (m.group(5) or "").strip()})

    paths = []
    for m in _PATH.finditer(text or ""):
        paths.append({"path": m.group(1), "status": int(m.group(2)), "size": int(m.group(3)) if m.group(3) else None})
    for m in _FEROX.finditer(text or ""):
        p = m.group(2)
        paths.append({"path": p, "status": int(m.group(1)), "size": None})

    tool = "nmap" if ports else ("dir-brute" if paths else "unknown")
    return {"tool": tool, "host": host, "ports": ports, "paths": paths}


@bp.route("/parse", methods=["POST"])
def parse_route():
    return jsonify(parse((request.get_json(silent=True) or {}).get("text", "")))


@bp.route("/to-target", methods=["POST"])
def to_target():
    d = request.get_json(silent=True) or {}
    parsed = parse(d.get("text", ""))
    host = (d.get("host") or parsed["host"] or "").strip()
    name = (d.get("name") or host or "Imported target").strip()

    data = targets._load()
    t = {"id": secrets.token_hex(6), "name": name, "host": host, "os": "",
         "status": "scoping", "findings": [], "created": targets._now()}
    for p in parsed["ports"]:
        label = f"{p['port']}/{p['proto']} {p['service']}" + (f" — {p['version']}" if p["version"] else "")
        t["findings"].append({"id": secrets.token_hex(6), "title": label,
                              "severity": "info", "notes": "from scan import", "created": targets._now()})
    data["targets"].append(t)
    targets._save(data)
    return jsonify(ok=True, id=t["id"], ports=len(parsed["ports"]))


@bp.route("/to-board", methods=["POST"])
def to_board():
    d = request.get_json(silent=True) or {}
    parsed = parse(d.get("text", ""))
    host = (d.get("host") or parsed["host"] or "").strip()
    g = board._load()
    added = 0
    for p in parsed["ports"]:
        g["cards"].append({"id": secrets.token_hex(6), "col": "recon",
                           "title": f"enum {p['service']} :{p['port']}", "notes": p["version"],
                           "target": host, "created": targets._now()})
        added += 1
    board._save(g)
    return jsonify(ok=True, added=added)
