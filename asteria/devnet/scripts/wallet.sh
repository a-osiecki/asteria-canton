#!/usr/bin/env bash
# Wallets de LocalNet: estado, saldo, faucet y transferencia de Canton Coin.
# Uso: wallet.sh <status|balance|tap|preapproval|send> [...]
set -euo pipefail
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

VALIDATOR_ADMIN_API_PORT_SUFFIX="${VALIDATOR_ADMIN_API_PORT_SUFFIX:-903}"

wallet_names() {
  case "${1:-all}" in
    all) echo "app-user app-provider" ;;
    app-user | app-provider | sv) echo "$1" ;;
    *)
      echo "wallet desconocida: $1 (usar app-user, app-provider o sv)" >&2
      exit 1
      ;;
  esac
}

wallet_port() {
  case "$1" in
    app-user) echo "2${VALIDATOR_ADMIN_API_PORT_SUFFIX}" ;;
    app-provider) echo "3${VALIDATOR_ADMIN_API_PORT_SUFFIX}" ;;
    sv) echo "4${VALIDATOR_ADMIN_API_PORT_SUFFIX}" ;;
  esac
}

wallet_curl() {
  local wallet="$1" method="$2" path="$3" body="${4:-}"
  local args=(-s -X "$method" -H "Authorization: Bearer $(jwt "$wallet" "$AUTH_AUDIENCE")")
  if [ -n "$body" ]; then
    args+=(-H 'Content-Type: application/json' -d "$body")
  fi
  curl "${args[@]}" "http://$HOST:$(wallet_port "$wallet")/api/validator/v0/wallet$path"
}

# Extrae un campo string de un JSON chico sin depender de jq.
json_string() {
  local field="$1"
  grep -oE "\"$field\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/'
}

party_id() {
  wallet_curl "$1" GET /user-status | json_string party_id
}

cmd="${1:-}"
shift || true
case "$cmd" in
  status)
    for w in $(wallet_names "${1:-all}"); do
      echo "== $w =="
      wallet_curl "$w" GET /user-status
      echo
      wallet_curl "$w" GET /balance
      echo
    done
    ;;
  balance)
    for w in $(wallet_names "${1:-all}"); do
      printf '%s: ' "$w"
      wallet_curl "$w" GET /balance
      echo
    done
    ;;
  tap)
    amount="${2:-100.0}"
    for w in $(wallet_names "${1:-all}"); do
      printf 'tap %s (%s CC): ' "$w" "$amount"
      wallet_curl "$w" POST /tap "{\"amount\":\"$amount\"}"
      echo
    done
    ;;
  preapproval)
    w="${1:?falta la wallet (app-user, app-provider o sv)}"
    wallet_curl "$w" POST /transfer-preapproval
    echo
    ;;
  send)
    from="${1:?falta la wallet emisora}"
    to="${2:?falta la wallet receptora}"
    amount="${3:?falta el monto}"
    description="${4:-Asteria PoC}"
    receiver="$(party_id "$to")"
    dedup="asteria-${from}-${to}-$(date +%s)"
    body="{\"receiver_party_id\":\"$receiver\",\"amount\":\"$amount\",\"deduplication_id\":\"$dedup\",\"description\":\"$description\"}"
    wallet_curl "$from" POST /transfer-preapproval/send "$body"
    echo "Enviados $amount CC de $from a $to"
    ;;
  *)
    cat >&2 <<'EOF'
Uso: wallet.sh <comando> [...]
  status [wallet|all]              party, onboarding y saldo
  balance [wallet|all]             solo el saldo
  tap [wallet|all] [amount]        pide CC al faucet de LocalNet
  preapproval <wallet>             el receptor aprueba transferencias entrantes
  send <from> <to> <amount> [desc] transferencia via transfer-preapproval
EOF
    exit 1
    ;;
esac
