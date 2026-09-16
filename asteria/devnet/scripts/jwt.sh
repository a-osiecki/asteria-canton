#!/usr/bin/env bash
# Imprime el token HS256 que espera LocalNet.
# Uso: jwt.sh [sub] [aud]
set -euo pipefail
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

jwt "${1:-$LEDGER_USER}" "${2:-$AUTH_AUDIENCE}"
echo