#!/usr/bin/env bash
# Estado del devnet: contenedores, ledger-end y packages de cada participante.
set -euo pipefail
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

echo ">>> Contenedores"
compose ps

check_participant() {
  local nombre="$1" port="$2" token version end offset packages count
  echo
  echo "=== $nombre (JSON API ${HOST}:${port}) ==="
  token="$(jwt)"
  if ! version="$(api_get "$port" /v2/version "$token" 2>/dev/null)"; then
    echo "JSON API no responde todavia."
    return 0
  fi
  echo "version:    $(printf '%s' "$version" | tr -d '\n' | cut -c1-140)"
  end="$(api_get "$port" /v2/state/ledger-end "$token")"
  offset="$(printf '%s' "$end" | json_number offset)"
  echo "ledger-end: ${offset:-?}"
  packages="$(api_get "$port" /v2/packages "$token")"
  count="$(printf '%s' "$packages" | grep -oE '"[0-9a-f]{64}"' | wc -l | tr -d ' ')"
  echo "packages:   ${count:-0}"
  if printf '%s' "$packages" | grep -q "$PACKAGE_ID"; then
    echo "asteria:    presente"
  else
    echo "asteria:    ausente"
  fi
}

check_participant app-provider "$APP_PROVIDER_JSON_PORT"
check_participant app-user "$APP_USER_JSON_PORT"

echo
echo "=== Validators (puertos 3903 y 2903) ==="
for hp in 3903 2903; do
  if curl -sf --max-time 3 "http://$HOST:$hp/api/validator/readyz" >/dev/null 2>&1; then
    echo "${hp}: ok"
  else
    echo "${hp}: no accesible (normal si no lo expusiste en el firewall)"
  fi
done