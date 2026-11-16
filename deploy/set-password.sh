#!/usr/bin/env bash
# Changes the sign-in password and signs everyone out.
#   sudo bash deploy/set-password.sh

set -euo pipefail

APP_DIR=/opt/pdf-craft
ENV_FILE=/etc/pdf-craft/pdf-craft.env

[[ $EUID -eq 0 ]] || { echo "Run as root: sudo bash deploy/set-password.sh" >&2; exit 1; }
[[ -f $ENV_FILE ]] || { echo "PDF Craft is not installed ($ENV_FILE is missing)." >&2; exit 1; }

hash="$(cd "$APP_DIR/api" && "$APP_DIR/venv/bin/python" -m app.auth)"
secret="$("$APP_DIR/venv/bin/python" -c 'import secrets; print(secrets.token_urlsafe(48))')"

set_env() {
  if grep -q "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"
  fi
}

set_env PDF_CRAFT_PASSWORD_HASH "$hash"
set_env PDF_CRAFT_SECRET "$secret"  # a new secret invalidates every open session

systemctl restart pdf-craft-api
echo "Password changed. Everyone has been signed out."
