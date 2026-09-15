"""
Flashcards module — spaced-repetition review (SM-2) + auto-generation from notes.

Cards persist to JSON with SM-2 scheduling (ease/interval/due). The generator turns a
vault note into proposed Q&A / cloze cards using offline heuristics (definition lines,
headings, bold terms) — no AI required.
"""
from __future__ import annotations

import json
import os
import random
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
    # ── Linux Commands ──
    ("Linux Commands", "sudo -l", "List which commands the current user may run via sudo (privesc recon)."),
    ("Linux Commands", "find / -perm -4000 2>/dev/null", "Find SUID binaries — a classic privilege-escalation vector."),
    ("Linux Commands", "chmod 755 (rwxr-xr-x)", "Owner: read/write/execute; group + others: read/execute."),
    ("Linux Commands", "ss -tulpn / netstat -tulpn", "List listening TCP/UDP ports and the owning processes."),
    ("Linux Commands", "ps aux", "Show all running processes with users and command lines."),
    ("Linux Commands", "grep -r 'pattern' .", "Recursively search files under the current directory for text."),
    ("Linux Commands", "/etc/passwd vs /etc/shadow", "passwd = account list (world-readable); shadow = password hashes (root only)."),
    ("Linux Commands", "crontab -l", "List the current user's scheduled cron jobs."),
    ("Linux Commands", "getcap -r / 2>/dev/null", "Find files with Linux capabilities set — another privesc path."),
    ("Linux Commands", "ssh -i key user@host", "Connect over SSH authenticating with a private key file."),
    ("Linux Commands", "chmod +x file", "Add the execute permission to a file."),
    ("Linux Commands", "history", "Show the shell command history (often leaks secrets)."),
    # ── Windows & AD ──
    ("Windows & AD", "NTLM", "Challenge-response auth; the hash can be relayed or cracked (pass-the-hash)."),
    ("Windows & AD", "Kerberos", "Ticket-based authentication — client gets a TGT from the KDC/DC."),
    ("Windows & AD", "Kerberoasting", "Request service tickets (SPNs) and crack them offline for service creds."),
    ("Windows & AD", "Pass-the-Hash", "Authenticate using an NTLM hash directly — no plaintext password needed."),
    ("Windows & AD", "LSASS", "Process that caches credentials in memory; Mimikatz dumps it."),
    ("Windows & AD", "Mimikatz", "Tool to extract plaintext creds, hashes, and Kerberos tickets from memory."),
    ("Windows & AD", "SID", "Security Identifier — unique ID for a user, group, or computer."),
    ("Windows & AD", "GPO", "Group Policy Object — centrally managed configuration/policy in AD."),
    ("Windows & AD", "DCSync", "Abuse replication rights to pull password hashes (incl. krbtgt) from a DC."),
    ("Windows & AD", "Golden Ticket", "Forged TGT signed with the krbtgt hash — near-unlimited domain access."),
    ("Windows & AD", "SAM", "Local Windows database of account password hashes."),
    ("Windows & AD", "BloodHound", "Graphs AD objects/ACLs to find attack paths to Domain Admin."),
    # ── Web Vulns ──
    ("Web Vulns", "Reflected vs Stored vs DOM XSS", "Reflected = echoed from request; Stored = saved server-side; DOM = client-side sink."),
    ("Web Vulns", "CSRF", "Tricks an authenticated user's browser into sending an unwanted state-changing request."),
    ("Web Vulns", "SSRF", "Makes the server send attacker-controlled requests (e.g. to internal/cloud metadata)."),
    ("Web Vulns", "SSTI", "Server-Side Template Injection — injected template syntax → often RCE."),
    ("Web Vulns", "IDOR", "Insecure Direct Object Reference — access others' objects by changing an ID."),
    ("Web Vulns", "LFI vs RFI", "Local File Inclusion (files on server) vs Remote File Inclusion (attacker-hosted)."),
    ("Web Vulns", "XXE", "XML External Entity — abuse XML parsing to read files or trigger SSRF."),
    ("Web Vulns", "Blind SQL injection", "SQLi with no direct output — infer data via boolean/time-based responses."),
    ("Web Vulns", "Insecure deserialization", "Untrusted serialized data deserialized into objects → RCE/logic abuse."),
    ("Web Vulns", "Command injection", "User input passed to a shell → arbitrary OS command execution."),
    ("Web Vulns", "Open redirect", "App redirects to an attacker-supplied URL — aids phishing/token theft."),
    ("Web Vulns", "Clickjacking", "Transparent iframe tricks a user into clicking hidden UI (defend with X-Frame-Options/CSP)."),
    # ── Nmap & Scanning ──
    ("Nmap & Scanning", "nmap -sS", "TCP SYN 'stealth' scan — half-open, doesn't complete the handshake."),
    ("Nmap & Scanning", "nmap -sV", "Probe open ports to determine service/version."),
    ("Nmap & Scanning", "nmap -sC", "Run the default set of NSE scripts."),
    ("Nmap & Scanning", "nmap -A", "Aggressive: OS detection + version + default scripts + traceroute."),
    ("Nmap & Scanning", "nmap -p-", "Scan all 65535 TCP ports."),
    ("Nmap & Scanning", "nmap -Pn", "Skip host discovery — treat the host as up (bypasses ping blocks)."),
    ("Nmap & Scanning", "nmap -sU", "UDP scan (slower; DNS/SNMP/DHCP live here)."),
    ("Nmap & Scanning", "nmap -T4", "Faster timing template (T0 slowest … T5 insane)."),
    ("Nmap & Scanning", "nmap -oA base", "Output in all three formats (normal, XML, grepable)."),
    ("Nmap & Scanning", "nmap --script <name>", "Run a specific NSE script or category against the target."),
    # ── Blue Team / IR ──
    ("Blue Team / IR", "IOC", "Indicator of Compromise — an artifact (hash, IP, domain) signalling a breach."),
    ("Blue Team / IR", "SIEM", "Aggregates + correlates logs for detection/alerting (Splunk, Elastic)."),
    ("Blue Team / IR", "EDR", "Endpoint Detection and Response — monitors + responds on endpoints."),
    ("Blue Team / IR", "MITRE ATT&CK", "Knowledge base of real-world adversary tactics and techniques (TTPs)."),
    ("Blue Team / IR", "Cyber Kill Chain", "Recon → Weaponize → Deliver → Exploit → Install → C2 → Actions on objectives."),
    ("Blue Team / IR", "False positive vs false negative", "FP = benign flagged as malicious; FN = malicious missed."),
    ("Blue Team / IR", "SOAR", "Security Orchestration, Automation and Response — automates playbook actions."),
    ("Blue Team / IR", "Threat hunting", "Proactively searching for threats that evaded automated detection."),
    ("Blue Team / IR", "Chain of custody", "Documented handling of evidence to keep it admissible/trustworthy."),
    ("Blue Team / IR", "TTP", "Tactics, Techniques, and Procedures — how an adversary operates."),
]


