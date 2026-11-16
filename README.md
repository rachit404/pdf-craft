# PDF Craft

A private, self-hosted PDF toolbox. Everything the popular online PDF sites do
runs on your own machine, so your documents never leave it.

**Organize** merge, split, extract, reorder, delete, duplicate, rotate, compress
**Edit** add text, images, watermarks, page numbers, headers and footers, backgrounds, crop
**Convert** PDF to images, Word, Excel, PowerPoint and text; images, Word and PowerPoint to PDF
**Protect** password protect, unlock, redact (areas or words), sanitize
**Also** PDF details, recent-files history, automatic file clean-up, optional sign-in

Stack: FastAPI, PyMuPDF, pikepdf, pypdf and ReportLab on the backend; Next.js
(React, TypeScript, Tailwind) on the front end; SQLite for the file history.
Optional LibreOffice for faithful Word/PowerPoint conversion.

## Install on a Linux server

```bash
git clone https://github.com/rachit404/pdf-craft.git && cd pdf-craft
sudo bash deploy/install.sh --host pdf.home.lan
```

This sets up HTTPS, a sign-in password and two locked-down systemd services.
Full guide, including running it by hand: **[docs/self-hosting.md](docs/self-hosting.md)**.

## Develop locally

Backend (Windows CMD):

```bat
cd services\api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt -c constraints.txt
python -m pytest -q
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Front end:

```bat
cd apps\web
npm ci
npm run dev
```

Open http://localhost:3000. On Linux/macOS use `. .venv/bin/activate`.

## Layout

```
services/api/   FastAPI app (routers -> services -> PDF engines), tests
apps/web/       Next.js app (tool registry, one screen per tool)
deploy/         install, update, password and self-test scripts; systemd and Caddy files
docs/           self-hosting guide
CLAUDE/         project notes used while building (roadmap, decisions)
```

## Privacy

No analytics, no remote fonts or scripts, no update checks. In the Linux
deployment the services are blocked from the internet at operating-system level.
Uploaded files and results are deleted automatically (24 hours by default) and
can be wiped at once from the *Recent files* page.

## Licences

PyMuPDF is AGPL-3.0 (commercial licence available from Artifex). pikepdf and
LibreOffice are MPL-2.0. Review these before offering the software to others.
