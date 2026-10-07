# CyberDeck (on Cerberus)

A self-hosted, offline-first study and engagement-tracking desktop app for cybersecurity learners and pentesters — built by porting CyberDeck's feature set onto the Cerberus Flask/vanilla-JS stack.

## Overview

CyberDeck is a single desktop program that consolidates the scattered tools a security learner or pentester normally juggles — course notes, an Obsidian-style knowledge vault, flashcards, playbooks, a CTF/box tracker, a credential vault, a findings/reporting workflow, network calculators, and more — into one consistent, offline-capable HUD-style interface.

This particular repository is a **from-scratch rebuild** of an existing Electron/React CyberDeck app, retargeted onto the codebase and design system of a separate project called **Cerberus** (a Flask + vanilla-JS "AI workspace" app). The idea: fork Cerberus, strip out everything Cerberus-specific (chat/LLM, email, calendar, agents, etc.), keep its HUD look and shell (icon-rail sidebar, 22 theme palettes, jarvis-v2 component system), and rebuild CyberDeck's 25 modules on top of it in Python instead of TypeScript. The original Electron CyberDeck remains the behavioural spec/reference; this repo does not share code with it.

The result is meant to ship as a **native-feeling desktop program** (via PyInstaller + pywebview), not a browser tab — everything runs against a `127.0.0.1`-only Flask server with a random/fixed loopback port, so nothing is exposed on the network.

## Key Features

Everything below is a working Flask blueprint + matching frontend view (verified against `app/modules/*.py` and `app/static/deck/*.js`), not aspirational:

