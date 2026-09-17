#!/usr/bin/env bash
# Bootstrap del devnet en un comando.
# Por defecto arranca limpio: reset, core, DAR, UIs, wallets con CC y partida nueva.
# Uso: start.sh [--keep]   (--keep no resetea ni siembra; solo levanta y verifica)
set -euo pipefail
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$DEVNET_DIR/../cli"
KEEP=false
[ "${1:-}" = "--keep" ] && KEEP=true
SPLICE_TIMEOUT=600

if ! docker info >/dev/null 2>&1; then
  echo "Docker no responde. En Codespaces espera a que arranque el daemon." >&2
  exit 1
fi

if [ "$KEEP" = false ]; then
  echo ">>> Modo destructivo: reset del devnet (se borra el ledger, las wallets y la partida)"
  "$SCRIPT_DIR/reset.sh"
fi

"$SCRIPT_DIR/up.sh"

echo
echo ">>> Esperando a que splice este healthy (hasta ${SPLICE_TIMEOUT}s)"
waited=0
while [ "$waited" -lt "$SPLICE_TIMEOUT" ]; do
  status="$(docker inspect -f '{{.State.Health.Status}}' splice 2>/dev/null || echo "sin contenedor")"
  if [ "$status" = "healthy" ]; then
    echo "splice: healthy (${waited}s)"
    break
  fi
  sleep 5
  waited=$((waited + 5))
done
if [ "$status" != "healthy" ]; then
  echo "splice no llego a healthy en ${SPLICE_TIMEOUT}s. Corré scripts/diagnose.sh" >&2
  exit 1
fi

if [ "$KEEP" = false ]; then
  "$SCRIPT_DIR/bootstrap-dar.sh"
fi

"$SCRIPT_DIR/up-ui.sh"

if [ ! -f "$CLI_DIR/dist/index.js" ]; then
  echo
  echo ">>> Compilando el CLI"
  (cd "$CLI_DIR" && npm ci && npm run build)
fi

if [ "$KEEP" = false ]; then
  echo
  echo ">>> Fondeando wallets con el faucet y creando la partida"
  "$SCRIPT_DIR/wallet.sh" tap all
  "$SCRIPT_DIR/wallet.sh" preapproval app-user
  (cd "$CLI_DIR" && node dist/index.js init && node dist/index.js setup)
else
  echo
  echo ">>> Modo --keep: no se reseteo ni se sembro nada."
  echo "    Si la partida esta vacia, corré scripts/start.sh sin --keep."
fi

url_for() {
  local port="$1"
  local label="$2"
  local url="http://localhost:$port"
  if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
    url="https://${CODESPACE_NAME}-${port}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  fi
  printf '  %-22s %s\n' "$label" "$url"
}

echo
echo ">>> Listo. URLs:"
url_for "$APP_USER_JSON_PORT" "JSON API app-user"
url_for "$APP_PROVIDER_JSON_PORT" "JSON API app-provider"
url_for "${APP_USER_UI_PORT:-2001}" "Wallet app-user"
url_for "${APP_PROVIDER_UI_PORT:-3001}" "Wallet app-provider"
url_for "${EXPLORER_UI_PORT:-2002}" "Asteria Explorer"
if [ "$KEEP" = false ]; then
  echo
  echo ">>> Jugá con: cd asteria/cli && node dist/index.js play"
fi
