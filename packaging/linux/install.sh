#!/usr/bin/env bash
# Install CyberDeck into the Linux desktop (menus/launchers), current user only.
# Idempotent; re-run any time.
#
#   ./packaging/linux/install.sh     # install / update
#   ./packaging/linux/install.sh -u  # uninstall
set -euo pipefail

APPID="cyberdeck"
REPO="$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_BASE="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor"

if [[ "${1:-}" == "-u" || "${1:-}" == "--uninstall" ]]; then
  rm -f "$DESKTOP_DIR/$APPID.desktop" "$ICON_BASE/256x256/apps/$APPID.png"
  command -v update-desktop-database >/dev/null && update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
  command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -f -t "$ICON_BASE" 2>/dev/null || true
  echo "Removed CyberDeck desktop entry."; exit 0
fi

mkdir -p "$DESKTOP_DIR" "$ICON_BASE/256x256/apps"
install -m644 "$REPO/packaging/linux/$APPID-256.png" "$ICON_BASE/256x256/apps/$APPID.png"

sed "s#__EXEC__#$REPO/run-linux.sh#g" "$REPO/packaging/linux/$APPID.desktop" \
  > "$DESKTOP_DIR/$APPID.desktop"
chmod 644 "$DESKTOP_DIR/$APPID.desktop"
chmod +x "$REPO/run-linux.sh"

command -v update-desktop-database >/dev/null && update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -f -t "$ICON_BASE" 2>/dev/null || true

echo "Installed. Search 'CyberDeck' in your app launcher (walker/wofi/rofi)."
echo "Launcher: $DESKTOP_DIR/$APPID.desktop  ->  $REPO/run-linux.sh"