def _today():
    return datetime.now(timezone.utc).date()


def _load() -> dict:
    d = {"cards": []}
    if STORE.exists():
        try:
            d = json.loads(STORE.read_text("utf-8"))
        except Exception:
            d = {"cards": []}
    return _topup_seeds(d)


def _save(d: dict):
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(d, indent=2), "utf-8")


def _seed_card(deck: str, front: str, back: str) -> dict:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    return {"id": secrets.token_hex(6), "front": front, "back": back, "deck": deck,
            "ease": 2.5, "reps": 0, "interval": 0, "lapses": 0, "due": now, "created": now}


def _topup_seeds(d: dict) -> dict:
    """Add any seed card not already present (keyed by deck+front) so new default
    cards reach existing stores without duplicating. A deleted default reappears
    on next load — same trade-off as the playbook seeds."""
    have = {(c.get("deck", ""), c.get("front", "")) for c in d.get("cards", [])}
    changed = False
    for deck, front, back in _SEED_CARDS:
        if (deck, front) not in have:
            d.setdefault("cards", []).append(_seed_card(deck, front, back))
            changed = True
    if changed:
        _save(d)
    return d


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
    cards = d["cards"]
    return jsonify(total=len(cards), due=sum(1 for c in cards if _is_due(c)),
                   reviewed=sum(1 for c in cards if c.get("reps", 0) > 0),
                   mature=sum(1 for c in cards if c.get("interval", 0) >= 21))


# ── Quiz / mock-exam (MCQ from the card pool) ──────────────────────────────────
@bp.route("/quiz")
def quiz():
    deck = request.args.get("deck")
    try:
        n = min(max(int(request.args.get("n", 10)), 1), 40)
    except ValueError:
        n = 10
    d = _load()
    pool = [c for c in d["cards"] if c.get("front") and c.get("back") and (not deck or c.get("deck") == deck)]
    backs = list({c["back"] for c in d["cards"] if c.get("back")})
    random.shuffle(pool)
    qs = []
    for c in pool[:n]:
        distractors = [b for b in backs if b != c["back"]]
        random.shuffle(distractors)
        choices = [c["back"]] + distractors[:3]
        random.shuffle(choices)
        qs.append({"id": c["id"], "front": c["front"], "correct": c["back"],
                   "choices": choices, "deck": c.get("deck", "General")})
    return jsonify(questions=qs, count=len(qs))


@bp.route("/quiz-result", methods=["POST"])
def quiz_result():
    data = request.get_json(silent=True) or {}
    d = _load()
    rec = {"date": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "deck": str(data.get("deck") or "All")[:60],
           "score": int(data.get("score", 0)), "total": int(data.get("total", 0))}
    d.setdefault("quizzes", []).append(rec)
    d["quizzes"] = d["quizzes"][-50:]
    _save(d)
    return jsonify(ok=True, history=list(reversed(d["quizzes"]))[:8])


@bp.route("/quiz-history")
def quiz_history():
    return jsonify(history=list(reversed(_load().get("quizzes", [])))[:8])


# ── Generator (#4) ─────────────────────────────────────────────────────────────
_DEF = re.compile(r"^\s*[-*]?\s*\*\*(.+?)\*\*\s*[—:\-]\s*(.+?)\s*$")
_DEF2 = re.compile(r"^\s*[-*]\s+([A-Z][\w /()+-]{2,40}?):\s+(.+?)\s*$")
_HEAD = re.compile(r"^(#{2,4})\s+(.+?)\s*$")
_BOLD = re.compile(r"\*\*(.+?)\*\*")


@bp.route("/generate", methods=["POST"])
def generate():
    """Propose cards from raw text or a vault note (offline heuristics). No save; UI confirms."""
    data = request.get_json(silent=True) or {}
    text = data.get("text")
    path = data.get("path", "")
    if text is None:
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

    deck = (data.get("deck") or "").strip() or Path(path).stem or "Imported"
    return jsonify(deck=deck, proposed=proposed[:30], count=len(proposed))
