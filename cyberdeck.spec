# PyInstaller spec — build a standalone CyberDeck desktop app.
#   Windows:  pyinstaller cyberdeck.spec         → dist/CyberDeck.exe
#   macOS:    pyinstaller cyberdeck.spec         → dist/CyberDeck.app
# Bundles the Flask app + the whole frontend; the vault/data stay on disk (env-configured).
import os
import sys

from PyInstaller.utils.hooks import collect_submodules

# Platform-correct app icon (.ico on Windows, .icns on macOS). Passed only if it
# exists, so a missing icon never breaks the build on a fresh checkout.
_icon = "app/desktop_assets/cyberdeck.ico" if sys.platform == "win32" else "app/desktop_assets/cyberdeck.icns"
ICON = _icon if os.path.exists(_icon) else None

datas = [("app/static", "static"), ("app/templates", "templates")]
hiddenimports = (
    collect_submodules("webview")   # native webview backends (cocoa / winforms / gtk)
    + collect_submodules("modules")  # every Flask blueprint
    + ["flask", "jinja2", "markdown", "cryptography", "html2text", "certifi", "pypdf"]
    + collect_submodules("youtube_transcript_api")
    + collect_submodules("pymdownx") + collect_submodules("pygments")
)

a = Analysis(
    ["app/desktop.py"],
    pathex=["app"],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz, a.scripts, a.binaries, a.datas, [],
    name="CyberDeck",
    console=False,          # windowed app, no terminal
    disable_windowed_traceback=False,
    icon=ICON,
)

app = BUNDLE(              # macOS .app wrapper (ignored on Windows/Linux)
    exe,
    name="CyberDeck.app",
    icon=ICON,
    bundle_identifier="dev.cyberdeck.app",
)
