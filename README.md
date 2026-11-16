# PDF Craft

**A private, self-hosted PDF toolbox.** Merge, edit, convert, protect and redact
PDF documents with a modern web interface, entirely on your own hardware.
Nothing is uploaded to a third-party service, and the production services are
blocked from reaching the internet at the operating-system level.

- 28 tools in one interface, covering what online PDF sites offer
- Runs on a single Linux machine; no Docker, no cloud account, no subscription
- Optional password sign-in, HTTPS, automatic deletion of uploaded files
- Three built-in themes (Cool Light by default, Cool Dark, Warm Paper), match-system, and a custom theme creator
- FastAPI backend, Next.js front end, SQLite; no external services

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Self-hosting on Linux](#self-hosting-on-linux)
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
| **Organize** | Merge, split, extract pages, reorder, delete pages, duplicate pages, rotate, compress (lossless or image-reducing), PDF details and metadata |
| **Edit** | Add text, add images, watermark, page numbers, header and footer, background colour, crop. Placement is by clicking on a live page preview |
| **Convert** | PDF to images (PNG/JPEG), images to PDF, PDF to Word, PDF to Excel, PDF to PowerPoint, Word to PDF, PowerPoint to PDF, PDF to text |
| **Protect** | Password protection (AES-256) with permissions, unlock, permanent redaction (drawn areas and search terms), sanitize (metadata, scripts, attachments, comments, links, hidden text) |
| **Workspace** | A file library with versions, re-download and delete, one-click "delete all my files", automatic clean-up after a retention period, Ctrl K command palette, themes, optional sign-in |

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

## Quick start

### Run it on a Linux server (recommended)

Prerequisites: Ubuntu 24.04, Debian 12 or Debian 13, with Node.js 20.9 or newer
(the installer tells you how to get it if it is missing).

```bash
git clone https://github.com/rachit404/pdf-craft.git
cd pdf-craft
sudo bash deploy/install.sh --host pdf.home.lan --with-libreoffice
```

Use the name or IP address you will type in the browser. The installer asks you
to choose a password, then sets up the services and HTTPS. Verify the result with
the built-in self-test:

```bash
/opt/pdf-craft/venv/bin/python deploy/smoke_test.py https://pdf.home.lan --insecure --password 'your-password'
```

The full guide, including trusting the HTTPS certificate, updating, changing the
password, and running everything by hand, is in
**[docs/self-hosting.md](docs/self-hosting.md)**.

### Try it on your own computer

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

## Self-hosting on Linux

`deploy/install.sh` performs a complete, repeatable installation:

| Step | Result |
|---|---|
| Packages | Python venv support, rsync, curl, Caddy (and optionally LibreOffice) via `apt` |
| Accounts and folders | System user `pdfcraft`; program in `/opt/pdf-craft` (root-owned); data in `/var/lib/pdf-craft`; settings in `/etc/pdf-craft` |
| Backend | Python virtual environment installed from pinned versions (`constraints.txt`) |
| Web app | Built once into a small standalone Node server |
| Services | `pdf-craft-api` and `pdf-craft-web` (systemd), hardened and restricted to the local machine |
| HTTPS | Caddy reverse proxy with an automatic certificate (private CA for LAN names and IPs, Let's Encrypt for public domains) |

Day-to-day commands:

| Task | Command |
|---|---|
| Update | `git pull && sudo bash deploy/install.sh` (previous options are remembered) |
| Change the password | `sudo bash deploy/set-password.sh` |
| View logs | `sudo journalctl -u pdf-craft-api -f` |
| Restart | `sudo systemctl restart pdf-craft-api pdf-craft-web` |
| Uninstall | `sudo bash deploy/uninstall.sh` (add `--purge` to delete data too) |

Installer options include `--tls auto` (public domain), `--no-proxy` (plain HTTP on
a trusted network), `--with-libreoffice` and `--allow-no-auth`. Run
`bash deploy/install.sh --help` for the list.

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
| Deployment | systemd, Caddy, shell scripts (no containers) |

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
| `/files` | File library: `GET /files`, `POST /files` (any supported file), `/{name}/versions`, `/family`, `/download`, `DELETE /files/{name}` |
| `/registry`, `/flows` | `GET /registry/operations` (every tool with a settings schema); `POST /flows/validate`, `POST /flows/runs`, `GET /flows/runs/{id}` run chained steps without downloading in between |
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
  default) and can be wiped immediately from the *Recent files* page.
- **Input validation.** Uploads are size-limited and checked by content; Office
  documents must be real OOXML archives; output and upload names are sanitised.
- **Recommended exposure.** Keep it on a private network or behind a VPN
  (WireGuard, Tailscale). Do not publish it directly to the internet.

PDF permission flags (print, copy, edit) are honoured by standard viewers but
are advisory: the password is what protects the content.

## Testing

```bash
cd services/api && . .venv/bin/activate
python -m pytest -q                      # 255 backend tests
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
- Page previews show pages unrotated, and edit coordinates follow that view.

## Roadmap

**Version 1 (current):** the standard PDF toolbox above, hardened for private
self-hosting.

**Version 2 (planned, separate services behind the same API):** OCR for scanned
PDFs, summarisation, chat with a document and question answering, and intelligent
extraction, all running locally to keep the privacy guarantees.

Possible improvements: page thumbnails in the older page-organising tools,
upload progress indicators, drag-and-drop page reordering, a dark theme, and
editing PDF metadata.

## Project layout

```
services/api/          FastAPI application
  app/api/routers/       HTTP endpoints (uploads, operations, conversions, security, jobs, auth)
  app/services/          storage, history, retention, orchestration
  app/engines/pdf/       PDF engines (merge/split/edit, convert, security, compress, render, LibreOffice)
  app/schemas/           request and response models
  tests/                 pytest suite
apps/web/              Next.js application
  src/components/studio/      the Studio: page grid, tool panels, versions
  src/components/flows/       the Flows canvas: chain tools without downloading in between
  src/lib/               API client and the tool list
deploy/                install, update, password and uninstall scripts; systemd units; Caddy template; self-test
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
