# PROJECT_STATE — verified 2026-11-16 (updated after Part 1 implementation)

> Part 1 (Edit workflows) is implemented on `claude-takeover`, uncommitted until the user verifies. Baseline now: **175 backend tests pass** (Part 5), lint clean, build OK.

## Git
- Local branches: `claude-takeover` (current), `main`. Both + `origin/main` + `origin/claude-takeover` = `5397490` (`feat(web): add watermark and page numbering workflows`).
- Working tree clean at assessment time. Work happens on `claude-takeover`; merge/push to `main` only when the user confirms a part.

## Baselines
- Backend: `services/api/.venv` exists. `.venv\Scripts\python.exe -m pytest -q` → **55 passed** (~15 s).
- Frontend: `npm run lint` clean; `npm run build` succeeds (Next 16.4.3, Turbopack). `node_modules` installed.

## Layout
```
services/api/app/
  main.py                      FastAPI app v0.2.0, includes 7 routers
  api/routers/                 health, jobs, uploads, outputs, operations, conversions, security
  engines/pdf/                 compressor, converter(556 loc), inspector, merger, operations(618), security, text_extractor
  services/                    pdf_service, conversion_service, security_service (thin wrappers; write to OUTPUT_DIR)
  schemas/                     pydantic request models (jobs, operations, conversions, security, uploads)
  db/                          SQLAlchemy + SQLite (models, session, repositories/jobs, init_db)
  storage.py                   STORAGE_ROOT (env PDF_CRAFT_STORAGE_DIR, default services/api/data/files), uploads/ outputs/, sanitize_filename
services/api/tests/            7 test files (55 tests)
apps/web/src/
  app/page.tsx                 dashboard; selectedTool -> if/else chain renders workflow, else "upcoming batch" placeholder
  lib/tools.ts                 tool registry (23 tools, ALL `available: true`)
  lib/api.ts                   API client (API_BASE="/api/backend"; next.config rewrites to backend)
  components/{dashboard,layout,workflows}/
```
Empty placeholder dirs at repo root: `.dist/ data/ docs/ infrastructure/ packages/`.

