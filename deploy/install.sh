#!/usr/bin/env bash
# Installs (or updates) PDF Craft on this Linux machine as two systemd
# services, with an optional Caddy reverse proxy for HTTPS.
#
#   sudo bash deploy/install.sh --host pdf.home.lan
#
# Run it again after `git pull` to update. Your settings and files are kept.
# Tested layout: Debian/Ubuntu (apt). Other distributions: install the
# packages listed in docs/self-hosting.md yourself first; the script then
# skips apt and does the rest.

set -euo pipefail

APP_DIR=/opt/pdf-craft
STATE_DIR=/var/lib/pdf-craft
CONF_DIR=/etc/pdf-craft
ENV_FILE="$CONF_DIR/pdf-craft.env"
SERVICE_USER=pdfcraft
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

HOST=""
TLS_MODE=internal
USE_PROXY=1
WITH_LIBREOFFICE=0
ALLOW_NO_AUTH=0
WEB_PORT=3000

usage() {
  cat <<'USAGE'
Usage: sudo bash deploy/install.sh [options]

  --host NAME        Name or IP address people will type in the browser
                     (required unless --no-proxy), e.g. pdf.home.lan or 192.168.1.20
  --tls internal|auto
                     internal (default): Caddy makes its own certificate; you
                     trust its root certificate once on each device. Works for
                     LAN names and IP addresses.
                     auto: Let's Encrypt certificate for a public domain
                     (needs ports 80 and 443 reachable from the internet).
  --no-proxy         No Caddy and no HTTPS: the web app listens on all network
                     interfaces on --port. Only for a network you fully trust.
  --port N           Web port when using --no-proxy (default 3000).
  --with-libreoffice Install LibreOffice for accurate Word/PowerPoint to PDF.
  --allow-no-auth    Do not require a password (not recommended).
  -h, --help         Show this help.

Set PDF_CRAFT_NEW_PASSWORD in the environment to choose the password without
being prompted (for scripted installs).
USAGE
}

say()  { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARNING: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# Updating is just `git pull && sudo bash deploy/install.sh`: the options from
# the last install are remembered here and reused when none are given.
OPTIONS_FILE="$CONF_DIR/install.options"
if [[ $# -eq 0 && -f $OPTIONS_FILE ]]; then
  # shellcheck disable=SC1090
  source "$OPTIONS_FILE"
  echo "Reusing the options from the last install ($OPTIONS_FILE)."
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="${2:?--host needs a value}"; shift 2 ;;
    --tls) TLS_MODE="${2:?--tls needs a value}"; shift 2 ;;
    --no-proxy) USE_PROXY=0; shift ;;
    --port) WEB_PORT="${2:?--port needs a value}"; shift 2 ;;
    --with-libreoffice) WITH_LIBREOFFICE=1; shift ;;
    --allow-no-auth) ALLOW_NO_AUTH=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage; die "Unknown option: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "Run as root: sudo bash deploy/install.sh ..."
[[ $TLS_MODE == internal || $TLS_MODE == auto ]] || die "--tls must be internal or auto."
[[ $USE_PROXY -eq 0 || -n $HOST ]] || die "Give the address people will use: --host NAME_OR_IP (or --no-proxy)."
[[ -d $REPO_DIR/services/api/app && -d $REPO_DIR/apps/web ]] || die "Run this from a full clone of the repository."

HAVE_APT=0
command -v apt-get >/dev/null 2>&1 && HAVE_APT=1

# ---------------------------------------------------------
# 1. System packages and tool versions
# ---------------------------------------------------------
say "Checking system packages"

if [[ $HAVE_APT -eq 1 ]]; then
  packages=(python3 python3-venv rsync curl ca-certificates)
  [[ $USE_PROXY -eq 1 ]] && packages+=(caddy)
  [[ $WITH_LIBREOFFICE -eq 1 ]] && packages+=(libreoffice-writer libreoffice-impress fonts-liberation fonts-dejavu-core)
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "${packages[@]}"
else
  warn "apt-get not found: skipping package installation. See docs/self-hosting.md for what to install."
fi

for tool in python3 rsync runuser curl; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' is required but not installed."
done

python3 -c 'import sys; sys.exit(sys.version_info < (3, 11))' \
  || die "Python 3.11 or newer is required (found $(python3 --version)). Ubuntu 24.04 and Debian 12/13 include it."
python3 -c 'import ensurepip, venv' 2>/dev/null \
  || die "Python's venv module is missing. On Debian/Ubuntu: apt install python3-venv"

NODE="$(command -v node || true)"
if [[ -z $NODE ]] || ! "$NODE" -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>20||(a===20&&b>=9)?0:1)'; then
  cat >&2 <<'NODE_HELP'