- **Home** — dashboard aggregating recent notes, courses, and credential-vault state
- **Courses** — platform-agnostic importer: point it at a local folder of course material (or a URL), it scans/classifies files and indexes them *in place* (never copies media); tracks per-course status (planned/in-progress/completed) with a % slider, filter tabs, a per-course assignments checklist, and can generate a quiz/flashcards straight from a course's text
- **Learning Paths** — curated, checkable study roadmaps that thread together courses/playbooks/flashcards, plus 28 imported TryHackMe roadmap paths (502 rooms, sourced from Hunterdii/TryHackMe-Roadmap, bundled as `app/static/roadmaps/thm-roadmap.json`) alongside the 3 hand-authored core paths
- **Knowledge** — an Obsidian-style markdown vault browser: folder tree, note rendering, `[[wikilink]]`/relative-link resolution, clickable `#tag` pills with a tag browser, one-level `![[Note]]` embeds, and `[[ ]]` autocomplete while editing — all reads sandboxed inside a configured vault root
- **Glossary** — auto-extracts `**Term** — definition` style lines out of the vault into a searchable term bank
- **Map** — a note link-graph view over the vault
- **Playbooks** — markdown checklists (`- [ ]` steps) with persisted run/tick state per step
- **Flashcards** — SM-2 spaced-repetition scheduler, plus offline heuristic auto-generation of cards from vault notes (definitions, headings, bold terms — no AI/network call)
- **Quiz** — multiple-choice mock-exam mode
- **Progress** — streaks + an activity heatmap (backed by `activity.py`), plus per-topic 1–5 confidence self-ratings (`ratings.py`) for a weak-area view
- **NetLab** — offline subnet/CIDR calculators and a common-ports reference (pure math, no network access)
- **Targets** — engagement targets + findings, plain JSON store
- **Attack Board** — a Kanban of attack progress (ReconDesk-style)
- **Scan Import** — parses pasted `nmap`/dir-brute output (text only, performs no scanning itself) into Targets + the Attack Board
- **Sessions** — CTF/HTB-style box tracker: live timer, methodology checklist, notes
- **Journal** — timestamped lab/engagement log, tagged to a box/target, which compiles into a structured markdown CTF write-up export
- **Topology** — a host/network node-and-edge graph, stored as JSON
- **Reports** — markdown report drafts with rendered HTML export (print-to-PDF)
- **Credentials** — a local encrypted credential vault: master password → scrypt-derived key → AES-256-GCM over the vault JSON; the password itself is never stored (a wrong password just fails the GCM auth tag) and the derived key lives only in-process, wiped on lock
- **Snippets** — a payload/command library with `{LHOST}`/`{LPORT}`/`{RHOST}`/`{PORT}`/`{URL}`/`{WORDLIST}` placeholder substitution
- **Toolkit** — small stateless server-side helpers (e.g. MD5 hashing, which browser SubtleCrypto can't do); encoding/regex/subnet tools run client-side
- **Resources** — a tagged bookmark library (lightweight — link + metadata only, unlike Courses)
- **Cheat Sheets** — your own titled markdown quick-refs, seeded with a starter recon sheet
- **Feeds** — offline-first RSS/Atom security-news reader with disk caching (stdlib-only fetch, http/https only, serves the cache when offline)
- **Terminal** — a sandboxed command runner: only available in the packaged desktop app, wired through pywebview's in-process JS↔Python bridge rather than any HTTP port, so it's unreachable from the network
- **Search** — a single query fanned out across notes, targets, findings, playbooks, snippets, and courses
- Cerberus's inherited **appearance system**: 22 colour palettes, density/layout/motion settings, font/accent controls, and a first-run onboarding wizard

## Tech Stack

- **Backend:** Python 3 (developed against 3.9.6 locally; CI builds target 3.11), **Flask** `>=3.0,<4.0`
- **Desktop shell:** **pywebview** `>=3.4` (native WebKit/WebView2/GTK window, no browser chrome), packaged with **PyInstaller** into `CyberDeck.app` (macOS) / `CyberDeck.exe` (Windows)
- **Frontend:** vanilla JavaScript SPA (no framework/build step) + hand-rolled CSS inherited from Cerberus's `jarvis-v2` HUD design system; xterm.js (vendored) for the Terminal view
- **Content processing:** `Markdown`, `pymdown-extensions`, `pygments` (syntax highlighting), `html2text`, `pypdf` (PDF→flashcards), `youtube-transcript-api` (transcript→flashcards)
- **Security:** `cryptography` `>=42` (AES-256-GCM + scrypt for the credential vault)
- **Data layer:** flat JSON files + a markdown vault on disk — no database/ORM; each module's store path is independently overridable via env vars
- **CI/CD:** GitHub Actions (`.github/workflows/build.yml`) — builds Windows and macOS desktop binaries via PyInstaller on manual dispatch or version tags

## Architecture

Flask registers one **blueprint per module** under `/api/<module>`; each blueprint owns its own flat-JSON (or markdown) store on disk, independently relocatable via a `CYBERDECK_*` env var. The frontend is a single-page shell (`shell.html` + `deck.js`) that switches between per-module vanilla-JS views, each talking only to its own module's JSON API. `desktop.py` is the packaged entry point: it starts Flask in a background thread on a stable loopback port, waits for `/api/health`, then opens a native `pywebview` window pointed at it — the Terminal module is the one exception, bridged in-process via `js_api` instead of HTTP so it's never network-reachable.

```
CyberDeck-Cerberus/
├── app/
│   ├── app.py                # Flask app factory: registers all 24 blueprints, dev server entry
│   ├── desktop.py            # Packaged/desktop entry: starts Flask + opens pywebview window
│   ├── desktop_assets/       # App icon (.icns/.png)
│   ├── modules/              # One file per feature = one Flask Blueprint + its JSON/markdown store
│   │   ├── vault.py          #   shared data layer: sandboxed markdown-vault access (CYBERDECK_VAULT)
│   │   ├── knowledge.py      #   vault tree + note rendering
│   │   ├── courses.py        #   folder/URL course importer
│   │   ├── flashcards.py     #   SM-2 scheduler + note→card generator
│   │   ├── credentials.py    #   AES-256-GCM encrypted vault
│   │   ├── shell_bridge.py   #   pywebview js_api — sandboxed Terminal backend
│   │   └── ...               #   playbooks, targets, board, scanparse, sessions, journal,
│   │                         #   topology, reports, snippets, toolkit, resources, cheatsheets,
│   │                         #   feeds, activity, ratings, paths, glossary, search, home
│   ├── static/
│   │   ├── deck/             # This app's own frontend: deck.js (shell/nav) + one view per module
│   │   ├── jarvis-v2/        # Inherited Cerberus HUD design system (tokens, components, themes)
│   │   ├── css/, fonts/, lib/, vendor/  # Inherited Cerberus styling + vendored libs (xterm, etc.)
│   │   └── js/                # Legacy Cerberus JS carried over from the fork; not all of it is wired up
│   └── templates/
│       └── shell.html        # The single HTML shell every module renders into
├── data/                      # Default on-disk JSON stores + seeded content (dev default; each is
│                               # relocatable via CYBERDECK_* and repointed to Application Support in
│                               # the packaged build)
├── docs/
│   └── MIGRATION_PLAN.md      # The fork/rebuild plan this project was executed against
├── cyberdeck.spec              # PyInstaller spec: `pyinstaller cyberdeck.spec` → dist/CyberDeck.app|.exe
├── requirements.txt
└── .github/workflows/build.yml # CI: builds Windows .exe + macOS .app on tag/dispatch
```

## Getting Started

1. **Clone the repo**
   ```bash
   git clone https://github.com/ItsEliias/CyberDeck-Cerberus.git
   cd CyberDeck-Cerberus
   ```
2. **Create a virtual environment and install dependencies**
   ```bash
   python3 -m venv .venv
   ./.venv/bin/pip install -r requirements.txt
   ```
   On macOS, install `pywebview` from a prebuilt wheel to avoid a slow `pyobjc` source build:
   ```bash
   ./.venv/bin/pip install --only-binary :all: pywebview
   ```
3. **Point it at a vault (optional but recommended)** — by default the vault root is a hardcoded local dev path; set your own before running:
   ```bash
   export CYBERDECK_VAULT=/path/to/your/markdown/notes
   ```
   Other stores (`CYBERDECK_SESSIONS`, `CYBERDECK_BOARD`, `CYBERDECK_TARGETS`, `CYBERDECK_CREDS`, `CYBERDECK_FLASHCARDS`, `CYBERDECK_PLAYBOOKS`, `CYBERDECK_FEEDS`, `CYBERDECK_ACTIVITY`, `CYBERDECK_TOPOLOGY`, `CYBERDECK_SNIPPETS`, `CYBERDECK_REPORTS`, `CYBERDECK_COURSES`, `CYBERDECK_RESOURCES`, `CYBERDECK_RATINGS`, `CYBERDECK_PATHS`, `CYBERDECK_JOURNAL`, `CYBERDECK_CHEATSHEETS`, `CYBERDECK_EVIDENCE`) each default to a JSON file/folder under `data/` and rarely need overriding for local dev. No secrets/API keys are required — everything is local and offline.
4. **Run it** (see commands below).

## Running It

There's no `package.json`/task runner — everything is invoked directly against the venv's Python:

| Command | What it does |
|---|---|
| `./.venv/bin/python app/app.py` | Runs the Flask dev server (auto-reload, debug on) at `http://127.0.0.1:7100`. Override the port with `CYBERDECK_PORT`; set `CYBERDECK_DEBUG=0` to disable the reloader. |
| `./.venv/bin/python app/desktop.py` | Runs the **desktop** entry point: starts Flask in-process on a stable loopback port (8137, or a free one if taken) and opens it in a native `pywebview` window — this is how the packaged app behaves. |
| `pyinstaller --noconfirm cyberdeck.spec` | Builds the standalone desktop binary: `dist/CyberDeck.app` on macOS, `dist/CyberDeck.exe` on Windows. This is also what CI (`.github/workflows/build.yml`) runs on a version tag or manual dispatch. |
| `./build-macos-app.sh` | Alternative macOS packaging path: builds a lightweight launcher `.app` + drag-to-Applications `.dmg` that shells out to this repo's own `.venv` at runtime (no PyInstaller bundling — the install path is baked in, so rebuild if you move the repo). Override the port with `CYBERDECK_PORT`. |

There is currently no automated test suite or linter configured in this repo.

## Installing on Windows

A macOS `.app` will not run on Windows, and PyInstaller cannot cross-compile, so the
Windows `.exe` must be produced on Windows. Two ways:

**A. Download a prebuilt `.exe` from CI (no toolchain needed) — recommended**

1. On GitHub → **Actions** → **Build desktop app** → **Run workflow** (or push a `vX.Y.Z`
   tag). The `windows` job builds `CyberDeck.exe`.
2. When it finishes, download the **`CyberDeck-windows`** artifact and unzip it.
3. Double-click **`CyberDeck.exe`**. SmartScreen may warn on an unsigned binary →
   *More info → Run anyway*. Needs the **Edge WebView2 runtime** (preinstalled on
   Windows 11 and most Windows 10; otherwise a free download from Microsoft).

**B. Build/run from source on the Windows machine**

```powershell
git clone https://github.com/ItsEliias/CyberDeck-Cerberus.git
cd CyberDeck-Cerberus
py -3 -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt pyinstaller pythonnet
# Run it directly in a native window:
.\.venv\Scripts\python app\desktop.py
# …or package a standalone exe (dist\CyberDeck.exe):
.\.venv\Scripts\pyinstaller --noconfirm cyberdeck.spec
```

**Data & vault on Windows.** App data (progress, credentials, courses, etc.) is stored
under `%APPDATA%\CyberDeck\data`. The Knowledge vault defaults to
`%USERPROFILE%\Documents\CyberDeck\Vault` (created on first run) — point `CYBERDECK_VAULT`
at your own Obsidian vault to use that instead.

## Installing on Linux

Grab **`CyberDeck-linux.tar.gz`** from the release (or the CI `CyberDeck-linux`
artifact), extract, and run the `CyberDeck` binary:

```bash
tar -xzf CyberDeck-linux.tar.gz
./CyberDeck
```

**Runtime prerequisite (one-time).** Unlike Windows/macOS, the Linux build is *not*
fully self-contained — pywebview renders through **WebKit2GTK**, which must be present
on your machine. Most GTK desktops (GNOME, etc.) already have GTK; install the WebKit
piece if the window doesn't open:

```bash
# Debian/Ubuntu
sudo apt install libwebkit2gtk-4.1-0 gir1.2-webkit2-4.1
# Fedora
sudo dnf install webkit2gtk4.1
# Arch
sudo pacman -S webkit2gtk-4.1
```

App data is stored under `$XDG_DATA_HOME/CyberDeck/data` (defaults to
`~/.local/share/CyberDeck/data`); the vault defaults to `~/Documents/CyberDeck/Vault`
(override with `CYBERDECK_VAULT`). Build from source with the same
`pyinstaller --noconfirm cyberdeck.spec` after installing the GTK dev libs
(`libgirepository1.0-dev libcairo2-dev gir1.2-webkit2-4.1`) plus `pip install PyGObject pycairo`.

## On Your Phone

CyberDeck installs on a phone as an app (home-screen icon, full screen, bottom
tabs). Run it on your laptop or headless on an always-on box
(`python app/serve.py`), share it privately with `tailscale serve`, then use
*Add to Home Screen*. Notes, cards and the credential vault are never cached
on the phone, and the Terminal stays desktop-only. Full steps:
[docs/PHONE.md](docs/PHONE.md).

## Project Structure

| Path | Purpose |
|---|---|
| `app/app.py` | Flask entry point; registers every module blueprint; dev-server `__main__` |
| `app/desktop.py` | Desktop/packaged entry point; launches Flask + the native webview window |
| `app/modules/` | One Python file per feature module (Flask Blueprint + its own JSON/markdown store) |
| `app/modules/vault.py` | Shared, sandboxed markdown-vault data layer used by Knowledge/Glossary/Search/Home |
| `app/modules/shell_bridge.py` | In-process `pywebview` API backing the sandboxed Terminal module |
| `app/static/deck/` | This project's own frontend — `deck.js` (shell + nav) plus one view file per module |
| `app/static/jarvis-v2/`, `app/static/css/`, `app/static/fonts/` | Design system + styling inherited from the Cerberus fork |
| `app/templates/shell.html` | The single HTML template the whole SPA renders into |
| `data/` | Default JSON/markdown stores and seed content for local dev |
| `docs/MIGRATION_PLAN.md` | The fork/rebuild plan (what was kept vs. stripped from Cerberus, phased rollout) |
| `cyberdeck.spec` | PyInstaller build spec for the desktop binaries |
| `.github/workflows/build.yml` | CI: builds Windows/macOS desktop binaries |
| `requirements.txt` | Python dependencies |

## Status

Actively developed, pre-1.0. Per the migration plan's phases, the project has moved well past the original P1–P3 scope (shell, backends, frontend views) into ongoing feature work: recent commits add a knowledge graph, auto-glossary, cheat-sheet builder, journal/write-up export, PDF/YouTube-transcript flashcard import, learning paths, desktop-launch polish (stable loopback port, custom avatars), Obsidian-style tags/embeds/autocomplete for Knowledge plus course completion tracking, assignments and quiz-from-course generation, and — most recently — importing Hunterdii's TryHackMe roadmap as 28 additional Learning Paths (502 rooms). All 25 modules listed in the nav have a working backend blueprint and frontend view. There is no test suite yet, and Windows/Linux desktop packaging is CI-only (untested locally beyond macOS in this environment).

## License

Proprietary — see [`LICENSE`](LICENSE). All rights reserved by ItsEliias (Eliias); "CyberDeck" is used as an unregistered trademark. No copying, modification, distribution, or derivative use without express written permission.
