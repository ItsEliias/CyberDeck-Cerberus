"""CyberDeck installs as a phone app and never caches or leaks live data."""
import json
import re
from pathlib import Path

import pytest

from app import app as flask_app

STATIC = Path(flask_app.static_folder)


@pytest.fixture
def client():
    flask_app.config.update(TESTING=True)
    return flask_app.test_client()


def png_size(data: bytes) -> tuple[int, int]:
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")


def test_manifest(client):
    resp = client.get("/manifest.webmanifest")
    assert resp.status_code == 200
    assert resp.mimetype == "application/manifest+json"
    m = json.loads(resp.data)
    assert m["name"] == "CyberDeck"
    assert m["start_url"] == "/" and m["display"] == "standalone"
    assert {i["purpose"] for i in m["icons"]} == {"any", "maskable"}


def test_icons_exist_at_declared_size(client):
    for icon in json.loads(client.get("/manifest.webmanifest").data)["icons"]:
        resp = client.get(icon["src"])
        assert resp.status_code == 200, icon["src"]
        w, h = (int(n) for n in icon["sizes"].split("x"))
        assert png_size(resp.data) == (w, h)


def test_service_worker_served_from_root(client):
    resp = client.get("/sw.js")
    assert resp.status_code == 200
    assert "javascript" in resp.mimetype
    assert resp.headers["Cache-Control"] == "no-cache"
    assert resp.headers["Service-Worker-Allowed"] == "/"


def test_service_worker_never_caches_api():
    src = (STATIC / "sw.js").read_text()
    assert 'if (url.pathname.startsWith("/api/")) return;' in src


def test_shell_wires_app_and_phone_nav(client):
    html = client.get("/").get_data(as_text=True)
    assert 'rel="manifest" href="/manifest.webmanifest"' in html
    assert "viewport-fit=cover" in html
    assert 'id="deck-menu-btn"' in html and 'id="sidebar-backdrop"' in html
    assert "register('/sw.js'" in html
    tabs = re.search(r'<nav class="deck-tabbar".*?</nav>', html, re.S)
    assert tabs is not None
    known = {"home", "courses", "knowledge", "flashcards"}
    assert set(re.findall(r'data-nav="([^"]+)"', tabs.group(0))) == known


def test_no_leftover_cerberus_pwa_files():
    assert not (STATIC / "manifest.json").exists()


@pytest.mark.parametrize("allowed,login,status", [
    ("", "anyone@example.com", 200),                 # no allow-list: tailnet is the boundary
    ("me@example.com", "me@example.com", 200),
    ("me@example.com", "ME@example.com", 200),        # case-insensitive
    ("me@example.com", "someone@example.com", 403),
    ("me@example.com", None, 200),                    # local desktop window, no header
])
def test_tailnet_allowlist(client, monkeypatch, allowed, login, status):
    monkeypatch.setenv("CYBERDECK_ALLOWED_USERS", allowed)
    headers = {"Tailscale-User-Login": login} if login else {}
    assert client.get("/api/health", headers=headers).status_code == status


def test_server_uses_shared_data_dir(tmp_path, monkeypatch):
    import os

    import datapaths
    monkeypatch.setenv("CYBERDECK_DATA", str(tmp_path))
    monkeypatch.delenv("CYBERDECK_FLASHCARDS", raising=False)
    datapaths.persist_data_env(force=True)
    assert os.environ["CYBERDECK_FLASHCARDS"] == str(tmp_path / "flashcards.json")


def test_serve_defaults_to_loopback_desktop_port():
    import serve
    assert serve.DEFAULT_PORT == 8137
    src = Path(serve.__file__).read_text()
    assert 'default="127.0.0.1"' in src
