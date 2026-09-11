"""Topology module — a host/network graph (nodes + edges) stored as JSON."""
from __future__ import annotations

import json
import math
import os
import secrets
from pathlib import Path

from flask import Blueprint, jsonify, request

from . import targets

bp = Blueprint("topology", __name__, url_prefix="/api/topology")

STORE = Path(os.environ.get(
    "CYBERDECK_TOPOLOGY",
    str(Path(__file__).resolve().parents[2] / "data" / "topology.json"),
))
KINDS = ["host", "router", "firewall", "subnet", "service", "attacker"]


def _load() -> dict:
    if STORE.exists():
        try:
            return json.loads(STORE.read_text("utf-8"))
        except Exception:
            pass
    return {"nodes": [], "edges": []}


def _save(g: dict):
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(g, indent=2), "utf-8")


def _place(n: int):
    """Default position for the n-th node — spread around a circle."""
    cx, cy, r = 420, 300, 200
    a = n * (math.pi * 2 / 8)
    return round(cx + r * math.cos(a)), round(cy + r * math.sin(a))


@bp.route("/graph")
def graph():
    g = _load()
    return jsonify(nodes=g["nodes"], edges=g["edges"], kinds=KINDS)


@bp.route("/node", methods=["POST"])
def add_node():
    d = request.get_json(silent=True) or {}
    if not (d.get("label") or "").strip():
        return jsonify(error="label required"), 400
    g = _load()
    x, y = _place(len(g["nodes"]))
    node = {"id": secrets.token_hex(5), "label": d["label"].strip(),
            "kind": d.get("kind") if d.get("kind") in KINDS else "host",
            "x": d.get("x", x), "y": d.get("y", y)}
    g["nodes"].append(node)
    _save(g)
    return jsonify(ok=True, node=node)


@bp.route("/node/<nid>", methods=["POST"])
def update_node(nid):
    d = request.get_json(silent=True) or {}
    g = _load()
    for n in g["nodes"]:
        if n["id"] == nid:
            if "x" in d:
                n["x"] = d["x"]
            if "y" in d:
                n["y"] = d["y"]
            if d.get("label"):
                n["label"] = d["label"].strip()
            if d.get("kind") in KINDS:
                n["kind"] = d["kind"]
            _save(g)
            return jsonify(ok=True)
    return jsonify(error="not found"), 404


@bp.route("/node/<nid>", methods=["DELETE"])
def delete_node(nid):
    g = _load()
    g["nodes"] = [n for n in g["nodes"] if n["id"] != nid]
    g["edges"] = [e for e in g["edges"] if e["from"] != nid and e["to"] != nid]
    _save(g)
    return jsonify(ok=True)


@bp.route("/edge", methods=["POST"])
def add_edge():
    d = request.get_json(silent=True) or {}
    a, b = d.get("from"), d.get("to")
    g = _load()
    ids = {n["id"] for n in g["nodes"]}
    if a not in ids or b not in ids or a == b:
        return jsonify(error="invalid edge"), 400
    if any(e["from"] == a and e["to"] == b for e in g["edges"]):
        return jsonify(ok=True)  # already linked
    edge = {"id": secrets.token_hex(5), "from": a, "to": b, "label": d.get("label", "")}
    g["edges"].append(edge)
    _save(g)
    return jsonify(ok=True, edge=edge)


@bp.route("/edge/<eid>", methods=["DELETE"])
def delete_edge(eid):
    g = _load()
    g["edges"] = [e for e in g["edges"] if e["id"] != eid]
    _save(g)
    return jsonify(ok=True)


@bp.route("/import-targets", methods=["POST"])
def import_targets():
    """Add a node for each target host not already on the graph."""
    g = _load()
    existing = {n["label"] for n in g["nodes"]}
    added = 0
    for t in targets._load()["targets"]:
        label = t.get("host") or t.get("name")
        if label and label not in existing:
            x, y = _place(len(g["nodes"]))
            g["nodes"].append({"id": secrets.token_hex(5), "label": label, "kind": "host", "x": x, "y": y})
            existing.add(label)
            added += 1
    _save(g)
    return jsonify(ok=True, added=added)
