#!/usr/bin/env bash
# Utilidades comunes de los scripts del devnet.
set -euo pipefail

DEVNET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCALNET_DIR="$DEVNET_DIR/localnet"
export LOCALNET_DIR
export LOCALNET_ENV_DIR="${LOCALNET_DIR}/env"

# Cargar variables propias.
set -a
# shellcheck disable=SC1091
source "$DEVNET_DIR/.env"
set +a

export PARTY_HINT="${PARTY_HINT:-asteria-1}"
export IMAGE_TAG="${IMAGE_TAG:-0.6.11}"
export DOCKER_NETWORK="${DOCKER_NETWORK:-asteria}"
export HOST="${HOST:-localhost}"
export APP_PROVIDER_JSON_PORT="${APP_PROVIDER_JSON_PORT:-3975}"
export APP_USER_JSON_PORT="${APP_USER_JSON_PORT:-2975}"
export AUTH_AUDIENCE="${AUTH_AUDIENCE:-https://canton.network.global}"
export LEDGER_USER="${LEDGER_USER:-ledger-api-user}"
export RESOURCE_CONSTRAINTS_ENABLED="${RESOURCE_CONSTRAINTS_ENABLED:-true}"

COMPOSE=(
  docker compose
  -f "$LOCALNET_DIR/compose.yaml"
)

# Limites de memoria y heap de los JVM. Sin esto, los cinco JVM del contenedor
# splice compiten por memoria y el contenedor se reinicia.
if [ "$RESOURCE_CONSTRAINTS_ENABLED" = "true" ]; then
  COMPOSE+=(-f "$LOCALNET_DIR/resource-constraints.yaml")
fi

COMPOSE+=(
  --env-file "$DEVNET_DIR/.env"
  --env-file "$LOCALNET_DIR/compose.env"
  --env-file "$LOCALNET_DIR/env/common.env"
  --profile app-provider
  --profile app-user
  --profile sv
)

compose() {
  "${COMPOSE[@]}" "$@"
}

# Genera un JWT HS256 con el secreto "unsafe" que usa LocalNet.
jwt() {
  local sub="${1:-$LEDGER_USER}"
  local aud="${2:-$AUTH_AUDIENCE}"
  local header payload signing signature
  header="$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | openssl base64 -A | tr '+/' '-_' | tr -d '=')"
  payload="$(printf '{"sub":"%s","aud":"%s"}' "$sub" "$aud" | openssl base64 -A | tr '+/' '-_' | tr -d '=')"
  signing="$header.$payload"
  signature="$(printf '%s' "$signing" | openssl dgst -sha256 -hmac 'unsafe' -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')"
  printf '%s.%s' "$signing" "$signature"
}

# GET autenticado contra el JSON API de un participante.
api_get() {
  local port="$1" path="$2" token="${3:-$(jwt)}"
  curl -sf -H "Authorization: Bearer $token" "http://$HOST:$port$path"
}

# Extrae un campo numerico de un JSON chico sin depender de jq.
json_number() {
  local field="$1"
  grep -oE "\"$field\"[[:space:]]*:[[:space:]]*[0-9]+" | grep -oE '[0-9]+' | head -1
}