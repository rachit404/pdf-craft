#!/usr/bin/env bash
# Removes the PDF Craft services and program files.
#   sudo bash deploy/uninstall.sh            keeps your settings and stored files
#   sudo bash deploy/uninstall.sh --purge    deletes those too, and the service account
#
# Caddy and any packages the installer added (python3-venv, caddy, LibreOffice)
# are left alone; remove them with apt if you no longer need them.

set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run as root: sudo bash deploy/uninstall.sh" >&2; exit 1; }

PURGE=0
[[ ${1:-} == --purge ]] && PURGE=1

systemctl disable --now pdf-craft-web pdf-craft-api 2>/dev/null || true
rm -f /etc/systemd/system/pdf-craft-api.service /etc/systemd/system/pdf-craft-web.service
systemctl daemon-reload

rm -rf /opt/pdf-craft

if [[ $PURGE -eq 1 ]]; then
  rm -rf /var/lib/pdf-craft /etc/pdf-craft
  userdel pdfcraft 2>/dev/null || true
  echo "Removed PDF Craft, its settings, stored files and service account."
else
  echo "Removed the program. Settings (/etc/pdf-craft) and files (/var/lib/pdf-craft) were kept."
fi

if grep -qs 'Managed by PDF Craft' /etc/caddy/Caddyfile; then
  echo "Your Caddyfile still routes to PDF Craft. Edit or remove /etc/caddy/Caddyfile, then: sudo systemctl reload caddy"
fi
