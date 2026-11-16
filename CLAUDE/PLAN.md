# PLAN — 5 parts to a self-hosted V1

Status legend: [ ] todo · [~] in progress · [x] verified by user.
Each part = one user verification + one commit. Parts are ordered so each is independently useful and cheap to resume.
(This replaces the earlier "two workflows per batch" rule: inside a part, Claude builds all its workflows, then the user verifies once.)

## Part 1 — Edit workflows  [x] committed d14e547, pushed to origin/claude-takeover
Backend already exists for all of these; mostly frontend.
- Shared pieces (new workflows only): upload dropzone, result/download card, error banner.
- Workflows: **Add Text, Add Image, Header & Footer, Background, Crop**.
- Add `add-image` entry to `tools.ts` (missing today); `api.ts` functions for each; wire into `page.tsx`.
- Backend: verify coordinate system/units of add-text, add-image, crop (page-origin conventions) and add tests for invalid input; image upload via `/uploads/image`.
- Delivered beyond plan: page-preview endpoint (pulled forward from Part 3), tools registry with code-splitting, 2 pre-existing backend bugs fixed (add-text/add-image endpoints crashed).
- Done when: each workflow produces a correct PDF verified by script (text present at position, image present, crop box changed, header/footer on all pages, background applied).

## Part 2 — Convert workflows  [~] implemented, awaiting user verification (not committed)
- Delivered: 7 workflows; LibreOffice optional engine (`engines/pdf/office.py`, auto-detected, basic fallback + UI warning); Images→PDF rewritten (PyMuPDF, A4-fit pages, JPEG passthrough, EXIF); DOCX/PPTX content validation; friendly download names (`?name=`); actionable encrypted-PDF message; `pdf-to-images` moved to `/conversions/{f}/to-images`. LibreOffice path is only stub-tested here (not installed on the dev PC) — user should test with a real install.
- Workflows: **PDF→Images, Images→PDF, PDF→Word, PDF→Excel, PDF→PowerPoint, Word→PDF, PowerPoint→PDF**.
- Backend: normalize `pdf-to-images` contract (path param; keep old route working or update tests), add zip/magic validation for DOCX/PPTX uploads, handle encrypted input with a clear error.
- Evaluate Office→PDF fidelity of the current reportlab approach; if poor, add **optional** LibreOffice (headless) engine behind the same endpoints (decision documented in `DEPLOYMENT.md`; falls back to current engine if `soffice` absent).
- Multi-file/zip results: download card handles `.zip`, `.docx`, `.xlsx`, `.pptx`.
- Done when: outputs open correctly (DOCX/XLSX/PPTX loaded via python-docx/openpyxl/python-pptx in verification script; images zip has N pages).

## Part 3 — Protect workflows  [ ]
- Workflows: **Protect (passwords + permissions), Unlock, Redact, Sanitize**.
- Page preview endpoint already exists (added in Part 1: `GET /uploads/{f}/pages/{n}/preview`, JPEG + X-Page-Width/Height) and `shared/PagePreview.tsx`. Redact UI: draw/enter regions on page preview, coordinates mapped to PDF points.
- Verify with scripts: encrypted file requires password; unlock round-trips; redacted text is **absent from extracted text** (not just covered); sanitize strips metadata/JS/attachments.
- Encrypted-PDF UX: any workflow hitting an encrypted file points the user to Unlock.
- Never log or persist passwords.

## Part 4 — Utilities, jobs & V1 completeness  [ ]
- Workflows/tools: **Duplicate pages, Compress, PDF info/metadata, Text extraction**; mark nothing `available` unless it has a workflow.
- Wire SQLite jobs: operations record job + output; "Recent files / history" view with re-download and delete.
- Retention/cleanup: configurable auto-delete of uploads/outputs (default e.g. 24 h) via background task + manual "delete my files" button.
- Backlog items worth doing here: thumbnails in Reorder/Delete/Extract, upload progress, better error states, mobile layout pass.
- Done when: V1 feature list in the brief is fully reachable from the dashboard; backend suite green.

## Part 5 — Self-host on Linux, privacy & release  [ ]
Details in `DEPLOYMENT.md`.
- Config via env (no build-time baked URLs); `.env.example`; pinned `requirements.lock`; remove stale `req.txt`.
- Dockerfiles (api, web) + `docker-compose.yml` + reverse proxy (Caddy/nginx) with HTTPS, non-root containers, volumes for data, healthchecks. Also a no-Docker systemd option.
- Single-user authentication (password / session or reverse-proxy basic auth), upload size limits, rate limiting, CORS locked down, security headers.
- Privacy audit: no outbound network calls (verify with egress-blocked container), no telemetry, no external fonts, logs never contain file names/passwords, data purge command.
- Backup/restore doc, upgrade doc, smoke-test script (`scripts/smoke.sh`) that runs every V1 operation against sample PDFs, final README, tag `v1.0.0`.
- Done when: fresh Linux box → `docker compose up -d` → full smoke test passes with network egress disabled.

## Out of scope until V1 is tagged
V2: OCR, AI summarization, chat with PDF, QA, intelligent extraction (separate services behind the same API; see `BACKLOG.md`).
