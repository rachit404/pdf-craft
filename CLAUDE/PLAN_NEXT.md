# PLAN_NEXT — from "28 tools" to a document studio with chaining

> Update 2026-11-16: user chose direction A, a **cool** default theme, 3 selectable themes (light and dark) and a custom theme creator. Parts 6 and 7 are being built; Parts 8-10 are planned in section 6.

Status: **proposal, no code written.** Parts 1-5 (see `PLAN.md`) delivered the V1 tool set and a Linux
deployment. This plan covers Parts 6+ and the later commercial track. Each part is one user verification and one
commit, as before.

## 0. Guardrails (from the user)

1. Internal use first. Commercial scaling only after the user is satisfied; but do not paint ourselves into a corner.
2. Simplicity wins: users should get "PDF magic", not learn the platform or wonder where their file went.
3. Chaining: drag-and-drop micro tools into a flow (n8n-style); outputs feed the next node; no download/re-upload.
4. UI must not look machine-generated. Use proven UI libraries.
5. Keep what works (API stays backward compatible), keep the project small, keep it private (no external requests).

## 1. Honest diagnosis of today's product

| Problem | Evidence in the code | Consequence |
|---|---|---|
| Tool-first, not file-first | 28 screens, each starts with its own upload (`usePDFWorkflow`) | Users re-upload for every step |
| Results are dead ends | Routers resolve inputs only from `uploads/` (`resolve_stored_file`); results land in `outputs/` | Chaining is impossible; "download then upload again" |
| Invisible data lifecycle | Files silently expire after 24 h; history is a sidebar item | "Where did my file go?" |
| Duplicated UI code | 29 workflow files, about 7,300 lines, near-identical structure | Every change costs 28x |
| Generic look | Violet accent, `rounded-2xl` cards, icon-in-tinted-square tiles, hero banner, uniform card grid | Reads as AI-generated SaaS template |

## 2. Target experience: a file-first "Studio"

```
+---------------------------------------------------------------------------------+
| Files   contract.pdf  v3 of 3   [Undo] [Redo]            23h left · Delete   [Download] |
+--------+--------------------------------------------------------+---------------+
| Pages  |                                                        | Rotate pages  |
| Add    |         page thumbnails / viewer (the document)         |  [options]    |
| Convert|                                                        |  [Apply]      |
| Protect|                                                        |               |
| Clean  |  Versions:  Original -> Rotated -> Watermarked         |               |
| Flows  |                                                        |               |
+--------+--------------------------------------------------------+---------------+
```

- **Home** = one big drop zone + "Your files" (thumbnail, size, "kept 23 h", delete). Drag a file anywhere to start.
- **Open a file once.** Every action is applied to the *working copy* and creates a **version** (Original is always
  kept). Undo/redo is the version timeline. Download is always visible. No result cards at the bottom of a screen.
- **Data lifecycle is always visible**: "Stored on this server only · deleted in 23 h · Delete now" in the header.
- **Command palette (Ctrl/Cmd+K):** type "rotate", "compress", "protect" and go.
- **Multi-select in Files** gives Merge, Compare and Batch.
- **Plain language:** verbs ("Rotate pages", "Make smaller"), no jargon, sensible defaults, remembered last settings.

### 2.1 Consolidating 28 screens into about 10 task screens

| New screen | Replaces | Notes |
|---|---|---|
| Pages | reorder, delete, duplicate, rotate, extract, split | One thumbnail grid: drag to reorder, click to select, act on selection (Acrobat/iLovePDF "organize") |
| Merge | merge | Drag files from Files, reorder |
| Add to pages | add text, add image, watermark, page numbers, header/footer, background | One placement canvas + a small mode switch |
| Crop & resize | crop | Add "fit to A4", margins presets |
| Make smaller | compress | Before/after size, "under X MB" target |
| Convert | 9 conversion screens | From/To picker, one panel |
| Protect | protect, unlock | One screen, auto-detects locked files |
| Redact | redact | Boxes + search terms (+ later PII suggestions) |
| Clean & info | sanitize, details | Show what is inside, remove it |
| Flows | (new) | Section 4 |

