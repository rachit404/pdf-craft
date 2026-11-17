# PDF Craft

**A private, self-hosted PDF toolbox.** Merge, edit, convert, protect and redact
PDF documents with a modern web interface, entirely on your own hardware.
Nothing is uploaded to a third-party service, and the production services are
blocked from reaching the internet at the operating-system level.

- 35 tools in one interface, covering what online PDF sites offer and more
- A **Studio** where every edit becomes a new version of your file, with undo, page thumbnails and live previews
- **Flows**: chain tools on a canvas so each step hands its result to the next, with no downloading in between
- Runs on a single Linux machine, with or without Docker; no cloud account, no subscription
- Optional password sign-in, HTTPS, automatic deletion of uploaded files
- Four built-in themes (Aurora by default, Cool Light, Cool Dark, Warm Paper), match-system, and a custom theme creator
- FastAPI backend, Next.js front end, SQLite; no external services

## Self-host it

PDF Craft is built to live on your own Linux machine (a spare PC, a home server or a small VM).
Two services run behind Caddy, which provides HTTPS. Documents never leave the machine.

**You need:** Ubuntu 24.04, Debian 12 or Debian 13 (or any systemd Linux with Python 3.11+),
Node.js 20.9 or newer, 2 CPU cores and 2 GB of RAM. Internet access is needed only while installing.

**1. Get the code**

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/rachit404/pdf-craft.git
cd pdf-craft
```

**2. Install.** Use the name or IP address you will type in the browser
(for example `pdf.home.lan` or `192.168.1.20`). `--with-libreoffice` is optional and gives accurate Word and PowerPoint conversion.

```bash
sudo bash deploy/install.sh --host pdf.home.lan --with-libreoffice
```

The installer asks you to choose a password, then installs the packages, builds the web app,
creates the two systemd services and sets up HTTPS. It takes a few minutes the first time.
If Node.js is missing or too old it tells you how to install it.

**3. Check it works**

```bash
/opt/pdf-craft/venv/bin/python deploy/smoke_test.py https://pdf.home.lan --insecure --password 'your-password'
```

Then open `https://pdf.home.lan` and sign in. Your browser will warn about the certificate until you trust
the private certificate authority; the steps are in the self-hosting guide.

**Everyday commands**

| Task | Command |
|---|---|
| Update | `cd pdf-craft && git pull && sudo bash deploy/install.sh` (earlier options are remembered) |
| Change the password | `sudo bash deploy/set-password.sh` |
| View logs | `sudo journalctl -u pdf-craft-api -f` |
| Restart | `sudo systemctl restart pdf-craft-api pdf-craft-web` |
| Uninstall | `sudo bash deploy/uninstall.sh` (add `--purge` to delete the data too) |

**Where things live:** the program in `/opt/pdf-craft`, files and history in `/var/lib/pdf-craft`, settings in
`/etc/pdf-craft/pdf-craft.env`. Edit that file and restart the services to change a setting; see
[Configuration](#configuration). Other install options (`--tls auto` for a public domain, `--no-proxy` for plain HTTP on a
trusted network, `--allow-no-auth`) are listed by `bash deploy/install.sh --help`.

Keep it on a private network or behind a VPN such as WireGuard or Tailscale rather than publishing it to the internet.
The full guide, including trusting the certificate, running everything by hand and checking that it is private, is
**[docs/self-hosting.md](docs/self-hosting.md)**.

### Or with Docker

If you prefer containers, `docker-compose.yml` runs the same three parts: the API, the web app and Caddy for HTTPS.
It needs Docker Engine with the Compose plugin (Linux, or Docker Desktop on Windows and macOS).

```bash
git clone https://github.com/rachit404/pdf-craft.git
cd pdf-craft
cp .env.example .env
```

Edit `.env`:

- `SITE_ADDRESS`: the name or IP address you will type in the browser.
- `TLS_MODE`: leave `internal` for a private certificate on a LAN, or put your email address to get a
  Let's Encrypt certificate for a public domain.
- `PDF_CRAFT_PASSWORD_HASH`: make it with `docker compose run --rm api python -m app.auth` (it asks for a password and
  prints the hash). Paste it between the single quotes.
