"""Toolkit module — small stateless helpers for the offline tools view.

Only hosts what's awkward in the browser: hashing (incl. MD5, which SubtleCrypto
can't do, and which needs a secure context WKWebView doesn't grant over http).
Encode/decode, regex, subnet, and the reference tables all run client-side.
"""
from __future__ import annotations

import hashlib

from flask import Blueprint, jsonify, request

bp = Blueprint("toolkit", __name__, url_prefix="/api/toolkit")


@bp.route("/hash", methods=["POST"])
def hash_text():
    text = (request.get_json(silent=True) or {}).get("text", "")
    b = str(text).encode("utf-8", "replace")
    return jsonify(
        length=len(b),
        md5=hashlib.md5(b).hexdigest(),
        sha1=hashlib.sha1(b).hexdigest(),
        sha256=hashlib.sha256(b).hexdigest(),
        sha512=hashlib.sha512(b).hexdigest(),
    )
