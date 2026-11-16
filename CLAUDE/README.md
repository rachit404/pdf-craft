# CLAUDE/ — Context Index

Read this folder **first** in every new session. It replaces re-inspecting the whole repo (saves tokens).

| File | Purpose | When to read |
|---|---|---|
| `README.md` | This index + session start checklist | Always |
| `PROJECT_STATE.md` | Verified facts about the codebase, API map, known issues | Always (update after each part) |
| `PLAN.md` | The 5-part roadmap, scope and acceptance criteria per part | Always (tick progress) |
| `RULES.md` | Working rules, conventions, testing/commit workflow | Always |
| `DEPLOYMENT.md` | Self-hosting on Linux, privacy requirements | Part 5 (skim earlier) |
| `BACKLOG.md` | UI improvements and deferred ideas (incl. V2) | When a part finishes |

## Session start checklist (keep it cheap)
1. Read `PLAN.md` → find the current part.
2. Read `PROJECT_STATE.md` → do NOT re-explore the repo; open only files the current part touches.
3. `git status` + `git branch --show-current`.
4. Do the part. Update `PROJECT_STATE.md` / `PLAN.md` at the end. Wait for user verification before committing.

## Token-saving rules
- Never re-read whole workflow files to "understand style": copy the pattern documented in `PROJECT_STATE.md` (Frontend conventions).
- Use Grep for endpoint/schema lookups; read only the relevant router + schema file.
- Don't run the full build repeatedly; run lint+build once per part, tests once per sub-batch.
- Keep chat replies short; put long details in these files.
