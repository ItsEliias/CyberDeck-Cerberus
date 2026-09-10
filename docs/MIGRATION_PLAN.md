# CyberDeck-on-Cerberus — Migration Plan

**Goal (user's words):** clone Cerberus, remove what we don't need, then move CyberDeck
into what's left — so we inherit *all* of Cerberus's styling, colours, themes, and fonts.
**Web-first**, then wrapped into a desktop **program** (not browser-based).

This is a from-scratch rebuild of CyberDeck's features on Cerberus's stack
(Flask + vanilla-JS SPA), *not* a port of the Electron/React code. The Electron
CyberDeck stays intact on `main` in the other repo as the working reference/spec.

---

## The two stacks

| | CyberDeck (existing) | Cerberus (the base) |
|---|---|---|
| Runtime | Electron desktop | Flask web app (Docker) |
| UI | React 18 + TS + Tailwind | Vanilla-JS SPA + hand-rolled CSS |
| Backend | Node main process, IPC | Python Flask, 75 route modules |
| Data | local vault (fs) + better-sqlite3 | server-side stores |
| Design | tokens.css (ported *from* Cerberus) | `style.css` + `jarvis-v2/` HUD system |

**Consequence:** every CyberDeck feature's backend (vault read, SQLite index, path
containment, credential crypto, nmap parse, report render) is TypeScript today and must be
**reimplemented in Python**. The React views become **vanilla-JS modules** in Cerberus's style.
The existing `src/main/logic/**` (pure, unit-tested TS) is the behavioural spec for each.

---

## What we KEEP from Cerberus (the design + shell)

- **Design system:** `static/style.css`, the whole `static/jarvis-v2/` HUD stack
  (tokens, components, surfaces, hud, shell-panels, tool-tabs, per-view HUDs),
  `static/dashboard.css`, `static/css/cerberus-os-home.css`.
- **Theme engine:** `static/js/theme.js` (22 palettes + advanced overrides, density,
  bg-patterns, live syntax-highlight derivation) + the localStorage `cerberus-theme` bootstrap.
- **Fonts:** `static/fonts/` (+ whatever `style.css` @font-faces).
- **Shell layout:** `.icon-rail` → `.sidebar` (`[C]…` brand, `.jx2-hud-chip` status row,
  `.sidebar-inner` sections, `.sidebar-user-bar`) → `.chat-container` main. Classes reused verbatim.
- **`lib/xterm.*`** — Cerberus already bundles xterm.js → reuse for the Terminal module.
- Auth/session pattern (`routes/auth_routes.py`, `session_routes.py`) — adapt, don't rebuild.

## What we STRIP (Cerberus features CyberDeck doesn't need)

Chat/LLM, model subscriptions (chatgpt/claude/copilot), agents/council/conference-room,
email (+ pollers/compose), calendar, contacts, documents/library, cookbook, gallery,
deep-research, memory/brain, skills, trading, mcp_servers, tts/stt/voice, globe/nexus,
command-center. → ~35 route modules + their big JS files (`chat.js`, `email*.js`,
`document.js` 9.7k lines, `gallery*.js`, `cookbook*.js`, `calendar.js`, `memory.js`, …) removed.

---

## Module map — CyberDeck 12 → Cerberus blueprints + JS views

| CyberDeck module | Flask blueprint (`app/modules/`) | Frontend (`static/js/deck/`) | Backend work |
|---|---|---|---|
| Home | `home.py` | `home.js` | aggregate summary |
| Courses | `courses.py` | `courses.js` | markdown course parse + progress |
| Knowledge | `knowledge.py` | `knowledge.js` | vault folder tree + note render (Obsidian-like) |
| Playbooks | `playbooks.py` | `playbooks.js` | playbook parse + run state |
| NetLab | `netlab.py` | `netlab.js` | net tools (subnet/port/dns) — pure calc |
| Targets | `targets.py` | `targets.js` | targets + findings CRUD |
| Topology | `topology.py` | `topology.js` | host graph (reuse a graph lib) |
| Reports | `reports.py` | `reports.js` | templates + PDF export (weasyprint/reportlab) |
| Credentials | `credentials.py` | `credentials.js` | **encrypted vault** (Python cryptography) |
| Feeds | `feeds.py` | `feeds.js` | RSS/news fetch + cache |
| Terminal | `terminal.py` | `terminal.js` | xterm + pty (careful: sandbox) |
| Settings | `settings.py` | `settings.js` | vault root, media roots, theme, lock |

Data layer: markdown vault on disk = source of truth; SQLite = rebuildable index
(same contract as the Electron app's hard rules).

---

## Phases

- **P0 — Fork scaffold** *(done)*: new repo, full Cerberus frontend copied in, Flask skeleton,
  this plan.
- **P1 — Stripped shell boots**: Flask serves a CyberDeck shell (icon-rail + sidebar + main)
  in the authentic Cerberus look; theme switching works; nav routes between stub module panels.
  *No feature backends yet.* ← de-risk gate.
- **P2 — Backends, module by module**: reimplement each module's logic in Python, porting
  behaviour from `src/main/logic/**`. Start with **Knowledge** (vault tree + note render) as the
  first full vertical slice, then Home, Courses, Credentials, the rest.
- **P3 — Frontend views**: build each `deck/*.js` view against its blueprint's JSON API,
  styled with the jarvis-v2 HUD classes.
- **P4 — Desktop wrap** ("a program, not browser-based"): candidates —
  (a) **pywebview** (lightest: Python bundles Flask + a native webview, one binary via
  PyInstaller); (b) Cerberus's own **`desktop_bridge/`** (investigate what it already does);
  (c) **Electron shell** loading `127.0.0.1`. Decision deferred to P4; pywebview is the
  current front-runner for a single offline installer.

## Open risks / honest costs

- TS→Python reimplementation of every backend (biggest cost).
- Cerberus's SPA JS is coupled to its own APIs; we build fresh `deck/*.js` rather than
  untangle it — the CSS/classes carry the look, not the old JS.
- CDN deps in the original shell (`katex`, `mermaid`) must be vendored to stay offline.
- Losing the Electron app's test suite/installer until P2–P4 rebuild equivalents.
