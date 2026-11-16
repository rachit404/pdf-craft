# Self-hosting PDF Craft on Linux

PDF Craft runs entirely on your own machine. Documents are processed locally,
the services have no access to the internet while running, and nothing is sent
to any outside website.

```
 browser ──HTTPS──▶ Caddy (port 443)
                      ├── /api/backend/*  ──▶ API  (FastAPI, 127.0.0.1:8000)
                      └── everything else ──▶ Web  (Next.js,  127.0.0.1:3000)
                                              files + history: /var/lib/pdf-craft
```

Two commands do the whole installation. This guide also covers running it by
hand, updating, changing the password, and checking that it is private.

## 1. Requirements

| | |
|---|---|
| System | Ubuntu 24.04, Debian 12 or Debian 13 (any systemd Linux with Python 3.11+ works, see 7) |
| Hardware | 2 CPU cores and 2 GB RAM are enough; 4 GB is comfortable with LibreOffice |
| Software | Python 3.11+, Node.js 20.9+ (the installer checks both) |
| Network | Internet **only during installation** (to download packages). Port 443 for users |

## 2. Install

On the Linux machine:

```bash
sudo apt-get update && sudo apt-get install -y git
```

Check Node.js. If `node -v` prints a version below 20.9, or `command not found`,
install a current one (this is the official NodeSource method; read the script
before running it):

```bash
sudo apt-get install -y ca-certificates curl gnupg
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
less /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh
sudo apt-get install -y nodejs
```

Get the code and install. Replace `pdf.home.lan` with the name or IP address you
will type in the browser (for example `192.168.1.20`):

```bash
git clone https://github.com/rachit404/pdf-craft.git
cd pdf-craft
git checkout claude-takeover        # skip once this branch is merged into main
sudo bash deploy/install.sh --host pdf.home.lan
```

The installer asks you to choose a sign-in password, then installs the
packages it needs, builds the web app, creates two systemd services and
configures Caddy for HTTPS. It takes a few minutes the first time.

Useful options:

| Option | Meaning |
|---|---|
| `--with-libreoffice` | Install LibreOffice so Word and PowerPoint convert to PDF with full formatting. Without it those two tools use a basic text-only converter (the app tells you). Adds roughly 400 MB |
| `--tls auto` | Use a real Let's Encrypt certificate for a public domain (ports 80 and 443 must be reachable from the internet). Default is `--tls internal`, see 3 |
| `--no-proxy --port 3000` | No Caddy and no HTTPS: the app listens on port 3000 on all interfaces. Only for a network you fully trust, because traffic is not encrypted |
| `--allow-no-auth` | Skip the password. Not recommended |

Open the firewall for HTTPS if you use one (Ubuntu):

```bash
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp     # only needed with --tls auto
```

## 3. First visit and the certificate warning

With the default `--tls internal`, Caddy creates its own small certificate
authority, so browsers warn about the certificate until you trust it once per
device. Copy this file from the server to each device:

```
/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt
```

and add it as a trusted root certificate (Windows: double-click, *Install
Certificate*, *Local Machine*, *Trusted Root Certification Authorities*;
macOS: Keychain Access, *Always Trust*; Linux: `sudo cp root.crt
/usr/local/share/ca-certificates/pdfcraft.crt && sudo update-ca-certificates`;
Firefox keeps its own store under *Settings, Certificates*).

Then open `https://pdf.home.lan` and sign in.

## 4. Check that everything works

The self-test runs every operation on small generated files, downloads each
result and opens it. Replace the password with yours:

```bash
/opt/pdf-craft/venv/bin/python deploy/smoke_test.py https://pdf.home.lan --insecure --password 'your-password'
```

(`--insecure` accepts the self-made certificate; leave it out once you trust
it.) Expected last line: every check passed (for example `33 of 33 checks passed.`). It removes its own files
from the history afterwards.

Check that the services cannot reach the internet and that only HTTPS is
exposed:

```bash
systemctl show pdf-craft-api pdf-craft-web -p IPAddressDeny -p IPAddressAllow
sudo ss -tlnp | grep -E ':443|:8000|:3000'
```

You should see `IPAddressDeny` covering `0.0.0.0/0` and `::/0`, `IPAddressAllow`
listing only `127.0.0.0/8` and `::1`, and ports 8000 and 3000 listening on
`127.0.0.1` only. The operating system enforces this, so the services cannot
open connections to the internet whatever the software tries to do.

## 5. Daily use and maintenance

| Task | Command |
|---|---|
| Status | `systemctl status pdf-craft-api pdf-craft-web caddy` |
| Logs | `sudo journalctl -u pdf-craft-api -f` (file names are never logged) |
| Restart | `sudo systemctl restart pdf-craft-api pdf-craft-web` |
| Change the password (signs everyone out) | `cd pdf-craft && sudo bash deploy/set-password.sh` |
| Update to a newer version | `cd pdf-craft && git pull && sudo bash deploy/install.sh` |
| Remove everything | `sudo bash deploy/uninstall.sh --purge` |

