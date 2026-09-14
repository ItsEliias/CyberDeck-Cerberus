# PyInstaller spec — build a standalone CyberDeck desktop app.
#   Windows:  pyinstaller cyberdeck.spec         → dist/CyberDeck.exe
#   macOS:    pyinstaller cyberdeck.spec         → dist/CyberDeck.app
# Bundles the Flask app + the whole frontend; the vault/data stay on disk (env-configured).
from PyInstaller.utils.hooks import collect_submodules

datas = [("app/static", "static"), ("app/templates", "templates")]
hiddenimports = (
    collect_submodules("webview")   # native webview backends (cocoa / winforms / gtk)
    + collect_submodules("modules")  # every Flask blueprint
    + ["flask", "jinja2", "markdown", "cryptography"]
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
    icon="app/desktop_assets/cyberdeck.icns",
)

app = BUNDLE(              # macOS .app wrapper (ignored on Windows/Linux)
    exe,
    name="CyberDeck.app",
    icon="app/desktop_assets/cyberdeck.icns",
    bundle_identifier="dev.cyberdeck.app",
)
