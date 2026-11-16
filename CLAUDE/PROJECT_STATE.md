# PROJECT_STATE — verified 2026-11-16 (updated after Part 1 implementation)

> Part 1 (Edit workflows) is implemented on `claude-takeover`, uncommitted until the user verifies. Baseline now: **94 backend tests pass**, lint clean, build OK.

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
- `/jobs` POST/GET list/GET `{public_id}`/DELETE — SQLite job records (**not used by operations yet**)
- `POST /uploads` (multipart `file`, PDF only, 25 MB, content-type + `%PDF-` check) · `POST /uploads/image` (png/jpg, 10 MB)
- `GET /uploads/{f}/info` · `GET /uploads/{f}/text` · `POST /uploads/{f}/compress`
- `POST /operations/merge` {filenames}
- `POST /operations/{f}/` `extract-pages`{pages} · `reorder-pages`{order} · `delete-pages`{pages} · `duplicate-pages`{pages} · `rotate`{pages,degrees} · `split`{ranges} · `watermark`{text,opacity,font_size} · `page-numbers`{position,font_size} · `header-footer`{header,footer} · `background`{red,green,blue} · `crop`{left,bottom,right,top} · `add-text`{text,x,y,font_size} · `add-image`{image_filename,x,y,width,height}
- `POST /conversions/pdf-to-images?filename=` {image_format,dpi} (**filename is a query param — inconsistent**) · `POST /conversions/images-to-pdf` {filenames} · `POST /conversions/{f}/to-docx|to-xlsx` · `/{f}/to-pptx` {dpi} · `POST /conversions/docx-to-pdf|pptx-to-pdf` (multipart, 25 MB, extension-checked)
- `POST /security/{f}/` `protect`{user_password,owner_password,allow_*} · `unlock`{password} · `redact`{regions} · `sanitize`
- Part 1 additions: `GET /uploads/{f}/pages/{n}/preview?width=` → JPEG, headers `X-Page-Width/Height` (points, unrotated visible/crop box). `add-text` body now also takes `color` (#RRGGBB) and `pages` (optional list); `add-image` takes optional `pages`. Overlay coordinates: points, origin = bottom-left of the visible (crop) box, rotation ignored (preview is unrotated). Text is Latin-only (built-in Helvetica) → non-Latin rejected with 422. `crop` is relative to the current cropbox (accumulates). Image resolver shared: `uploads.resolve_stored_image`.
- Schemas are authoritative: **always re-read `schemas/*.py` + the router before wiring a workflow** (rule B in RULES.md).

## Frontend status
Implemented workflows (13): Merge, Split, Extract, Reorder, Rotate, Delete, Watermark, Page numbers + (Part 1) Add Text, Add Image, Header & Footer, Background, Crop.
Placeholders (still "coming soon"): pdf-to-images, images-to-pdf, pdf-to-docx, pdf-to-xlsx, pdf-to-pptx, docx-to-pdf, pptx-to-pdf, protect, unlock, redact, sanitize.
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
2. SQLite job infra exists but operations don't record jobs; no history UI.
3. No retention/cleanup of `uploads/` and `outputs/` (files accumulate forever) — privacy + disk problem for self-hosting.
4. No authentication/authorization — must be added before exposing on a LAN/Internet (Part 5).
5. DOCX/PPTX→PDF are Python re-implementations (reportlab), low fidelity; DOCX/PPTX upload validated by extension only (no zip/magic check).
6. `services/api/req.txt` is a stale UTF-16 `pip freeze` (junk); `requirements.txt` is unpinned ranges and lacks trailing newline. Need one clean, pinned lock for deployment.
7. `next.config.ts` rewrite uses `NEXT_PUBLIC_API_BASE_URL` (build-time inlined) → backend URL gets baked into the build; for Docker use a server-side runtime variable.
8. API inconsistency: `pdf-to-images` takes `filename` as query param, others in path.
9. Encrypted PDFs: engines reject them ("Supply its password first") — UX must route users to Unlock.
10. (Fixed in Part 1) add-text/add-image endpoints raised TypeError (positional/keyword mismatch in `pdf_service`) and add-image returned 500 for a missing image; both now covered by `tests/test_pdf_edit.py`.
11. Overlay tools ignore pages with /Rotate ≠ 0 semantics (content drawn in unrotated frame, matches preview). Watermark and page-numbers still use the older mediabox-based overlay code path for page numbers (watermark uses the new box-aware path).
12. Privacy positives (verified): no external fonts, no CDN/URLs in frontend source, `layout.tsx` has no analytics.