The update reuses your earlier options and keeps your settings and files.

### Settings

Edit `/etc/pdf-craft/pdf-craft.env`, then restart the services.

| Setting | Default | Meaning |
|---|---|---|
| `PDF_CRAFT_RETENTION_HOURS` | 24 | Uploads and results are deleted automatically after this many hours. `0` keeps them until you delete them in *Recent files* |
| `PDF_CRAFT_MAX_UPLOAD_MB` / `PDF_CRAFT_MAX_IMAGE_MB` | 25 / 10 | Largest PDF or Office file, and largest image. If you raise the first above 38, raise `max_size` in `/etc/caddy/Caddyfile` too |
| `PDF_CRAFT_OFFICE_WORKERS` / `PDF_CRAFT_OFFICE_TIMEOUT` | 2 / 120 | LibreOffice conversions at once, and seconds before one is stopped |
| `PDF_CRAFT_SESSION_HOURS` | 168 | How long a sign-in lasts |

### What is stored, and backups

Everything here is temporary by design: uploads and results expire after the
retention period, and *Delete all my files* in the app removes them at once. The
only things worth keeping are your settings: `sudo cp /etc/pdf-craft/pdf-craft.env ~/pdf-craft.env.backup`.
The history list lives in `/var/lib/pdf-craft/pdf_craft.db` (SQLite) and may be
copied the same way.

### Troubleshooting

| Problem | What to do |
|---|---|
| Installer says Node or Python is too old | Follow the message; Node steps are in 2 |
| Site unreachable | `sudo ufw status`; `systemctl status caddy pdf-craft-web`; use the exact name you gave `--host` |
| Backend does not start | `sudo journalctl -u pdf-craft-api -n 50`. A common cause is an empty `PDF_CRAFT_SECRET` in the settings file |
| "Basic conversion mode" banner on Word/PowerPoint to PDF | Run `sudo bash deploy/install.sh --with-libreoffice` |
| Upload fails with "exceeds the limit" | Raise `PDF_CRAFT_MAX_UPLOAD_MB` (see Settings) |
| Locked out after five wrong passwords | Wait five minutes, or `sudo systemctl restart pdf-craft-api` |
| Forgot the password | `sudo bash deploy/set-password.sh` |

## 6. Running by hand, without the installer

Use this to try the app from the clone, in development, or on a machine
without systemd. Nothing is installed system-wide.

Backend (terminal 1):

```bash
cd pdf-craft/services/api
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt -c constraints.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Web app, development mode with live reload (terminal 2):

```bash
cd pdf-craft/apps/web
npm ci
npm run dev                  # http://localhost:3000
```

Web app, production mode:

```bash
cd pdf-craft/apps/web
npm ci && npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
cd .next/standalone
HOSTNAME=127.0.0.1 PORT=3000 node server.js
```

Optional settings are plain environment variables placed before the command,
for example `PDF_CRAFT_RETENTION_HOURS=0 uvicorn ...`. To switch sign-in on:

```bash
cd pdf-craft/services/api && . .venv/bin/activate
export PDF_CRAFT_PASSWORD_HASH="$(python -m app.auth)"      # asks for the password
export PDF_CRAFT_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"
export PDF_CRAFT_COOKIE_SECURE=0                            # plain http on localhost
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Run the tests and the self-test:

```bash
cd pdf-craft/services/api && . .venv/bin/activate
pip install -r requirements-dev.txt -c constraints.txt
python -m pytest -q
python ../../deploy/smoke_test.py http://127.0.0.1:8000 --api-prefix ""     # add --password if sign-in is on
```

## 7. Other Linux distributions

The installer uses `apt`. On other systems (Fedora, Arch, openSUSE...) install
these yourself first: Python 3.11+ with `venv`, Node.js 20.9+, `rsync`, `curl`,
Caddy (optional) and, for faithful Word/PowerPoint conversion, LibreOffice
Writer and Impress. Then run the same `install.sh`; it skips `apt` when it is
missing. Use `--no-proxy` if you prefer to put your own reverse proxy in front
(proxy `/api/backend/*` to `127.0.0.1:8000` with that prefix removed, and
everything else to the web port).

## 8. Security notes

- **Sign-in:** one shared password, stored only as a salted hash, with a
  throttle on wrong guesses. Choose a long one: 12 or more characters.
- **Do not expose it directly to the internet.** For remote access use a VPN
  such as WireGuard or Tailscale, and keep it on your private network.
- **Encryption in transit:** use the default HTTPS setup. `--no-proxy` sends the
  password and documents unencrypted.
- **Isolation:** each service runs as its own unprivileged account, cannot write
  outside `/var/lib/pdf-craft`, and cannot open network connections to anything
  except the local machine.
- **No tracking:** the app has no analytics, no remote fonts and no update
  checks, and web server access logs are switched off.
- **Licences:** PDF Craft uses PyMuPDF (AGPL-3.0, commercial licence available
  from Artifex), pikepdf (MPL-2.0) and optionally LibreOffice (MPL-2.0). Private
  self-hosting is fine; review the licences before offering it to others.