ERROR: Node.js 20.9 or newer is required (and was not found).
Install it, then run this script again. On Debian/Ubuntu, using the official
NodeSource packages:

  sudo apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
  less /tmp/nodesource_setup.sh        # read it before running it
  sudo bash /tmp/nodesource_setup.sh
  sudo apt-get install -y nodejs

NODE_HELP
  exit 1
fi
command -v npm >/dev/null 2>&1 || die "npm is required (it normally comes with nodejs)."

# ---------------------------------------------------------
# 2. Service account and folders
# ---------------------------------------------------------
say "Preparing the service account and folders"

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$STATE_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0750 "$STATE_DIR" "$STATE_DIR/files" "$STATE_DIR/home"
install -d -o root -g "$SERVICE_USER" -m 0750 "$CONF_DIR"
install -d -o root -g root -m 0755 "$APP_DIR" "$APP_DIR/api"

{
  printf 'HOST=%q\nTLS_MODE=%q\nUSE_PROXY=%q\nWITH_LIBREOFFICE=%q\nWEB_PORT=%q\nALLOW_NO_AUTH=%q\n' \
    "$HOST" "$TLS_MODE" "$USE_PROXY" "$WITH_LIBREOFFICE" "$WEB_PORT" "$ALLOW_NO_AUTH"
} > "$OPTIONS_FILE"
chmod 0600 "$OPTIONS_FILE"

# ---------------------------------------------------------
# 3. Backend: code and Python environment
# ---------------------------------------------------------
say "Installing the backend"

rsync -a --delete \
  --exclude '__pycache__' --exclude '*.pyc' \
  "$REPO_DIR/services/api/app/" "$APP_DIR/api/app/"
install -m 0644 "$REPO_DIR/services/api/requirements.txt" "$REPO_DIR/services/api/constraints.txt" "$APP_DIR/api/"

[[ -x $APP_DIR/venv/bin/python ]] || python3 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install --quiet --disable-pip-version-check \
  -r "$APP_DIR/api/requirements.txt" -c "$APP_DIR/api/constraints.txt"
# The service cannot write into /opt, so compile the code ahead of time.
"$APP_DIR/venv/bin/python" -m compileall -q "$APP_DIR/api/app"

# ---------------------------------------------------------
# 4. Settings file (created once, never overwritten)
# ---------------------------------------------------------
say "Writing settings to $ENV_FILE"

if [[ ! -f $ENV_FILE ]]; then
  install -m 0640 -o root -g "$SERVICE_USER" "$REPO_DIR/deploy/pdf-craft.env.example" "$ENV_FILE"
fi

set_env() {  # set_env KEY VALUE: replace the line, or append it
  if grep -q "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"
  fi
}

get_env() { sed -n "s|^$1=||p" "$ENV_FILE" | head -n 1; }

if [[ -z $(get_env PDF_CRAFT_SECRET) ]]; then
  set_env PDF_CRAFT_SECRET "$("$APP_DIR/venv/bin/python" -c 'import secrets; print(secrets.token_urlsafe(48))')"
fi

if [[ $USE_PROXY -eq 1 ]]; then
  set_env HOSTNAME 127.0.0.1
  set_env PORT 3000
  set_env PDF_CRAFT_COOKIE_SECURE 1
else
  set_env HOSTNAME 0.0.0.0
  set_env PORT "$WEB_PORT"
  set_env PDF_CRAFT_COOKIE_SECURE 0
  warn "--no-proxy: traffic is NOT encrypted. Use it only on a network you trust."
fi

if [[ -z $(get_env PDF_CRAFT_PASSWORD_HASH) ]]; then
  if [[ -n ${PDF_CRAFT_NEW_PASSWORD:-} || -t 0 ]]; then
    say "Choose the password for signing in to PDF Craft"
    hash="$(cd "$APP_DIR/api" && "$APP_DIR/venv/bin/python" -m app.auth)" || die "No password was set."
    set_env PDF_CRAFT_PASSWORD_HASH "$hash"
  elif [[ $ALLOW_NO_AUTH -eq 1 ]]; then
    warn "No password set: anyone who can reach the site can use it."
  else
    die "No password set and no terminal to ask on. Set PDF_CRAFT_NEW_PASSWORD, or pass --allow-no-auth."
  fi
fi

# ---------------------------------------------------------
# 5. Web app: build, then keep only the small standalone server
# ---------------------------------------------------------
say "Building the web app (this takes a few minutes the first time)"

BUILD_DIR="$APP_DIR/build"
rm -rf "$BUILD_DIR"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" "$BUILD_DIR"
rsync -a \
  --exclude node_modules --exclude .next --exclude '.env*' --exclude next-env.d.ts \
  "$REPO_DIR/apps/web/" "$BUILD_DIR/"
chown -R "$SERVICE_USER:$SERVICE_USER" "$BUILD_DIR"

as_service() { runuser -u "$SERVICE_USER" -- env HOME="$STATE_DIR/home" NEXT_TELEMETRY_DISABLED=1 "$@"; }

