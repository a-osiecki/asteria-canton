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

splice_healthy() {
  [ "$(docker inspect -f '{{.State.Health.Status}}' splice 2>/dev/null || echo "sin contenedor")" = "healthy" ]
}

wait_splice() {
  local timeout="$1" waited=0
  while [ "$waited" -lt "$timeout" ]; do
    if splice_healthy; then
      echo "splice: healthy (${waited}s)"
      return 0
    fi
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}

echo ">>> Levantando el core"
if ! "$SCRIPT_DIR/up.sh"; then
  echo "Aviso: up.sh fallo (tipico si canton o splice arrancaron antes que postgres); sigo con la recuperacion"
fi

echo
echo ">>> Esperando a que splice este healthy"
if ! wait_splice 60; then
  echo "splice sigue unhealthy; lo reinicio una vez"
  docker restart splice >/dev/null
  if ! wait_splice "$SPLICE_TIMEOUT"; then
    echo "splice no llego a healthy. Corré scripts/diagnose.sh" >&2
    exit 1
  fi
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
