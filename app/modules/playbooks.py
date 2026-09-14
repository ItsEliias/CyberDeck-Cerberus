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
    "learning-roadmap.md": """# Cybersecurity Learning Roadmap

A start-to-finish path using reputable, mostly-free platforms. Work top to bottom.

## Foundations (free, browser-based)
- [ ] TryHackMe — Pre Security + Complete Beginner paths (https://tryhackme.com)
- [ ] Professor Messer — free CompTIA Security+ SY0-701 course (https://professormesser.com)
- [ ] OverTheWire — Bandit wargame for Linux/SSH fundamentals (https://overthewire.org/wargames/bandit/)
- [ ] Learn networking: OSI model, TCP/IP, common ports, DNS, HTTP

## Web application security
- [ ] PortSwigger Web Security Academy — free, hands-on labs (https://portswigger.net/web-security)
- [ ] Read the OWASP Top 10 (2021) and test each class (https://owasp.org/Top10/)
- [ ] OWASP Juice Shop — deliberately vulnerable app to practice on (https://owasp.org/www-project-juice-shop/)

## Offensive / hands-on labs
- [ ] TryHackMe — Jr Penetration Tester + Offensive Pentesting paths
- [ ] Hack The Box — Starting Point, then retired machines with writeups (https://hackthebox.com)
- [ ] HTB Academy — structured modules (https://academy.hackthebox.com)
- [ ] VulnHub / picoCTF for extra practice (https://picoctf.org)

## Defensive / blue team
- [ ] LetsDefend or Blue Team Labs Online — SOC analyst simulations
- [ ] CyberDefenders — DFIR + blue-team challenges (https://cyberdefenders.org)
- [ ] Learn a SIEM (Splunk / Elastic) and basic detection engineering

## Certifications (map to your goal)
- [ ] Foundation: CompTIA Security+ (SY0-701) or ISC2 CC
- [ ] Defensive: CompTIA CySA+ (blue team / SOC)
- [ ] Offensive: CompTIA PenTest+ or CEH → then OSCP (OffSec PEN-200)
- [ ] Advanced: CISSP (management) / GCIH / OSCP
""",
    "owasp-web-testing.md": """# OWASP Top 10 Web Testing

Walk each 2021 category against the target. Log evidence per finding.

## A01 Broken Access Control
- [ ] IDOR — swap IDs / usernames on every object reference
- [ ] Force-browse to admin/hidden endpoints without a role
- [ ] Test vertical + horizontal privilege boundaries

## A02 Cryptographic Failures
- [ ] Check TLS config + cert (testssl.sh); flag cleartext transport
- [ ] Hunt weak hashing, hardcoded keys, sensitive data at rest

## A03 Injection
- [ ] SQLi on every param (sqlmap to confirm)
- [ ] Command injection, SSTI, and LDAP/NoSQL injection
- [ ] XSS — reflected, stored, and DOM-based

## A04–A05 Insecure Design / Misconfiguration
- [ ] Default creds, verbose errors, directory listing, debug endpoints
- [ ] Missing security headers (CSP, HSTS, X-Frame-Options)

## A06–A08 Components / Auth / Integrity
- [ ] Fingerprint versions vs known CVEs
- [ ] Auth: weak lockout, session fixation, JWT flaws
- [ ] Insecure deserialization / unsigned update mechanisms

## A09–A10 Logging / SSRF
- [ ] Confirm security events are logged + monitored
- [ ] SSRF via URL params to reach internal/cloud metadata
""",
    "windows-privesc.md": """# Windows Privilege Escalation

## Situational awareness
- [ ] `whoami /all`, `systeminfo`, current privileges + groups
- [ ] OS build/patch level vs known exploits
- [ ] Run winPEAS / Seatbelt for automated triage

## Hunt
- [ ] SeImpersonate/SeAssign → Potato attacks
- [ ] Unquoted service paths + weak service permissions
- [ ] AlwaysInstallElevated, scheduled tasks, autoruns
- [ ] Stored creds: registry, Credential Manager, SAM/LSASS

## Escalate
- [ ] Exploit the best finding to SYSTEM
- [ ] Dump hashes / tokens for lateral movement
- [ ] Record exact steps + artifacts for the report
""",
    "active-directory.md": """# Active Directory Attacks

## Recon
- [ ] Enumerate domain: users, groups, computers (BloodHound / ldapdomaindump)
- [ ] Find attack paths to Domain Admin in BloodHound
- [ ] SMB / null sessions, shares, and password policy

## Credential access
- [ ] Kerberoasting (request + crack service tickets)
- [ ] AS-REP roasting (accounts without pre-auth)
- [ ] LLMNR/NBT-NS poisoning (Responder) → crack hashes

## Movement + escalation
- [ ] Pass-the-Hash / Pass-the-Ticket
- [ ] Abuse ACLs / delegation (constrained, RBCD)
- [ ] DCSync to pull krbtgt → Golden Ticket
- [ ] Document domain compromise path end to end
""",
    "network-recon.md": """# Network Recon & Enumeration

## Discover
- [ ] Host discovery sweep (nmap -sn) to map live hosts
- [ ] Full TCP port scan, then version/script scan open ports
- [ ] UDP scan the common services (53, 161, 123, 500)

## Enumerate services
- [ ] SMB (445): shares, users, versions (enum4linux, smbclient)
- [ ] Web (80/443): tech stack + directory brute-force
- [ ] DNS (53): zone transfer + subdomain enumeration
- [ ] SNMP (161), FTP (21), SSH (22), RDP (3389) banners + defaults

## Prioritise
- [ ] Map versions to known CVEs
- [ ] Rank targets by exploitability + impact
- [ ] Record scope + findings before exploitation
""",
    "incident-response.md": """# Incident Response (Blue Team)

Follows the SANS PICERL lifecycle.

## Preparation
- [ ] Confirm scope, contacts, and authority to act
- [ ] Have tooling + clean analysis workstation ready

## Identification
- [ ] Triage the alert; confirm true vs false positive
- [ ] Scope affected hosts/accounts; build a timeline
- [ ] Preserve volatile evidence (memory, netstat, logs)

## Containment
- [ ] Isolate affected hosts from the network
- [ ] Disable/reset compromised accounts + rotate secrets

## Eradication & Recovery
- [ ] Remove malware / persistence; patch the entry vector
- [ ] Restore from known-good backups; monitor for reinfection

## Lessons Learned
- [ ] Write the report: root cause, timeline, IOCs
- [ ] Feed detections + fixes back into preparation
""",
    "osint-recon.md": """# OSINT Reconnaissance

Passive intel gathering — no packets to the target where possible.

## Footprint
- [ ] Enumerate domains, subdomains, IP ranges (crt.sh, amass, subfinder)
- [ ] Identify employees + email format (LinkedIn, hunter.io)
- [ ] Check breach dumps for the org's credentials (HIBP, dehashed)

## Public exposure
- [ ] Google dorking for exposed files, panels, and errors
- [ ] Shodan / Censys for internet-facing services + banners
- [ ] GitHub/GitLab search for leaked secrets, keys, and configs

## Wrap
- [ ] Map the external attack surface + likely entry points
- [ ] Record every source for the report
""",
    "password-attacks.md": """# Password Attacks

## Obtain
- [ ] Capture hashes (Responder, /etc/shadow, SAM/LSASS, DB dumps)
- [ ] Identify the hash type (hashid / hash-identifier)

## Crack (offline)
- [ ] Wordlist attack (hashcat/john + rockyou + rules)
- [ ] Mask/rule attacks shaped to the password policy
- [ ] Escalate wordlists (SecLists) if the fast pass fails

## Use (online — mind lockouts)
- [ ] Password spraying: one common password across many users
- [ ] Targeted brute-force (hydra) only where allowed
- [ ] Reuse working creds laterally; document what succeeded
""",
}


def _seed():
    # Per-file so new default playbooks appear on existing installs too. Only
    # writes a seed when its file is missing — user edits (the .md is source of
    # truth) are never clobbered; a deleted default reappears on next list.
    PB_DIR.mkdir(parents=True, exist_ok=True)
    for name, body in _SEEDS.items():
        f = PB_DIR / name
        if not f.exists():
            f.write_text(body, "utf-8")


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
