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


# Starter deck seeded on first run (deck, front, back). Concise, exam-accurate.
_SEED_CARDS = [
    # ── Security+ Core ──
    ("Security+ Core", "What is the CIA triad?", "Confidentiality, Integrity, Availability — the three core security goals."),
    ("Security+ Core", "Confidentiality", "Data is only accessible to authorized parties (encryption, access control)."),
    ("Security+ Core", "Integrity", "Data is accurate and unaltered (hashing, digital signatures)."),
    ("Security+ Core", "Availability", "Systems and data are accessible when needed (redundancy, backups, DR)."),
    ("Security+ Core", "Non-repudiation", "A party cannot deny an action — provided by digital signatures + logging."),
    ("Security+ Core", "What does AAA stand for?", "Authentication, Authorization, Accounting."),
    ("Security+ Core", "Threat vs Vulnerability vs Risk", "Threat = potential danger; Vulnerability = a weakness; Risk = likelihood × impact."),
    ("Security+ Core", "Principle of least privilege", "Give users/processes only the minimum access needed to do their job."),
    ("Security+ Core", "Defense in depth", "Layered, overlapping controls so no single failure is fatal."),
    ("Security+ Core", "Zero Trust", "Never trust, always verify — no implicit trust based on network location."),
    ("Security+ Core", "The three MFA factor types", "Something you know, something you have, something you are."),
    ("Security+ Core", "Control categories (Security+)", "Technical, Managerial, Operational, Physical."),
    ("Security+ Core", "Control functions", "Preventive, Detective, Corrective, Deterrent, Compensating, Directive."),
    ("Security+ Core", "Phishing vs Spear phishing vs Whaling", "Phishing = mass; Spear = targeted individual; Whaling = targets executives."),
    ("Security+ Core", "Ransomware", "Malware that encrypts data and demands payment for the decryption key."),
    ("Security+ Core", "Trojan", "Malware disguised as legitimate software to trick the user into running it."),
    ("Security+ Core", "Rootkit", "Malware that hides its presence with deep/privileged system access."),
    # ── Common Ports ──
    ("Common Ports", "Port 22", "SSH — secure remote shell (also SCP/SFTP)."),
    ("Common Ports", "Ports 20/21", "FTP — file transfer (21 control, 20 data)."),
    ("Common Ports", "Port 23", "Telnet — remote access, cleartext (insecure)."),
    ("Common Ports", "Port 25", "SMTP — sending email."),
    ("Common Ports", "Port 53", "DNS — name resolution (TCP + UDP)."),
    ("Common Ports", "Ports 67/68", "DHCP — dynamic IP assignment."),
    ("Common Ports", "Port 80", "HTTP — web (cleartext)."),
    ("Common Ports", "Port 443", "HTTPS — HTTP over TLS."),
    ("Common Ports", "Port 445", "SMB — Windows file sharing."),
    ("Common Ports", "Port 3389", "RDP — Remote Desktop Protocol."),
    ("Common Ports", "Ports 161/162", "SNMP — network device management."),
    ("Common Ports", "Port 389 / 636", "LDAP / LDAPS (secure) — directory services."),
    ("Common Ports", "Port 110 / 143", "POP3 / IMAP — retrieving email."),
    ("Common Ports", "Port 3306 / 1433", "MySQL / Microsoft SQL Server."),
    # ── OWASP Top 10 (2021) ──
    ("OWASP Top 10", "A01:2021", "Broken Access Control — enforcing user permission boundaries (IDOR, forced browsing)."),
    ("OWASP Top 10", "A02:2021", "Cryptographic Failures — weak/missing crypto exposing sensitive data."),
    ("OWASP Top 10", "A03:2021", "Injection — untrusted input interpreted as code (SQLi, XSS, command)."),
    ("OWASP Top 10", "A04:2021", "Insecure Design — flaws in the design/architecture, not just the code."),
    ("OWASP Top 10", "A05:2021", "Security Misconfiguration — defaults, verbose errors, missing hardening."),
    ("OWASP Top 10", "A06:2021", "Vulnerable and Outdated Components — using libraries with known CVEs."),
    ("OWASP Top 10", "A07:2021", "Identification and Authentication Failures — weak auth/session handling."),
    ("OWASP Top 10", "A08:2021", "Software and Data Integrity Failures — unverified updates/deserialization."),
    ("OWASP Top 10", "A09:2021", "Security Logging and Monitoring Failures — can't detect/respond to breaches."),
    ("OWASP Top 10", "A10:2021", "Server-Side Request Forgery (SSRF) — server fetches an attacker-controlled URL."),
    # ── Networking ──
    ("Networking", "The 7 OSI layers", "Physical, Data Link, Network, Transport, Session, Presentation, Application."),
    ("Networking", "TCP vs UDP", "TCP = reliable, connection-oriented, ordered; UDP = fast, connectionless, best-effort."),
    ("Networking", "TCP three-way handshake", "SYN → SYN-ACK → ACK."),
    ("Networking", "Private IPv4 ranges", "10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16."),
    ("Networking", "What is ARP?", "Resolves an IP address to a MAC address on the local network."),
    ("Networking", "DHCP DORA process", "Discover, Offer, Request, Acknowledge."),
    ("Networking", "DNS record: A vs CNAME vs MX", "A = name→IPv4; CNAME = alias→name; MX = mail server for a domain."),
    ("Networking", "What does NAT do?", "Translates private IPs to a public IP (and back) at the gateway."),
    # ── Tools of the Trade ──
    ("Tools", "Nmap", "Network discovery + port/service scanner."),
    ("Tools", "Wireshark", "Packet capture and protocol analysis."),
    ("Tools", "Burp Suite", "Intercepting proxy for web application testing."),
    ("Tools", "Metasploit", "Exploitation framework (modules, payloads, post-ex)."),
    ("Tools", "Hydra", "Online (network) password brute-forcing."),
    ("Tools", "John the Ripper / Hashcat", "Offline password/hash cracking (Hashcat is GPU-accelerated)."),
    ("Tools", "gobuster / ffuf", "Directory, file, and vhost/content brute-forcing."),
    ("Tools", "sqlmap", "Automated SQL injection detection and exploitation."),
    ("Tools", "BloodHound", "Maps Active Directory attack paths to Domain Admin."),
    ("Tools", "Responder", "Poisons LLMNR/NBT-NS to capture NetNTLM hashes."),
    # ── Cryptography ──
    ("Cryptography", "Symmetric vs asymmetric encryption", "Symmetric = one shared key (AES, fast); Asymmetric = public/private key pair (RSA/ECC)."),
    ("Cryptography", "Hashing", "One-way, fixed-length digest for integrity — not reversible (SHA-256)."),
    ("Cryptography", "Encoding vs Encryption vs Hashing", "Encoding = reversible format (Base64); Encryption = reversible with a key; Hashing = one-way."),
    ("Cryptography", "What is a salt?", "Random per-password value added before hashing to defeat rainbow tables."),
    ("Cryptography", "Digital signature", "Hash of data encrypted with a private key — gives integrity, authenticity, non-repudiation."),
    ("Cryptography", "What is PKI?", "Public Key Infrastructure — CAs, certificates, and keys binding identities to public keys."),
    ("Cryptography", "Password hashing algorithms", "bcrypt, scrypt, Argon2 — slow + salted by design (not MD5/SHA-1)."),
]


def _today():
    return datetime.now(timezone.utc).date()


def _load() -> dict:
    if STORE.exists():
        try:
            return json.loads(STORE.read_text("utf-8"))
        except Exception:
            pass
    # First run: seed a starter deck so review has content out of the box.
    # Once the file exists it's never re-seeded, so user deletions stick.
    d = _seed_deck()
    _save(d)
    return d


def _save(d: dict):
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(d, indent=2), "utf-8")


def _seed_deck() -> dict:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    cards = []
    for deck, front, back in _SEED_CARDS:
        cards.append({
            "id": secrets.token_hex(6), "front": front, "back": back, "deck": deck,
            "ease": 2.5, "reps": 0, "interval": 0, "lapses": 0,
            "due": now, "created": now,
        })
    return {"cards": cards}


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
