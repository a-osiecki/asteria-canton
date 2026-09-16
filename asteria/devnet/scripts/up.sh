#!/usr/bin/env bash
# Levanta los servicios core de LocalNet: postgres, canton y splice.
# Las UIs y la demo app de quickstart quedan afuera.
set -euo pipefail
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

echo ">>> Levantando postgres, canton y splice"
echo "    red:   $DOCKER_NETWORK"
echo "    party: $PARTY_HINT"
echo "    tag:   $IMAGE_TAG"

compose up -d postgres canton splice

echo
compose ps
echo
echo "La primera vez descarga las imagenes y tarda entre 10 y 20 minutos."
echo "Verificá el estado con scripts/status.sh"