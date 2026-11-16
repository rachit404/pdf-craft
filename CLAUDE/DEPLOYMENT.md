# DEPLOYMENT — self-hosting on a Linux machine (target for Part 5)

Goal: fully local, private replacement for smallpdf / ilovepdf. Files never leave the machine; the app makes **zero** outbound requests.

## Target topology
```
Browser ──HTTPS──> Caddy (or nginx) ──> web (Next.js :3000) ──rewrite /api/backend/*──> api (FastAPI :8000, internal only)
                                                                         └── volume: /data (uploads, outputs, sqlite)
```
- Only the reverse proxy publishes a port. `api` is reachable only on the internal Docker network.
- Optional (recommended for real Word/PowerPoint→PDF fidelity; adds ~400 MB to the image → make it a build arg): LibreOffice (`libreoffice-writer`, `libreoffice-impress`, fonts) installed in the `api` image for high-fidelity DOCX/PPTX→PDF (decided in Part 2).

## Required changes before deploy (tracked in PLAN Part 5)
| Area | Change |
|---|---|
| Config | Backend URL for the Next rewrite read at runtime (e.g. `API_INTERNAL_URL`), not `NEXT_PUBLIC_*`. `PDF_CRAFT_STORAGE_DIR=/data`. `.env.example` only; real `.env` never committed. |
| Deps | Pinned `requirements.lock` (hashes optional); delete UTF-16 `req.txt`. `npm ci` with committed lockfile. |
| Auth | Single-user login (or proxy basic auth) — mandatory if reachable beyond localhost. Session cookie `HttpOnly; Secure; SameSite=Lax`. |
| Limits | Upload size caps (existing 25 MB PDF / 10 MB image; make env-configurable), request timeouts, rate limiting on conversion endpoints. |
| Storage | Retention job + purge command; outputs have unguessable uuid names (already true); `/outputs` and uploads behind auth. |
| Privacy | No telemetry; `NEXT_TELEMETRY_DISABLED=1`; logs exclude filenames/passwords; verify with egress-blocked run. |
| Hardening | Non-root containers, read-only root FS where possible, `tmpfs` for temp, security headers, CORS closed (same-origin via proxy). |
| Ops | `docker-compose.yml`, healthchecks (`/health`), systemd unit alternative, backup (`/data` tar) and restore notes, upgrade steps. |

## Verification checklist (end of Part 5)
- [ ] `docker compose up -d` on a clean Linux VM succeeds.
- [ ] `scripts/smoke.sh` passes for every V1 operation.
- [ ] Run with outbound traffic blocked (`--network` internal / firewall) → everything still works.
- [ ] Unauthenticated request to API/outputs is rejected.
- [ ] Retention job deletes expired files; purge command empties `/data`.
- [ ] HTTPS works (LAN: internal CA / Caddy `tls internal`; public: Let's Encrypt).

## Licensing note (before any commercial distribution)
PyMuPDF is AGPL-3.0 (commercial license available from Artifex); pikepdf is MPL-2.0 (QPDF Apache-2.0); LibreOffice (if added) is MPL-2.0. Fine for private self-hosting; review before distributing or offering as a service.

## Open questions for the user (answer before Part 5)
- Linux distro / CPU arch / RAM; Docker allowed or prefer systemd?
- Access scope: just you on LAN, or internet via domain/VPN (Tailscale/WireGuard recommended over open internet)?
- Single user or multiple accounts?
