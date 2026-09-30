# Running CyberDeck on Linux

CyberDeck runs natively on Linux as a desktop window (GTK + WebKit2), with Flask
in-process on `127.0.0.1` only — nothing is exposed on the network. Tested on
Omarchy / Arch (Hyprland + Wayland).

## Quick start

```bash
./run-linux.sh
```

First run creates the virtualenv and installs dependencies; later runs just launch.
Rebuild the environment with `./run-linux.sh --reinstall`.

### Prerequisites (Arch / Omarchy)

```bash
sudo pacman -S --needed python webkit2gtk-4.1 python-gobject gtk3
```

The GTK/WebKit backend that renders the window comes from the **system**
(`python-gobject` + `webkit2gtk-4.1`), so the virtualenv is created with
`--system-site-packages` to reach them. `run-linux.sh` handles this — and repairs
an existing venv that was created without it.

## Install it into your app launcher

```bash
./packaging/linux/install.sh
```

Adds a **CyberDeck** entry (with icon) to `~/.local/share/applications` for
walker/wofi/rofi and the dock. Uninstall with `./packaging/linux/install.sh -u`.
No root required.

## Notes

- The window's Wayland app-id is set to `cyberdeck` (via `GLib.set_prgname` in
  `app/desktop.py`) so it matches the desktop entry's `StartupWMClass` and shows
  the right icon.
- WebKit version: pywebview uses **WebKit2GTK 4.1** here (4.0 and 6.0 are not
  installed on this machine); the launcher checks for it and prints an install
  hint if it's missing.
- Data (flashcards, playbooks, notes vault, etc.) lives where each module's
  `CYBERDECK_*` env var points; in dev it defaults under the repo's `data/`.
