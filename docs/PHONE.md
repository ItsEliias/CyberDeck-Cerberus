# CyberDeck on your phone

CyberDeck installs on a phone as its own app: home-screen icon, full screen,
bottom tabs (Home, Courses, Notes, Cards, More) and the full sidebar behind the
menu button. It reaches your CyberDeck privately over
[Tailscale](https://tailscale.com); nothing is opened to the internet.

The app saves only its layout on the phone. Notes, flashcards, targets and the
credential vault always load live from CyberDeck and are never stored in the
phone's browser cache. The Terminal module stays desktop-only.

## 1. Pick where CyberDeck runs

**Option A: your laptop (quickest).** Whenever the CyberDeck desktop app is
open, it listens on `127.0.0.1:8137`. Share that and your phone sees the same
data as the laptop. The phone only works while the laptop is awake with the
app open.

**Option B: an always-on machine (recommended).** Run CyberDeck without a
window on the homelab so the phone always works:

```bash
sudo useradd --system --create-home --home-dir /var/lib/cyberdeck cyberdeck
sudo git clone https://github.com/ItsEliias/CyberDeck-Cerberus.git /opt/cyberdeck
cd /opt/cyberdeck
sudo python3 -m venv .venv
sudo .venv/bin/pip install -r requirements.txt
sudo cp deploy/cyberdeck.service /etc/systemd/system/
sudo systemctl enable --now cyberdeck
curl -s http://127.0.0.1:8137/api/health
```

Edit `CYBERDECK_VAULT` in the service file to point at your notes (a synced
copy of your Obsidian vault). On the laptop, use the installed CyberDeck
app from the homelab address too, so everything lives in one place.

To run it by hand instead of as a service: `python app/serve.py`.

## 2. Share it on your tailnet

Install Tailscale on that machine and your phone, signed in to the same
account. Then, on the machine running CyberDeck:

```bash
sudo tailscale serve --bg --https=443 8137
```

If another app on the same machine already uses 443 (for example Cipher), use
one of Tailscale's other HTTPS ports instead:

```bash
sudo tailscale serve --bg --https=10000 8137
```

`tailscale serve status` shows the address, e.g.
`https://homelab.your-tailnet.ts.net` (add `:10000` if you used that port).

Optional lock-down: set `CYBERDECK_ALLOWED_USERS=you@example.com` and only
that tailnet login can connect through Tailscale. The desktop window on the
same machine is unaffected.

## 3. Install on the phone

Open the address on the phone:

- **Android (Chrome):** menu > *Install app* (or *Add to Home screen*).
- **iPhone (Safari):** Share > *Add to Home Screen*.

To stop sharing: `sudo tailscale serve --https=443 off` (or `=10000`).
