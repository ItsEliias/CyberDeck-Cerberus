"""
Credentials module — a local, encrypted credential vault.

Master password → scrypt-derived key → AES-256-GCM over the whole vault JSON. The
password is never stored; a wrong password fails the GCM auth tag (that IS the verifier).
The derived key lives only in this process's memory after unlock (mirrors a desktop
app's in-memory unlock) and is wiped on lock. Bound to 127.0.0.1 — single local user.

This builds the vault feature; the user enters their own secrets. Nothing is transmitted.
"""
from __future__ import annotations

import base64
import json
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from flask import Blueprint, jsonify, request

bp = Blueprint("credentials", __name__, url_prefix="/api/credentials")

VAULT_FILE = Path(os.environ.get(
    "CYBERDECK_CREDS",
    str(Path(__file__).resolve().parents[2] / "data" / "credentials" / "vault.json"),
))

# scrypt params (interactive-strength).
_SCRYPT = {"n": 2 ** 15, "r": 8, "p": 1, "dklen": 32}

# In-memory unlock state (this process only).
_state: dict = {"key": None}


def _derive(password: str, salt: bytes) -> bytes:
    # cryptography's Scrypt — works regardless of the Python build's OpenSSL/hashlib.
    kdf = Scrypt(salt=salt, length=_SCRYPT["dklen"],
                 n=_SCRYPT["n"], r=_SCRYPT["r"], p=_SCRYPT["p"])
    return kdf.derive(password.encode("utf-8"))


def _encrypt(key: bytes, obj) -> str:
    nonce = os.urandom(12)
    ct = AESGCM(key).encrypt(nonce, json.dumps(obj).encode("utf-8"), None)
    return base64.b64encode(nonce + ct).decode("ascii")


def _decrypt(key: bytes, blob: str):
    raw = base64.b64decode(blob)
    return json.loads(AESGCM(key).decrypt(raw[:12], raw[12:], None).decode("utf-8"))


def _load_file() -> dict | None:
    if not VAULT_FILE.exists():
        return None
    try:
        return json.loads(VAULT_FILE.read_text("utf-8"))
    except Exception:
        return None


def _save_file(salt_b64: str, blob: str):
    VAULT_FILE.parent.mkdir(parents=True, exist_ok=True)
    VAULT_FILE.write_text(json.dumps({"salt": salt_b64, "blob": blob, "kdf": _SCRYPT}, indent=2), "utf-8")


def _read_vault() -> dict:
    """Decrypt the on-disk vault with the in-memory key. Requires unlock."""
    f = _load_file()
    return _decrypt(_state["key"], f["blob"])


def _write_vault(vault: dict):
    f = _load_file()
    _save_file(f["salt"], _encrypt(_state["key"], vault))


def _require_unlocked():
    return _state["key"] is not None


@bp.route("/status")
def status():
    f = _load_file()
    configured = f is not None
    count = None
    if configured and _require_unlocked():
        try:
            count = len(_read_vault().get("entries", []))
        except Exception:
            count = None
    return jsonify(configured=configured, locked=not _require_unlocked(), count=count)


@bp.route("/setup", methods=["POST"])
def setup():
    if _load_file() is not None:
        return jsonify(error="vault already exists"), 400
    pw = (request.get_json(silent=True) or {}).get("password") or ""
    if len(pw) < 8:
        return jsonify(error="master password must be at least 8 characters"), 400
    salt = os.urandom(16)
    key = _derive(pw, salt)
    _save_file(base64.b64encode(salt).decode("ascii"), _encrypt(key, {"entries": []}))
    _state["key"] = key
    return jsonify(ok=True)


@bp.route("/unlock", methods=["POST"])
def unlock():
    f = _load_file()
    if f is None:
        return jsonify(error="no vault; set one up first"), 400
    pw = (request.get_json(silent=True) or {}).get("password") or ""
    key = _derive(pw, base64.b64decode(f["salt"]))
    try:
        _decrypt(key, f["blob"])  # auth tag verifies the password
    except Exception:
        return jsonify(error="wrong master password"), 401
    _state["key"] = key
    return jsonify(ok=True)


@bp.route("/lock", methods=["POST"])
def lock():
    _state["key"] = None
    return jsonify(ok=True)


@bp.route("/list")
def list_entries():
    if not _require_unlocked():
        return jsonify(error="locked"), 401
    entries = _read_vault().get("entries", [])
    # Never send passwords in the list — masked only.
    safe = [{"id": e["id"], "label": e.get("label", ""), "username": e.get("username", ""),
             "url": e.get("url", ""), "notes": e.get("notes", ""), "updated": e.get("updated", ""),
             "has_password": bool(e.get("password"))} for e in entries]
    return jsonify(entries=safe)


@bp.route("/reveal/<eid>")
def reveal(eid):
    if not _require_unlocked():
        return jsonify(error="locked"), 401
    for e in _read_vault().get("entries", []):
        if e["id"] == eid:
            return jsonify(password=e.get("password", ""))
    return jsonify(error="not found"), 404


@bp.route("/add", methods=["POST"])
def add():
    if not _require_unlocked():
        return jsonify(error="locked"), 401
    d = request.get_json(silent=True) or {}
    if not (d.get("label") or "").strip():
        return jsonify(error="label required"), 400
    vault = _read_vault()
    entry = {
        "id": secrets.token_hex(8),
        "label": d.get("label", "").strip(),
        "username": d.get("username", ""),
        "password": d.get("password", ""),
        "url": d.get("url", ""),
        "notes": d.get("notes", ""),
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    vault.setdefault("entries", []).append(entry)
    _write_vault(vault)
    return jsonify(ok=True, id=entry["id"])


@bp.route("/<eid>", methods=["DELETE"])
def delete(eid):
    if not _require_unlocked():
        return jsonify(error="locked"), 401
    vault = _read_vault()
    before = len(vault.get("entries", []))
    vault["entries"] = [e for e in vault.get("entries", []) if e["id"] != eid]
    if len(vault["entries"]) == before:
        return jsonify(error="not found"), 404
    _write_vault(vault)
    return jsonify(ok=True)
