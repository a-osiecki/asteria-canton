#!/usr/bin/env bash
# Sube el DAR de Asteria a los participantes de LocalNet.
# Uso: bootstrap-dar.sh [ruta-al-dar]
set -euo pipefail
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

DAR="${1:-$DEVNET_DIR/${DAR_RELATIVE}}"
if [ ! -f "$DAR" ]; then
  echo "No existe el DAR: $DAR" >&2
  echo "Compilalo con: cd asteria/daml/contracts && dpm build" >&2
  exit 1
fi

echo ">>> Subiendo DAR a los participantes"
for entry in "app-provider:${APP_PROVIDER_JSON_PORT}" "app-user:${APP_USER_JSON_PORT}"; do
  nombre="${entry%%:*}"
  port="${entry##*:}"
  token="$(jwt)"
  echo "--- ${nombre} (puerto ${port})"
  code="$(curl -s -o /tmp/asteria-dar-upload.out -w '%{http_code}' \
    -X POST "http://${HOST}:${port}/v2/packages" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@${DAR}")"
  if [ "$code" != "200" ] && [ "$code" != "201" ] && [ "$code" != "204" ]; then
    echo "Fallo la subida (HTTP ${code}): $(cat /tmp/asteria-dar-upload.out)" >&2
    exit 1
  fi
  echo "HTTP ${code}"
done

echo
echo ">>> Verificando el package ID ${PACKAGE_ID}"
for entry in "app-provider:${APP_PROVIDER_JSON_PORT}" "app-user:${APP_USER_JSON_PORT}"; do
  nombre="${entry%%:*}"
  port="${entry##*:}"
  token="$(jwt)"
  if api_get "$port" /v2/packages "$token" | grep -q "$PACKAGE_ID"; then
    echo "${nombre}: ok"
  else
    echo "${nombre}: el package no aparece" >&2
    exit 1
  fi
done