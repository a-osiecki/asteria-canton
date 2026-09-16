#!/usr/bin/env bash
# Detiene los contenedores y borra los volumenes. La proxima vez arranca limpio.
set -euo pipefail
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

compose down -v