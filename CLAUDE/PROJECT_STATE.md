# PROJECT_STATE — verified 2026-11-16 (updated after Part 1 implementation)

> Part 1 (Edit workflows) is implemented on `claude-takeover`, uncommitted until the user verifies. Baseline now: **255 backend tests pass** (Parts 6-7), lint clean, build OK.

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
All 28 tools are reachable from the Studio (Part 8); the old one-screen-per-tool workflows are gone. Tools that start from several files (merge, images to PDF, Word/PowerPoint to PDF) live on the Files page.

### Part 10 (power tools)
- Engine `engines/pdf/power.py` (blank pages, forms, details, size target, greyscale, compare, annotate, deskew), stamps/tokens in `engines/pdf/operations.py`, REST `api/routers/tools.py`, services `power_service.py`, `search_service.py`, `search_index.py`, flow step cache `flows/cache.py`. 36 registry operations. Studio panels in `components/studio/panels.tsx`, signature pad `SignaturePad.tsx`.
- Verified in a browser: blank pages, form fill, stamp, signature pad, compare, save as flow, deskew, mark up; axe-core clean on all routes (light, and dark for main ones). Not browser-tested: greyscale, size target, details editor, note placement, ZIP button clicks (ZIP and search verified through the API and tests).

### Flows (Part 9)
- `components/flows/FlowsPage.tsx` (canvas, palette, inspector, toolbar), `StepNodeView.tsx`, `lib/flows.ts` (canvas <-> server definition, templates, "run to here" = a step plus everything feeding it). Backend: `services/saved_flows.py`, `/flows/saved`.
- Verified in a browser (isolated stack): template load, run with per-step status, results, save, Run to here, validation messages. Backend 258 tests, lint and build clean. Not verified: drag from palette, drawing a connection by hand, import, themes other than light, small screens.

### Frontend conventions
- A tool is a registry entry (backend) + a catalogue entry in `lib/tools.ts` + a target in `lib/operations.ts` `TOOL_TARGETS` (which Studio panel and mode it opens) + a route in `OPERATION_ROUTES` in `lib/api.ts`. Simple settings forms come from `SchemaForm`; add a panel in `components/studio/panels.tsx` only for custom interaction.
- Studio: `StudioPage` (layout), `useStudio` (versions, undo, apply), `PageGrid` (dnd-kit), `PagePreview` (large page, click/drag overlay, `cqw` units), `panels.tsx`, `SchemaForm`. Shared blocks in `components/ui/blocks.tsx`.
- API calls live in `lib/api.ts` only; paths relative to `API_BASE`; downloads via `getFileDownloadUrl(name, friendlyName)`.
- Themes are token based (see Frontend Part 7); use `bg-surface`, `text-fg-muted`, `border-line`, `bg-accent` etc., never fixed colours.
- Flow engine (`app/flows`): definition validation (`POST /flows/validate`), run in background (`POST /flows/runs`, poll `GET /flows/runs/{id}`, cancel, delete), items model, fork/merge, limits (25 nodes, 50 items/step, 200 files, 600 s), passwords masked in stored runs, interrupted runs failed on restart, finished runs pruned by retention. Intermediates are hidden from `/files` unless `include_intermediate`.
- Not done on purpose: saved-flow CRUD, step cache, SSE (Part 9); PyMuPDF engine interface (licence decision pending, usage still confined to 4 engine files).

### Frontend (Part 7)
- Tokens/themes: `lib/themes.ts` (4 built-in: Aurora default (mist greys, deep teal), Cool Light, Cool Dark, Warm Paper; custom themes derived from 4 colours + radius), `lib/color.ts` (WCAG contrast), `components/theme/ThemeProvider.tsx`, inline pre-paint script (no flash), all contrast checks pass AA. Settings -> Appearance has match-system switch and the custom theme creator (live preview, readability checks, save/edit/delete, export/import JSON, max 12). Stored in localStorage `pdfcraft.theme`.
- Shell: `AppShell` (sidebar, top bar), `CommandPalette` (Ctrl K: tools, pages, themes), hash routing (`lib/route.ts`: #/tools/<category>, #/studio/<file>[/<tool>[/<mode>]], #/files, #/settings), `ToolsPage` (grouped, search, press /), `FilesPage` (uses /files; expiry, download, delete, delete-all), `SettingsPage`, sign-in page restyled. UI kit in `components/ui/` (Button, controls, Toaster). Fonts local via @fontsource-variable (no CDN).
- Part 8 verified in a browser (isolated stack): page grid, rotate, undo, text placement, redact drawing, locked-file unlock, Files home, tool launcher. Not browser-tested: Convert tab, drag reorder, split, image placement, Office/image intake, merge from Files. Backend 256 tests, smoke test 30/30.
- Verified in a browser: theme switching and persistence, custom theme with real typing, palette, Files page end to end, merge screen in dark. Not verified: every tool screen in every theme (only the shared building blocks and 3 screens were viewed).
