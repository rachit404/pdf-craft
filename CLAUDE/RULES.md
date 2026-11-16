# RULES — how we work on pdf-craft

## Roles
- User verifies each **Part** (not each workflow) → keeps token use low. Claude implements end-to-end, then stops and waits.
- Scope: V1 (standard PDF Studio) only. V2 (OCR/AI) is out of scope until V1 is released.

## Part workflow (one verification per part)
1. Read `PLAN.md` + `PROJECT_STATE.md`. Grep only the routers/schemas the part needs.
2. For each workflow in the part: re-verify the endpoint contract (method, path, body/multipart fields, response, errors, download) from router + schema. Never guess names.
3. Fix/add backend only if necessary; add pytest tests for new/changed behavior and invalid inputs.
4. Build frontend workflows, add `api.ts` functions, register in `tools.ts` + `page.tsx`.
5. Run: backend `pytest -q`; frontend `npm run lint` then `npm run build` (once, at end).
6. Check **real output** (open generated PDF/file via a script or PyMuPDF: page count, text present, etc.), not just UI success.
7. Write test instructions for the user (Windows CMD, backend and frontend commands separated) in the reply; update `CLAUDE/PROJECT_STATE.md` + tick `PLAN.md`.
8. **Stop. Wait for user confirmation.**

## Git
- Work on `claude-takeover`. No commit until the user confirms the part works.
- On confirmation: `git status`, review diff, no unrelated files (never `data/`, `.venv`, `.next`, `.env*`), one conventional commit per part (e.g. `feat(web): add text, image, header/footer, background and crop workflows`), push the branch; merge/push to `main` only when the user says so.
- Never reset/force-push/discard user work.

## Code conventions
- Preserve architecture: one FastAPI backend (routers → services → engines), one Next.js frontend. No new frameworks/DBs/microservices.
- Complete files over snippets; TypeScript types; API calls only in `lib/api.ts`; handle loading/success/error; validate input client-side AND server-side (pydantic).
- Shared UI: reuse `components/ui/` and `components/studio/` pieces; extract ONE shared component when 3+ places need the same thing.
- Security: validate uploads by content + size; safe filenames; no path traversal; clean temp files; stream large files; redaction must truly remove content; permissions are advisory flags.
- Existing decisions: lossless compression (pikepdf) only; PDF→PPTX via page images; PDF→XLSX best-effort tables; PDF→DOCX best-effort layout.
- No external network calls from either app (privacy). No CDN fonts, analytics, telemetry, remote APIs.
- Commands for the user: Windows CMD syntax, backend and frontend sections separated.

## Environment facts
- Windows 11, VS Code, CMD. Repo `D:\My GitHub\rachit404\pdf-craft`. Frontend `apps\web`. Backend `services\api` (venv `.venv`).
- Backend run: `cd services\api` → `.venv\Scripts\activate` → `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
- Frontend run: `cd apps\web` → `npm run dev` (http://localhost:3000, proxies `/api/backend/*` → backend).
- Backend tests: `cd services\api` → `.venv\Scripts\python.exe -m pytest -q`