- `PDF_CRAFT_SECRET`: any long random string, for example from `openssl rand -hex 32`.
- `HTTP_PORT` and `HTTPS_PORT`: the ports to publish (default 80 and 443). Change them if those are taken, then browse to
  `https://<SITE_ADDRESS>:<HTTPS_PORT>`; plain HTTP requests are redirected there.
- `WITH_LIBREOFFICE=1` builds the API image with LibreOffice for accurate Word and PowerPoint conversion
  (about 600 MB more).

Then start it:

```bash
docker compose up -d --build
```

Open `https://<SITE_ADDRESS>`. Useful commands:

| Task | Command |
|---|---|
| Update | `git pull && docker compose up -d --build` |
| View logs | `docker compose logs -f api` |
| Restart | `docker compose restart` |
| Stop | `docker compose down` (your files stay in the `data` volume) |
| Delete everything including files | `docker compose down -v` |

The API and the web app sit on a private Docker network with no route to the internet; only Caddy is reachable, on ports
80 and 443. They run as unprivileged users with a read-only file system and no extra privileges, and files and history are
kept in the `data` volume. Every setting in [Configuration](#configuration) can be added to `.env` or to the `api`
service in `docker-compose.yml`.

With `TLS_MODE=internal` the certificate comes from Caddy's own private authority, so your browser will warn until you trust it.
Export the authority's certificate and install it on your devices:

```bash
docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt ./pdf-craft-root.crt
```

A compose file does not replace the Linux install: the systemd route above also blocks internet access at the operating-system
level and needs no Docker. Choose whichever you already run. The compose setup has been built and run with Docker Engine 29
(without LibreOffice): all three containers become healthy, sign-in, upload, operations, search and ZIP download work through
HTTPS, the API and web containers cannot reach the internet, run as an unprivileged user on a read-only file system, and files
survive a restart. The `WITH_LIBREOFFICE=1` image has not been built yet. Check your own setup with `docker compose ps`.

## Contents

- [Self-host it](#self-host-it)
- [Or with Docker](#or-with-docker)
- [Features](#features)
- [Try it on your computer](#try-it-on-your-computer)
- [Local development](#local-development)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [API overview](#api-overview)
- [Security and privacy](#security-and-privacy)
- [Testing](#testing)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Project layout](#project-layout)
- [Third-party licences](#third-party-licences)

## Features

| Category | Tools |
|---|---|
| **Organize** | Merge, split (by ranges, every N pages, or at blank pages), extract pages, reorder by dragging thumbnails, delete, duplicate, rotate, remove blank pages, compress (lossless, image-reducing, or to a size you choose), compare two PDFs, PDF details and metadata |
| **Edit** | Add text, images and signatures (draw one on the pad), stamps (APPROVED, DRAFT, CONFIDENTIAL and your own), watermark, page numbers, header and footer with `{page}`, `{pages}` and `{date}`, background colour, crop, highlight, underline, box and note annotations, fill and flatten forms, greyscale, straighten tilted scans. Placement is by clicking on a live page |
| **Convert** | PDF to images (PNG/JPEG), images to PDF, PDF to Word, PDF to Excel, PDF to PowerPoint, Word to PDF, PowerPoint to PDF, PDF to text |
| **Protect** | Password protection (AES-256) with permissions, unlock, permanent redaction (drawn areas and search terms), sanitize (metadata, scripts, attachments, comments, links, hidden text), document details editor |
| **Studio** | One workspace per document: page grid, large page view, tool panels, a versions bar with undo and redo (Ctrl+Z, Ctrl+Y), expiry shown with "Delete now", and "Save as flow" to repeat your edits on other files |
| **Flows** | A canvas for chaining any tool: drag steps in, join them, click a step to change its settings and preview what goes in and what it makes, run the whole flow or only up to a step, run it on many files at once and download the results as a ZIP. Flows can be saved, exported and imported, or started from templates |
| **Files** | A library with versions, search inside your PDFs (full-text index), merge and convert on upload, ZIP download of a selection, automatic clean-up after a retention period, one-click "delete all my files" |
| **Interface** | Top bar with Ctrl K search, one sidebar that is either open (icons with names and the page's own list) or collapsed to icons, four themes plus a custom theme creator, optional sign-in |

Highlights:

- **Real redaction.** Redacted text, images and vector graphics are removed from
  the file, not covered with a black box. Verified by searching the raw PDF
  streams for the text.
- **Faithful conversions.** Word and PowerPoint to PDF use LibreOffice when it is
  installed and fall back to a basic converter when it is not (the interface says
  which one is in use). JPEG images are embedded without re-encoding.
- **Safe uploads.** Files are checked by content and size, not by extension;
  Office files are validated as genuine documents; stored names are random and
  path traversal is rejected.
- **No lock-in.** Results are standard PDF, DOCX, XLSX, PPTX, ZIP and PNG/JPEG files.

## Try it on your computer

Two terminals, no installation of system services (Windows CMD shown; see
[Local development](#local-development) for Linux and macOS):

```bat
cd services\api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt -c constraints.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bat
cd apps\web
npm ci
npm run dev
```

Open <http://localhost:3000>.

## Local development

Requirements: Python 3.11+ (3.12 recommended) and Node.js 20.9+.

**Backend**

```bash
cd services/api
python3 -m venv .venv && . .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt -c constraints.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Front end**

```bash
cd apps/web
npm ci
npm run dev                                           # http://localhost:3000
```

The development server forwards `/api/backend/*` to `http://127.0.0.1:8000`. To
use a different backend address, set `API_INTERNAL_URL` before starting it.
Interactive API documentation is served at <http://127.0.0.1:8000/docs> while
sign-in is disabled.

**Optional: LibreOffice** for accurate Word/PowerPoint conversion. Install it
(Windows: the standard installer; Linux: `libreoffice-writer libreoffice-impress`)
and the backend finds it automatically, or point `PDF_CRAFT_SOFFICE` at
`soffice`.

## Configuration

All settings are environment variables and all are optional. In a deployed
installation they live in `/etc/pdf-craft/pdf-craft.env`; restart the services
after editing.

| Variable | Default | Purpose |
|---|---|---|
| `PDF_CRAFT_STORAGE_DIR` | `services/api/data/files` | Where uploads and results are stored |
| `PDF_CRAFT_DATABASE_URL` | local SQLite file | SQLAlchemy URL for the history database |
| `PDF_CRAFT_RETENTION_HOURS` | `24` | Delete stored files after this many hours; `0` keeps them |
| `PDF_CRAFT_MAX_UPLOAD_MB` | `25` | Largest PDF or Office upload |
| `PDF_CRAFT_MAX_IMAGE_MB` | `10` | Largest image upload |
| `PDF_CRAFT_OFFICE_WORKERS` | `2` | Concurrent LibreOffice conversions |
| `PDF_CRAFT_OFFICE_TIMEOUT` | `120` | Seconds before a conversion is stopped |
| `PDF_CRAFT_SOFFICE` | auto-detect | Path to the `soffice` executable |
| `PDF_CRAFT_FLOW_CACHE` | `1` | A flow step run again on identical files and settings reuses its earlier result; `0` turns this off |
| `PDF_CRAFT_FLOW_MAX_ITEMS`, `PDF_CRAFT_FLOW_TIMEOUT` | `50`, `600` | Most files one flow step may handle, and seconds a whole run may take |
| `PDF_CRAFT_PASSWORD_HASH` | unset | Turns sign-in on. Create it with `python -m app.auth` |
| `PDF_CRAFT_SECRET` | unset | Random string (16+ characters) that signs session cookies; required with a password |
| `PDF_CRAFT_SESSION_HOURS` | `168` | Length of a sign-in |
| `PDF_CRAFT_COOKIE_SECURE` | `0` | Set to `1` when served over HTTPS |
| `API_INTERNAL_URL` | `http://127.0.0.1:8000` | Web app build setting: where `/api/backend/*` is forwarded |
| `HOSTNAME`, `PORT` | `127.0.0.1`, `3000` | Where the production web server listens |

## Architecture

```
 browser ── HTTPS ──▶ Caddy ─┬─ /api/backend/* ─▶ FastAPI  (127.0.0.1:8000)
                             └─ everything else ─▶ Next.js (127.0.0.1:3000)

 FastAPI:   routers  ──▶  services  ──▶  PDF engines
            (HTTP)       (storage,        (PyMuPDF, pikepdf, pypdf,
                          history,         ReportLab, pdf2docx, LibreOffice)
                          retention)
 Storage:   uploads/ and outputs/ (random names, auto-deleted)  +  SQLite history
```

| Layer | Technology |
|---|---|
| Front end | Next.js 16, React 19, TypeScript, Tailwind CSS 4, lucide-react |
| Backend | Python 3.11+, FastAPI, SQLAlchemy, SQLite |
| PDF engines | PyMuPDF (rendering, redaction, compression, sanitizing), pikepdf/QPDF (lossless compression), pypdf (page operations, encryption), ReportLab (overlays), pdf2docx, pdfplumber, python-docx, openpyxl, python-pptx |
| Optional | LibreOffice (Word/PowerPoint to PDF) |
| Deployment | systemd, Caddy and shell scripts, or Docker Compose |

Design decisions:

- One modular backend and one front end; no microservices for standard PDF work.
- Editing happens in one Studio workspace: every edit becomes a new version of the file, with undo,
  so nothing is downloaded and uploaded again. Option forms are generated from the backend operation registry.
- Every successful operation is recorded in the history automatically
  (`services/api/app/api/recording.py`), so new endpoints need no extra code.
- Long-running conversions run off the event loop and are limited in number.

## API overview

All routes are JSON over HTTP, served under `/api/backend` when going through the
web app or Caddy. Uploaded files are referenced by the random name returned from
the upload call, and results are fetched from `/outputs/{name}`.

| Group | Examples |
|---|---|
| `/uploads` | `POST /uploads` (PDF), `POST /uploads/image`, `GET /uploads/{f}/info`, `/text`, `/pages/{n}/preview`, `POST /uploads/{f}/compress` |
| `/operations` | `POST /operations/merge`, `/{f}/split`, `extract-pages`, `reorder-pages`, `delete-pages`, `duplicate-pages`, `rotate`, `watermark`, `page-numbers`, `header-footer`, `background`, `crop`, `add-text`, `add-image` |
| `/conversions` | `/{f}/to-images`, `/{f}/to-docx`, `/{f}/to-xlsx`, `/{f}/to-pptx`, `/images-to-pdf`, `/docx-to-pdf`, `/pptx-to-pdf`, `/capabilities` |
| `/security` | `/{f}/protect`, `/unlock`, `/redact`, `/sanitize` |
| `/files` | File library: `GET /files`, `POST /files` (any supported file), `/search?q=`, `POST /files/zip`, `/{name}/versions`, `/family`, `/download`, `DELETE /files/{name}` |
| `/tools` | Power tools: `/{f}/remove-blank-pages`, `flatten-forms`, `fill-form`, `form-fields`, `edit-metadata`, `compress-to-target`, `stamp`, `to-grayscale`, `annotate`, `deskew`, and `POST /tools/compare` |
| `/registry`, `/flows` | `GET /registry/operations` (every tool with a settings schema); `POST /flows/validate`, `POST /flows/runs`, `GET /flows/runs/{id}` run chained steps without downloading in between; `/flows/saved` keeps flows |
| `/jobs` | History: `GET /jobs`, `DELETE /jobs/{id}`, `DELETE /jobs` (delete everything), `GET /jobs/retention` |
| `/auth` | `GET /auth/status`, `POST /auth/login`, `POST /auth/logout` |
| `/outputs` | `GET /outputs/{name}?name=report.pdf` downloads a result under a friendly file name |

Example (backend directly, sign-in disabled):

```bash
f=$(curl -s -F "file=@contract.pdf;type=application/pdf" http://127.0.0.1:8000/uploads | python -c "import sys,json; print(json.load(sys.stdin)['stored_filename'])")
curl -s -X POST -H "Content-Type: application/json" -d '{"pages":[1,2]}' http://127.0.0.1:8000/operations/$f/extract-pages
# -> {"output_filename": "....pdf", ...}  then GET /outputs/<output_filename>
```

## Security and privacy

- **Local processing.** Documents never leave your server. There are no
  analytics, remote fonts, scripts, update checks or telemetry in the code, and
  web-server access logs are off, so file names are not logged.
- **Network isolation.** In the Linux deployment both services run with
  `IPAddressDeny=any` and `IPAddressAllow=localhost`, so the operating system
  prevents them from opening connections to the internet.
- **Containment.** Each service runs as an unprivileged account, with a
  read-only system, no new privileges, private temp space, and write access only to
  `/var/lib/pdf-craft`.
- **Sign-in.** One shared password, stored as a salted scrypt hash, with signed
  HttpOnly session cookies, a limit on failed attempts, and the API schema hidden
  from anonymous visitors.
- **Data retention.** Uploads and results are deleted automatically (24 hours by
  default) and can be wiped immediately from the *Files* page or with "Delete now" in the Studio.
- **Input validation.** Uploads are size-limited and checked by content; Office
  documents must be real OOXML archives; output and upload names are sanitised.
- **Recommended exposure.** Keep it on a private network or behind a VPN
  (WireGuard, Tailscale). Do not publish it directly to the internet.

PDF permission flags (print, copy, edit) are honoured by standard viewers but
are advisory: the password is what protects the content.

## Testing

```bash
cd services/api && . .venv/bin/activate
python -m pytest -q                      # 291 backend tests
cd ../../apps/web && npm run lint && npm run build
```

The backend tests open the produced PDFs and check their content (text present,
text removed, page order, image placement, encryption flags). The self-test script
exercises a running installation end to end:

```bash
python deploy/smoke_test.py http://127.0.0.1:8000 --api-prefix ""      # add --password when sign-in is on
```

## Known limitations

- Added text and headers use built-in PDF fonts, so they support Latin
  characters only.
- Without LibreOffice, Word and PowerPoint to PDF keep text and simple tables
  only. Install LibreOffice for full fidelity.
- PDF to Word and PDF to Excel are best-effort reconstructions; complex layouts
  and tables may differ from the original. PDF to PowerPoint places each page as
  a picture.
- Scanned documents have no selectable text, so text extraction and
  search-based redaction cannot read them (draw redaction boxes by hand).
  Text recognition (OCR) is planned.
- Authentication is a single shared password; there are no per-user accounts.
- Page previews in the large view show pages unrotated, and edit coordinates follow that view.
- Word, PowerPoint and Excel results cannot be previewed in the browser; the preview offers a download instead.
- Search reads the text layer, so scanned pages are not searchable until text recognition (OCR) is added.

## Roadmap

**Version 1 (current):** the standard PDF toolbox above, hardened for private
self-hosting.

**Version 2 (planned, separate services behind the same API):** OCR for scanned
PDFs, summarisation, chat with a document and question answering, and intelligent
extraction, all running locally to keep the privacy guarantees.

Possible improvements: freehand drawing annotations, a visual (pixel) comparison of two PDFs, hot folders and
scheduled flows, and text recognition for scans.

## Project layout

```
services/api/          FastAPI application
  app/api/routers/       HTTP endpoints (uploads, operations, tools, conversions, security, files, flows, jobs, auth)
  app/registry/          the catalogue of operations every screen and flow is built from
  app/flows/             flow validation, execution, saved runs and the step cache
  app/services/          storage, history, retention, search index, orchestration
  app/engines/pdf/       PDF engines (merge/split/edit, power tools, convert, security, compress, render, LibreOffice)
  app/schemas/           request and response models
  tests/                 pytest suite
apps/web/              Next.js application
  src/components/studio/      the Studio: page grid, tool panels, versions
  src/components/flows/       the Flows canvas: chain tools without downloading in between
  src/components/layout/      top bar, sidebar and Ctrl K palette
  src/components/ui/          buttons, modal, logo and other shared controls
  src/lib/               API client, tool list, themes and flow helpers
deploy/                install, update, password and uninstall scripts; systemd units; Caddy templates; self-test
docker-compose.yml     Docker Compose setup (API, web app, Caddy); settings in .env.example
docs/                  self-hosting guide
CLAUDE/                working notes: roadmap, decisions and current state of the project
```

## Third-party licences

This repository does not yet include a licence file for PDF Craft's own code;
add one before sharing the project. Notable dependencies:

| Component | Licence | Notes |
|---|---|---|
| PyMuPDF | AGPL-3.0 | Commercial licence available from Artifex. Fine for private use; review before offering the software to others |
| pikepdf / QPDF | MPL-2.0 / Apache-2.0 | |
| LibreOffice (optional) | MPL-2.0 | Installed separately, not bundled |
| FastAPI, Next.js, React | MIT | |
