"""
Where CyberDeck keeps its data on disk.

The packaged desktop app and the headless server (serve.py) both store data in
one per-user folder, so running either on the same machine shows the same
flashcards, playbooks, courses and vault. Dev runs from source (python app.py)
keep using the repo's data/ folder unless told otherwise.

An explicit CYBERDECK_* env var always wins (setdefault). The notes vault
(CYBERDECK_VAULT) is left alone: it lives with the notes.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

_FILES = {
    "CYBERDECK_SESSIONS": "sessions.json", "CYBERDECK_BOARD": "board.json",
    "CYBERDECK_PLAYBOOKS": "playbooks", "CYBERDECK_TARGETS": "targets.json",
    "CYBERDECK_EVIDENCE": "evidence", "CYBERDECK_CREDS": "credentials/vault.json",
    "CYBERDECK_FEEDS": "feeds", "CYBERDECK_FLASHCARDS": "flashcards.json",
    "CYBERDECK_ACTIVITY": "activity.json", "CYBERDECK_TOPOLOGY": "topology.json",
    "CYBERDECK_SNIPPETS": "snippets.json", "CYBERDECK_REPORTS": "reports",
    "CYBERDECK_COURSES": "courses", "CYBERDECK_RESOURCES": "resources.json",
    "CYBERDECK_RATINGS": "ratings.json", "CYBERDECK_PATHS": "paths.json",
    "CYBERDECK_JOURNAL": "journal.json", "CYBERDECK_CHEATSHEETS": "cheatsheets.json",
    "CYBERDECK_PROFILE": "profile.json",
}


def user_data_root() -> Path:
    """Per-user data folder: CYBERDECK_DATA if set, else the OS convention."""
    override = os.environ.get("CYBERDECK_DATA")
    if override:
        return Path(override).expanduser()
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    elif os.name == "nt":
        base = Path(os.environ.get("APPDATA", Path.home()))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "CyberDeck" / "data"


def persist_data_env(force: bool = False) -> None:
    """Point every module's store at the per-user folder.

    Frozen builds always need this (onefile unpacks to a temp dir wiped on
    exit). The server passes force=True so it shares the desktop app's data.
    """
    if not force and not getattr(sys, "frozen", False):
        return
    root = user_data_root()
    root.mkdir(parents=True, exist_ok=True)
    for var, sub in _FILES.items():
        os.environ.setdefault(var, str(root / sub))