## Backend API map (verified in routers)
Storage model: client uploads → server returns stored filename (uuid-based) → operations reference that filename → result is written to `outputs/` → download via `GET /outputs/{name}` (allowed: pdf, zip, docx, xlsx, pptx).
- `GET /health`, `GET /health/database`
- `/jobs` GET list (adds `output_size_bytes`, null when the file is gone) · DELETE `{public_id}` (also deletes the output file) · `GET /jobs/retention` · `DELETE /jobs` (purge ALL stored files + history). Rows are written automatically for every successful response containing `output_filename` (routers use `route_class=RecordedRoute`); `operation` = last URL segment (e.g. `rotate`, `to-docx`, `compress`).
- `POST /uploads` (multipart `file`, PDF only, 25 MB, content-type + `%PDF-` check) · `POST /uploads/image` (png/jpg, 10 MB)
- `GET /uploads/{f}/info` · `GET /uploads/{f}/text` · `POST /uploads/{f}/compress`
- `POST /operations/merge` {filenames}
- `POST /operations/{f}/` `extract-pages`{pages} · `reorder-pages`{order} · `delete-pages`{pages} · `duplicate-pages`{pages} · `rotate`{pages,degrees} · `split`{ranges} · `watermark`{text,opacity,font_size} · `page-numbers`{position,font_size} · `header-footer`{header,footer} · `background`{red,green,blue} · `crop`{left,bottom,right,top} · `add-text`{text,x,y,font_size} · `add-image`{image_filename,x,y,width,height}
- `POST /conversions/{f}/to-images` {image_format,dpi} (moved in Part 2) · `GET /conversions/capabilities` → {office_engine: libreoffice|basic} · `GET /outputs/{f}?name=` friendly download name · `POST /conversions/images-to-pdf` {filenames} · `POST /conversions/{f}/to-docx|to-xlsx` · `/{f}/to-pptx` {dpi} · `POST /conversions/docx-to-pdf|pptx-to-pdf` (multipart, 25 MB, extension-checked)
- `POST /security/{f}/` `protect`{user_password,owner_password?,allow_*} (AES-256; random owner pw when none given so restrictions bind) · `unlock`{password="" ok} → {was_encrypted} · `redact`{regions[{page,x0,y0,x1,y1}] top-left pts on unrotated page, terms[]} → {areas_redacted,search_matches} · `sanitize`{metadata,javascript,attachments,annotations,links,hidden_text,form_data; body optional} → counts report
- Part 1 additions: `GET /uploads/{f}/pages/{n}/preview?width=` → JPEG, headers `X-Page-Width/Height` (points, unrotated visible/crop box). `add-text` body now also takes `color` (#RRGGBB) and `pages` (optional list); `add-image` takes optional `pages`. Overlay coordinates: points, origin = bottom-left of the visible (crop) box, rotation ignored (preview is unrotated). Text is Latin-only (built-in Helvetica) → non-Latin rejected with 422. `crop` is relative to the current cropbox (accumulates). Image resolver shared: `uploads.resolve_stored_image`.
- Schemas are authoritative: **always re-read `schemas/*.py` + the router before wiring a workflow** (rule B in RULES.md).

## Frontend status
Implemented workflows (28, Parts 1–4): Merge, Split, Extract, Reorder, Rotate, Delete, Watermark, Page numbers + (Part 1) Add Text, Add Image, Header & Footer, Background, Crop + (Part 2) PDF→Images, Images→PDF, PDF→Word/Excel/PowerPoint, Word→PDF, PowerPoint→PDF + (Part 3) Protect, Unlock, Redact, Sanitize + (Part 4) Duplicate, Compress, PDF details, PDF to text, plus the Recent files view (`components/dashboard/HistoryView.tsx`, opened from the sidebar).
Placeholders (still "coming soon"): none. All 24 tool cards have workflows.
No tool entry / workflow at all (backend exists): duplicate-pages, compress, inspect/metadata, text extraction.

### Frontend conventions (copy these, don't re-read every workflow)
- Each workflow = `components/workflows/XWorkflow.tsx`, props `{ onBack: () => void }`, "use client", default export.
- Registered in `lib/tools.ts` (id, name, category, icon, color, available) AND in `components/workflows/registry.tsx` (id → `dynamic(() => import(...), {ssr:false})`). `app/page.tsx` just looks up the registry.
- **New workflows (Part 1+) use `components/workflows/shared/`**: `usePDFWorkflow()` (upload/inspect/run/result/error state), `PDFDropzone`/`FileDropzone`, `PagePreview` (page image + pager + click→PDF-point coords + overlay render-prop using `cqw` units), `ui.tsx` (WorkflowShell, FileChip, ErrorBanner, SubmitButton, ResultCard, ScopeToggle, inputClass, formatSize). Copy `AddTextWorkflow.tsx` as the template for any single-PDF tool. The 8 older workflows are self-contained and untouched.
- `api.ts`: new code uses `postOperation(filename, op, body)`; errors go through `readError` (handles FastAPI 422 lists).
- API calls live in `lib/api.ts` only; paths relative to `API_BASE`; downloads via `getDownloadUrl(name)`.
- Tailwind v4, **currently a LIGHT theme** (`bg-[#fafafa]`, gray-900 hero). The user's brief said "dark theme"; actual code is light — keep what exists, do not redesign.
- `apps/web/AGENTS.md`: Next 16 has breaking changes — consult `node_modules/next/dist/docs/` before touching routing/config.

## Known issues / risks (prioritized)
1. 15 tools are marked `available: true` but open a placeholder → misleading until Parts 1–3 land.
2. (Done in Part 4) History recorded + Recent files UI.
3. (Done in Part 4) Retention sweep every 15 min, default 24 h (`PDF_CRAFT_RETENTION_HOURS`), plus manual delete-all. NOTE: it deletes anything older than the period in the storage dir, including old dev files.
4. (Done in Part 5) Optional single-user sign-in: set `PDF_CRAFT_PASSWORD_HASH` (+ `PDF_CRAFT_SECRET`); all routers except `/health` and `/auth/*` use `Depends(require_auth)`; OpenAPI docs hidden when enabled; 5 wrong passwords per 5 min per client IP -> 429; HttpOnly SameSite=Lax cookie (Secure when `PDF_CRAFT_COOKIE_SECURE=1`). Frontend: `components/auth/AuthGate.tsx` (+ 401 event from api.ts). Auth is OFF when the hash is unset (dev default).
5. DOCX/PPTX→PDF: uses LibreOffice if found (PDF_CRAFT_SOFFICE / PATH / default Windows dirs), else a text-only reportlab fallback (UI shows a warning). Uploads are now validated as real OOXML zips (+ unpacked-size cap). LibreOffice is not installed on the dev PC → real-LO output unverified; Docker image must include it (Part 5).
6. (Done) req.txt deleted; install with `pip install -r requirements.txt -c constraints.txt` (constraints = exact tested versions, Windows-only colorama omitted); tests need `requirements-dev.txt`.
7. (Done) next.config: `API_INTERNAL_URL` (build time, default 127.0.0.1:8000), `output: "standalone"` (prod = `node server.js` with HOSTNAME/PORT env), `experimental.proxyClientMaxBodySize: 64mb` (Next buffers rewrite bodies at 10 MB otherwise -> uploads >10 MB failed with 500 when going through the Next proxy; Caddy bypasses the proxy for /api/backend).
8. (Fixed in Part 2) pdf-to-images route normalised.
9. Encrypted PDFs: engines reject them ("Supply its password first") — UX must route users to Unlock.
10. (Fixed in Part 1) add-text/add-image endpoints raised TypeError (positional/keyword mismatch in `pdf_service`) and add-image returned 500 for a missing image; both now covered by `tests/test_pdf_edit.py`.
11. Overlay tools ignore pages with /Rotate ≠ 0 semantics (content drawn in unrotated frame, matches preview). Watermark and page-numbers still use the older mediabox-based overlay code path for page numbers (watermark uses the new box-aware path).
12. Conversion endpoints for Office files run in a threadpool (LibreOffice can take minutes); concurrency capped by PDF_CRAFT_OFFICE_WORKERS (2), timeout PDF_CRAFT_OFFICE_TIMEOUT (120 s).
13. Dev note: user's own `uvicorn --reload` on :8000 and `next dev` on :3000 may be running — test on other ports (8010/3010) and never kill them.
14. Test hygiene: stale uvicorn processes survive on Windows and can serve OLD code on the same port — kill by listening PID (`netstat -ano`) and verify with /openapi.json before trusting browser tests. Avoid apostrophes/backticks inside bash heredocs (tool parser breaks); use Write/Edit tools for files.
15. Deployment (no Docker): `deploy/install.sh` copies code to /opt/pdf-craft (root-owned; app in api/, venv/, web/ standalone), state in /var/lib/pdf-craft, settings /etc/pdf-craft/pdf-craft.env (+ install.options remembered for updates), service user `pdfcraft`, Caddy reverse proxy (`/api/backend/*` straight to :8000, rest to :3000), units use IPAddressDeny=any/IPAddressAllow=localhost so the services cannot reach the internet. uvicorn runs with --no-access-log (file names never logged), 1 worker.
15b. Windows-sandbox quirk: servers started from the Bash tool are INVISIBLE to PowerShell Get-NetTCPConnection/netstat at times and survive; list them with `Get-CimInstance Win32_Process` (read-only) and stop ONLY exact PIDs you started (the classifier denies pattern kills; the user's own uvicorn:8000/next dev:3000 must never be touched). Prefer a fresh directory + port per test run. WSL Ubuntu 24.04 exists (user rachit, systemd on, python3.12 WITHOUT python3-venv, no node, sudo needs a password) — usable for non-root checks only.
15c. Tests use their own temp SQLite DB and retention 0 (set in `tests/conftest.py` before the app import). When browser-testing destructive features (delete-all), start the test backend with `PDF_CRAFT_STORAGE_DIR` and `PDF_CRAFT_DATABASE_URL` pointing at a scratch folder. Kill test servers by command line (PowerShell `Get-CimInstance Win32_Process | Where CommandLine -match "--port 8010"`), because two uvicorn processes can share a port on Windows and netstat misses them.
16. Compress: `POST /uploads/{f}/compress` body `{level: lossless|balanced|strong}` (optional); result adds `level`, `output_size_bytes`; output is never larger than the input. `/uploads/{f}/info` adds `pdf_version`, `page_size`, `mixed_page_sizes`, `metadata.keywords/created/modified` and now reads with strict=False.
17. Privacy positives (verified): no external fonts, no CDN/URLs in frontend source, `layout.tsx` has no analytics.
