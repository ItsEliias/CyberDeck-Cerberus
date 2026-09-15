"""
Shell bridge — backs the Terminal module in the desktop app.

Runs commands the USER types, in-process, exposed to the UI only through pywebview's
js_api (a direct Python<->JS call), NOT over the Flask HTTP port. That's the sandboxing
the Terminal was deferred for: nothing on the network can reach it, only the app window.
Only ever runs commands the user enters in the terminal — never anything from page content.
"""
from __future__ import annotations

import os
import subprocess
import webbrowser


class ShellSession:
    """A stateful cwd + command runner. One per app window."""

    def __init__(self, cwd: str | None = None, timeout: int = 60):
        self.cwd = os.path.abspath(cwd or os.path.expanduser("~"))
        self.timeout = timeout

    def run(self, cmd: str) -> dict:
        cmd = (cmd or "").strip()
        if not cmd:
            return {"out": "", "cwd": self.cwd, "code": 0}
        if cmd == "clear":
            return {"clear": True, "cwd": self.cwd, "code": 0}

        # `cd` has to mutate our own state (a subprocess cd wouldn't persist).
        if cmd == "cd" or cmd.startswith("cd ") or cmd.startswith("cd\t"):
            arg = cmd[2:].strip() or os.path.expanduser("~")
            arg = os.path.expanduser(arg)
            target = arg if os.path.isabs(arg) else os.path.join(self.cwd, arg)
            target = os.path.normpath(target)
            if os.path.isdir(target):
                self.cwd = target
                return {"out": "", "cwd": self.cwd, "code": 0}
            return {"out": f"cd: no such directory: {arg}", "cwd": self.cwd, "code": 1}

        try:
            p = subprocess.run(cmd, shell=True, cwd=self.cwd,
                               capture_output=True, text=True, timeout=self.timeout)
            return {"out": (p.stdout or "") + (p.stderr or ""), "cwd": self.cwd, "code": p.returncode}
        except subprocess.TimeoutExpired:
            return {"out": f"[timed out after {self.timeout}s]", "cwd": self.cwd, "code": 124}
        except Exception as e:  # noqa: BLE001 — surface the error text to the terminal
            return {"out": str(e), "cwd": self.cwd, "code": 1}


class DesktopApi:
    """Exposed to JS as window.pywebview.api in the packaged app."""

    def __init__(self):
        self._sh = ShellSession()

    def term_run(self, cmd: str) -> dict:
        return self._sh.run(cmd)

    def term_cwd(self) -> str:
        return self._sh.cwd

    def open_external(self, url: str) -> bool:
        """Open a URL in the system browser — called when the user clicks an
        external link in a note so it never navigates the app window away.
        http/https only; anything else is ignored."""
        u = (url or "").strip()
        if u.startswith(("http://", "https://")):
            try:
                webbrowser.open(u)
                return True
            except Exception:
                return False
        return False
