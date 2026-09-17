#!/usr/bin/env bash
# Levanta las UIs de wallet (app-user y app-provider) detras de nginx.
# Requiere el core de scripts/up.sh. Uso: up-ui.sh [down]
set -euo pipefail
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

UI_USER_PORT="${APP_USER_UI_PORT:-2000}"
UI_PROVIDER_PORT="${APP_PROVIDER_UI_PORT:-3000}"
UI_SERVICES=(nginx wallet-web-ui-app-user wallet-web-ui-app-provider)

if [ "${1:-}" = "down" ]; then
  echo ">>> Deteniendo las UIs de wallet"
  compose stop "${UI_SERVICES[@]}"
  exit 0
fi

echo ">>> Levantando nginx y las wallets web"
compose up -d "${UI_SERVICES[@]}"

echo
compose ps "${UI_SERVICES[@]}"
echo
echo "Wallet app-user:     http://localhost:$UI_USER_PORT"
echo "Wallet app-provider: http://localhost:$UI_PROVIDER_PORT"
echo
echo "En Codespaces, abri esos puertos desde la pestana Ports."
echo "La primera carga puede tardar unos segundos hasta que arranca Next.js."
