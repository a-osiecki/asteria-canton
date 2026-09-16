#!/usr/bin/env bash
# Detiene los contenedores del devnet sin borrar los volumenes.
set -euo pipefail
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

compose down