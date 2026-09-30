#!/usr/bin/env bash
# CyberDeck (on Cerberus) — Linux launcher.
#
# Opens CyberDeck as a native desktop window (GTK/WebKit2) — Flask runs in-process
# on 127.0.0.1 only, nothing is exposed on the network. First run creates the venv
# and installs deps; later runs just launch.
#
#   ./run-linux.sh              # launch (setting up on first run)
#   ./run-linux.sh --reinstall  # rebuild the venv from scratch
#
# Prereqs (Arch/Omarchy):  sudo pacman -S --needed python webkit2gtk-4.1 python-gobject
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
VENV=".venv"

if [[ "${1:-}" == "--reinstall" ]]; then rm -rf "$VENV"; fi

# The GTK/WebKit backend comes from the system (python-gobject + webkit2gtk-4.1),
# so the venv must be able to import them → build it with --system-site-packages.
needs_setup=0
if [[ ! -x "$VENV/bin/python" ]]; then
  needs_setup=1
elif ! "$VENV/bin/python" -c 'import gi' >/dev/null 2>&1; then
  echo "venv can't see system PyGObject — rebuilding with --system-site-packages…"
  rm -rf "$VENV"; needs_setup=1
fi

if [[ "$needs_setup" == 1 ]]; then
  echo "First run — creating virtualenv and installing dependencies…"
  python3 -m venv --system-site-packages "$VENV"
  "$VENV/bin/pip" -q install --upgrade pip
  "$VENV/bin/pip" -q install -r requirements.txt
fi

# Fail early with a clear message if the WebKit backend isn't installed.
if ! "$VENV/bin/python" - <<'PY' 2>/dev/null
import gi
gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
PY
then
  echo "Missing GTK/WebKit runtime. Install it with:"
  echo "  sudo pacman -S --needed webkit2gtk-4.1 python-gobject gtk3"
  exit 1
fi

exec "$VENV/bin/python" app/desktop.py