( cd "$BUILD_DIR" \
  && as_service npm ci --no-audit --no-fund --loglevel=error \
  && as_service npm run build )

[[ -f $BUILD_DIR/.next/standalone/server.js ]] || die "The web build did not produce .next/standalone/server.js."

rm -rf "$APP_DIR/web.new"
cp -r "$BUILD_DIR/.next/standalone" "$APP_DIR/web.new"
cp -r "$BUILD_DIR/.next/static" "$APP_DIR/web.new/.next/static"
[[ -d $BUILD_DIR/public ]] && cp -r "$BUILD_DIR/public" "$APP_DIR/web.new/public"
rm -rf "$APP_DIR/web" "$BUILD_DIR" "$STATE_DIR/home/.npm"
mv "$APP_DIR/web.new" "$APP_DIR/web"
chown -R root:root "$APP_DIR/web" "$APP_DIR/api" "$APP_DIR/venv"
# Next.js may cache responses at run time.
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" "$APP_DIR/web/.next/cache"

# ---------------------------------------------------------
# 6. systemd services
# ---------------------------------------------------------
say "Installing the services"

if [[ $USE_PROXY -eq 1 ]]; then
  # The web server only talks to the local proxy: cut off everything else.
  NET_RULES=$'IPAddressDeny=any\nIPAddressAllow=localhost'
else
  NET_RULES=''
fi

render() {  # render TEMPLATE DESTINATION
  sed -e "s|@APP_DIR@|$APP_DIR|g" \
      -e "s|@STATE_DIR@|$STATE_DIR|g" \
      -e "s|@ENV_FILE@|$ENV_FILE|g" \
      -e "s|@SERVICE_USER@|$SERVICE_USER|g" \
      -e "s|@NODE@|$NODE|g" \
      "$1" > "$2"
}

render "$REPO_DIR/deploy/systemd/pdf-craft-api.service" /etc/systemd/system/pdf-craft-api.service
render "$REPO_DIR/deploy/systemd/pdf-craft-web.service" /etc/systemd/system/pdf-craft-web.service
# Insert the optional network rules (multi-line, so done outside sed).
python3 - "$NET_RULES" <<'PY'
import sys
path = "/etc/systemd/system/pdf-craft-web.service"
text = open(path).read().replace("@WEB_NET_RULES@", sys.argv[1])
open(path, "w").write(text)
PY

systemctl daemon-reload
systemctl enable pdf-craft-api pdf-craft-web >/dev/null
systemctl restart pdf-craft-api pdf-craft-web

# ---------------------------------------------------------
# 7. HTTPS reverse proxy
# ---------------------------------------------------------
if [[ $USE_PROXY -eq 1 ]]; then
  say "Configuring Caddy for $HOST"

  command -v caddy >/dev/null 2>&1 || die "Caddy is not installed. Install it (see docs/self-hosting.md) and run this script again."

  CADDYFILE=/etc/caddy/Caddyfile
  if [[ -f $CADDYFILE ]] && ! grep -q 'Managed by PDF Craft' "$CADDYFILE"; then
    cp "$CADDYFILE" "$CADDYFILE.before-pdf-craft"
    warn "Your existing Caddyfile was saved as $CADDYFILE.before-pdf-craft"
  fi

  tls_line=""
  [[ $TLS_MODE == internal ]] && tls_line="tls internal"
  sed -e "s|@SITE@|$HOST|g" -e "s|@TLS@|$tls_line|g" \
    "$REPO_DIR/deploy/Caddyfile.template" > "$CADDYFILE"

  caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null
  systemctl enable caddy >/dev/null
  systemctl restart caddy
fi

# ---------------------------------------------------------
# 8. Check that it came up
# ---------------------------------------------------------
say "Checking the services"

ok=0
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
[[ $ok -eq 1 ]] || { journalctl -u pdf-craft-api -n 30 --no-pager || true; die "The backend did not start. See the log above."; }

if [[ $USE_PROXY -eq 1 ]]; then
  url="https://$HOST"
else
  url="http://<this-machine>:$WEB_PORT"
fi

cat <<DONE

PDF Craft is running.

  Open:        $url
  Settings:    $ENV_FILE   (then: sudo systemctl restart pdf-craft-api pdf-craft-web)
  Logs:        sudo journalctl -u pdf-craft-api -f
  Self-test:   $APP_DIR/venv/bin/python $REPO_DIR/deploy/smoke_test.py $url --insecure --password '...'
DONE

if [[ $USE_PROXY -eq 1 && $TLS_MODE == internal ]]; then
  cat <<'CERT'

The first visit shows a certificate warning because the certificate comes
from this machine's own authority. To trust it, copy this file to each device
and add it to the system or browser certificate store:

  /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt
CERT
fi