The old API stays. Only the screens are merged.

## 3. Visual design: how it stops looking generated

Libraries give good parts; the *decisions* create the look. So we set a design system first.

**Direction (recommended):** a dense, calm professional tool (think Linear, Figma, Squoosh, Acrobat): content first,
neutral palette, one considered accent, 1 px borders, 6 px radii, small type, keyboard-driven.

**Remove:** the hero banner; violet/purple gradients and rings; rounded-2xl everywhere; tinted icon squares on every
card; the equal-sized tool-card grid as the main screen; decorative emoji; marketing copy inside the app.

**Add:** real typography (a variable font, tabular numerals), a tight spacing/type scale, a neutral gray ramp with one
accent, dark mode, purposeful empty states, hover/focus states and focus rings, subtle motion (150 ms), keyboard
shortcuts shown in tooltips, real previews instead of icons.

**Libraries (all MIT/Apache/OFL, versions checked 2026-11-16; all self-hosted, no CDN):**

| Need | Library | Why |
|---|---|---|
| Components | **shadcn/ui** (Radix primitives + Tailwind 4; code is copied into the repo, so we own it and ship only what we use) with `class-variance-authority`, `tailwind-merge` | Accessible dialogs, menus, tabs, tooltips, sheets; fully restyleable |
| Command palette | `cmdk` | Ctrl+K navigation |
| Toasts | `sonner` | Quiet feedback |
| Motion | `motion` | Small, tasteful transitions |
| Dark mode | `next-themes` | System-aware theme |
| Fonts | `@fontsource-variable/inter` (+ a mono face) | Local font files; no Google Fonts (privacy) |
| Sortable pages / lists | `@dnd-kit/core`, `@dnd-kit/sortable` | Drag-reorder thumbnails and steps |
| Flow canvas | `@xyflow/react` (React Flow) | The standard node-graph library (n8n's own editor is built on its Vue sibling) |
| Server state | `@tanstack/react-query` | Caching, polling run status |
| Small client state | `zustand` | Workspace/selection state without prop drilling |
| Forms | `react-hook-form` + `zod` (or JSON-Schema-driven forms, section 5) | Validation without hand-written code |
| PDF rendering in browser (optional) | `pdfjs-dist` (Apache-2.0) | Instant thumbnails and smooth zoom without server round-trips; lazy-loaded |

**Process (cheap and decisive):** a *design spike* first: two clickable mockups (A dense workspace, B lighter and
friendlier) built as static pages from real layouts; the user picks one; then we write tokens (color incl. dark, type,
spacing, radius, elevation), a component inventory and an accessibility baseline (keyboard, AA contrast). Desktop-first;
tablet works; phone is view/download only.

## 4. Chaining ("Flows"): n8n-style micro-tool pipelines

### 4.1 Mental model
A **flow** is a graph of **nodes**. **Items** (files) travel along edges. Node kinds:
- **Source:** Upload, From library, Many files (batch).
- **Action:** any tool from the registry (rotate, watermark, compress, to-Word...).
- **Combine:** merge, images-to-PDF (multiple inputs).
- **Output:** Save to library, Download, Zip.
No loops, conditions or webhooks in v1. Maximum about 25 nodes per flow.

### 4.2 Data model rules (keeps it simple)
- Item types: `pdf`, `image`, `docx`, `xlsx`, `pptx`, `text`, `archive`.
- Every node receives a **list of items** (like n8n). Two behaviours: **per item** (rotate each file) and **combine all**
  (merge). A node that produces many items (split, PDF to images) simply emits a list; archives of PDFs auto-unpack.
- Ports are colored by type; an invalid connection is refused with a plain-language reason.
- Example: `Upload -> Split every 5 pages -> Watermark (per item) -> Merge -> Compress -> Protect -> Save`.

### 4.3 Editor UX (React Flow)
- Left **palette**: searchable, grouped by category; drag onto canvas or click to append.
- **Node card:** icon, title, one-line settings summary, status dot (idle/running/done/error), output thumbnail on hover.
- Right **inspector:** the same options form as the tool screen (single source, section 5).
- Toolbar: Run, **Run to here** (test one step), Save, Templates, Undo/Redo, Auto-layout, Fit view.
- **Starter templates:** Scan pack (images -> PDF -> compress), Contract release (flatten -> watermark -> protect),
  Email-size (compress under 5 MB), Redact & share (redact terms -> sanitize -> protect), Word -> PDF -> page numbers.
- **Quick chain:** in Studio, any sequence of applied actions can be "Saved as flow" and replayed on other files.
  That is the simple on-ramp; the canvas is the advanced view of the same data.
- **Batch:** a Source with many files runs the flow per file and returns a ZIP.
- Export/import flows as JSON (versioned schema).

### 4.4 Execution (backend)
Topological order; each node writes its outputs as files in the store with lineage; per-node status, duration and
error are recorded; progress by polling or Server-Sent Events; cancel; step cache keyed by (node config + input ids) so
re-runs skip unchanged steps; limits on nodes, items, file sizes and run time; intermediate files obey the retention
rules. In-process worker now; the executor takes a "worker" interface so it can move to a separate process later.

## 5. Foundation that makes both Studio and Flows possible (Part 6)

1. **Unified file store.** A `files` table (id, owner, kind, mime, size, original name, created, expires, parent ids,
   producing operation). One folder, random ids. Any file can be an input to any operation, so results are
   chainable. Old routes keep working (they map names to ids).
2. **Operation registry.** Each tool declared once: id, label, category, input types/arity, output types, parameter
   schema (Pydantic -> JSON Schema), UI hints, and a `run()` that wraps today's service function (no engine rewrite).
   The registry drives: the REST routes, the flow executor, the palette, and **generated option forms**, so most of the
   28 hand-written screens collapse into one schema-driven panel. Custom UIs remain only where needed (page picker,
   placement canvas, crop, redact).
3. **Versions.** A file has a lineage; "working copy" = latest version; Undo = move pointer.
4. **Ownership hooks.** `owner_id` on files, flows and runs (default `local`) and an auth interface in front of
   the current single password. Cheap now; expensive to retrofit.
5. **Compatibility.** Existing endpoints and the 175 tests remain; new tests cover lineage, chaining and registry
   parity (every registry op equals the old endpoint's output).

## 6. Delivery plan (Parts 6-10), agreed 2026-11-16

Decisions folded in: direction A (dense pro tool); **default theme = "Cool Light"**; Settings offers **3 built-in themes**
(Cool Light, Cool Dark, Warm Paper) plus **match-system** and a **custom theme creator**; both light and dark exist.
Parts 6 and 7 are built now; 8-10 follow after the user verifies.

### Part 6 - Foundation (backend, no visible UI change)  [built, awaiting verification]
- **File store with lineage:** `stored_files` table (name, kind, original name, size, owner_id, parent/root, sources,
  operation, intermediate flag). Every upload and every result is registered. `GET /files`, `/files/{n}`, `/versions`,
  `/download`, `DELETE`, and one content-sniffing upload `POST /files` (PDF, PNG/JPEG, DOCX, PPTX).
- **Chaining compatibility:** any result file can be the input of any operation endpoint (resolver looks in uploads and
  outputs). No more download then re-upload at the API level.
- **Operation registry:** ~27 operations declared once (id, label, category, typed input ports, output kind, params model,
  each/combine mode, `run`). `GET /registry/operations` publishes them with JSON Schema for the UI.
- **Headless flow executor:** definition validation (unknown ops, bad params, cycles, port types), items model
  (per-item or combine), fork/merge, limits, cancel, per-node status, outputs registered with lineage; background runs
  stored in `flow_runs` (`POST /flows/runs`, `GET /flows/runs/{id}`).
- **Door-open:** `owner_id` on files, runs and jobs (default `local`). PyMuPDF swap decision stays open (see section 8).
- Done when: results usable as inputs; registry parity and executor tests pass; all earlier tests still pass.

### Part 7 - Design system, themes and shell (frontend)  [built, awaiting verification]
- Built differently from the first plan: own small ThemeProvider (no next-themes: custom themes are plain token maps applied before first paint), `cmdk` + `sonner` + cva/clsx/tailwind-merge, no direct Radix packages (cmdk brings its dialog). Tokens as CSS variables mapped to Tailwind (`bg-surface`, `text-fg-muted`, `border-line`, `bg-accent`...), local
  Inter + JetBrains Mono (no CDN), Radix primitives + `cmdk` + `sonner`, small hand-written UI kit (shadcn style).
- **Themes:** Cool Light (default), Cool Dark, Warm Paper; "Match system"; **custom theme creator** in Settings
  (background, surface, text, accent, radius; derived colours via `color-mix`; live WCAG contrast check; save several,
  export/import JSON). Stored per browser; applied before first paint (no flash).
- **Shell:** compact top bar (Ctrl+K), left nav (Tools, Files, Settings), no hero banner. Tools page = grouped dense list.
  Files page = restyled history (table, expiry, download/delete, delete-all). Sign-in page restyled.
- **Legacy bridge:** colour variables remapped so the 8 older screens follow every theme until Part 8 replaces them.
- Done when: every screen readable in all three themes plus a custom one; no external requests; keyboard reachable.

### Part 8 - Studio workspace  [next]
Files home (drop zone + table + multi-select), document view with page thumbnails, versions timeline + undo/redo,
Pages grid (reorder/delete/duplicate/rotate/extract/split on thumbnails), merged "Add to pages" panel, schema-driven option
panels generated from `/registry/operations`, visible expiry and "Delete now". Old screens retired as each is replaced.
Done when: the whole V1 set works without re-uploading and the user can say where every file is.

### Part 9 - Flows  [after 8]
React Flow canvas, step palette from the registry, inspector forms, Run / Run to here, per-node status + thumbnails,
templates, saved flows (CRUD), import/export JSON, batch (many files -> ZIP), "Save as flow" from Studio, step cache.
Done when: a 6-node template runs end to end with per-node status and previews.

### Part 10 - Power tools wave 1 + hardening  [after 9]
Sign and stamp, fill and flatten forms, smart split, compare PDFs, clean scans (blank pages, deskew, grayscale), library
search (FTS5), tokens in headers/names. Each is a registry entry plus a small panel, so it works in Flows automatically.
Hardening: step cache, run limits tuning, accessibility pass, performance budget, installer update for new env settings.

### Later (not scheduled)
V2 local OCR and AI (section 7), then the commercial track (section 8). Revisit after Part 10.

Order rationale: Part 6 unblocks everything; Part 7 before 8 so screens are built once on the final look; Part 9 after 8
because Flows reuse the panels; power tools last because each is cheap once the registry exists.

Risk register: (1) Studio rewrite touches every screen, so migrate behind the same API and retire screens one at a time;
(2) flows scope creep, so v1 stays loop-free; (3) pdf.js adds weight, so lazy-load and keep server previews as fallback;
(4) schema-driven forms can feel generic, so keep custom UIs for spatial tools; (5) theme creator can produce
unreadable themes, so it shows contrast warnings and offers one-click reset.

## 7. More things to build ("PDF magic"), ranked

**Wave 1 - high value, modest effort (recommended first):**
1. **Sign & stamp:** draw/type/upload a signature, place it, flatten; reusable stamps (Approved/Draft/Confidential).
2. **Fill & flatten forms:** detect AcroForm fields, fill, flatten.
3. **Annotate:** highlight, underline, notes, freehand; export with or without comments.
4. **Compare two PDFs:** text diff plus side-by-side visual difference.
5. **Smart split:** by every N pages, by size, by bookmarks, at blank pages.
6. **Clean scans:** remove blank pages, auto-rotate, deskew, grayscale/black-and-white (OpenCV is already installed
   as a dependency of pdf2docx).
7. **Library search:** full-text search across your files (SQLite FTS5); also solves "where is my data".
8. **Smart naming and tokens:** `{filename}`, `{date}`, `{page}/{pages}` in headers, footers, watermarks and output names.
9. **Make smaller to a target:** "under 5 MB" tries levels until it fits, with before/after preview.
10. **Extract images / tables:** images to ZIP, tables to CSV/XLSX.

**Wave 2 - useful extras:** metadata editor; bookmarks/outline and table-of-contents builder; Bates numbering; resize
pages / N-up / booklet; PDF/A archival and linearize (fast web view; pikepdf supports it); flatten annotations; add or
remove attachments; page labels; tiled/image watermark.

**Wave 3 - automation:** hot folder (drop files to run a flow), scheduled flows, API keys + webhooks, command-line client.

**V2 local intelligence (Tesseract is already on your PC; Ollama too, so prototypes are cheap):**
OCR for scans (OCRmyPDF + Tesseract), **PII auto-redaction suggestions** (names, emails, phone, IBAN), summary, chat with a
document, structured extraction (invoice -> JSON/CSV), auto-naming of files. All local, opt-in.

**UX details that sell the "magic":** drag a file anywhere to start; paste an image from the clipboard; page-range syntax
(1-3,5); remembered settings; keyboard shortcuts; real progress; before/after sliders; undo everywhere.

Note on "edit existing text": true in-place text editing is hard and unreliable in PDF. Offer honest alternatives
(cover-and-retype, find-and-replace on simple text) rather than promising Word-like editing.

## 8. Commercial readiness (later; decide after internal satisfaction)

**Licensing gate (most important):**
- Checked 2026-11-16: **PyMuPDF is AGPL-3.0 or Artifex commercial licence.** `pdf2docx` is MIT but depends on PyMuPDF.
  Others in use: pikepdf MPL-2.0, pypdf BSD-3, ReportLab BSD, python-docx/openpyxl/python-pptx MIT, Pillow MIT-CMU,
  pypdfium2 BSD/Apache. (`pdfplumber` metadata is blank: verify.)
- PyMuPDF use is confined to 4 files (`renderer`, `converter`, `compressor`, `security`; about 18 calls). Options:
  (A) buy the Artifex commercial licence; (B) replace it (rendering -> pypdfium2; image recompression -> pikepdf+Pillow;
  redaction/sanitize/search is the hard part); (C) release the code under AGPL and sell hosting/support.
  **Recommendation:** in Part 6, hide PyMuPDF behind a small "engine" interface so the choice stays open; take legal advice
  before the first paying customer.

**Door-open decisions to take now (cheap):** `owner_id` on data; storage and queue behind interfaces; operation registry as the
future plugin API; no filenames in logs (done); settings in env, not constants (done); versioned flow schema.

**Later checklist:** accounts/roles/SSO; per-tenant storage and quotas; usage metering; billing or licence keys
(on-prem licence fits the privacy brand best); audit log; background queue and separate workers; Postgres; optional S3
storage; packaged installers (deb/rpm and, when customers expect it, containers); in-app updates; backup/restore;
upload malware scanning (ClamAV, optional); CSRF tokens and per-user rate limits; dependency scanning (`pip-audit`,
`npm audit`), SBOM and an external penetration test; EULA, privacy policy, docs site, support process, branding and
trademark check for the product name.

## 9. Decisions needed from the user

1. **DECIDED (2026-11-16): direction A, dense pro tool.** Clickable mockup (Files, Studio, Flows, Look and components,
   light/dark): https://claude.ai/artifact/6uWPrbAe8BiyVSUW6BUVzz . Tokens used there: warm neutrals (ground #F7F6F4),
   one accent #C2410C (dark mode #F0763D), Inter + JetBrains Mono, 13 px base, 28 px controls, 1 px borders, 5 px radii,
   no shadows. The mockup is the visual source of truth for Part 7.
2. Approve the library set in section 3 (shadcn/ui, cmdk, sonner, motion, dnd-kit, React Flow, TanStack Query, zustand,
   react-hook-form+zod, local Inter font; pdf.js optional).
3. OK to merge 28 screens into about 10 task screens (changes where things live; API unchanged)?
4. Name for chaining: **Flows**, Automations or Recipes?
5. Pick the first 4-5 wave-1 power tools (suggested: Sign & stamp, Fill forms, Smart split, Compare, Clean scans).
6. Default theme: light, dark or follow the system?
7. When to decide the PyMuPDF licence path (recommended: before any external pilot).
