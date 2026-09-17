#!/usr/bin/env bash
# Diagnostico del devnet: salud de los apps, errores y memoria.
set -uo pipefail
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

echo "=== Contenedores ==="
compose ps

echo
echo "=== Reinicios ==="
for c in canton splice postgres; do
  docker inspect --format "${c}: restarts={{.RestartCount}} status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}}" "$c" 2>/dev/null || true
done

echo
echo "=== Validator admin APIs (publicadas) ==="
for p in 2903 3903 4903; do
  code="$(curl -s -o /tmp/readyz-$p -w '%{http_code}' --max-time 5 "http://localhost:$p/api/validator/readyz" 2>/dev/null || echo "sin-respuesta")"
  body="$(tr -d '\n' < /tmp/readyz-$p 2>/dev/null | cut -c1-160)"
  echo "$p: $code $body"
done

echo
echo "=== Scan y SV (dentro del contenedor) ==="
echo -n "scan (5012): "
docker exec splice wget -qO- --timeout=5 http://localhost:5012/api/scan/readyz 2>&1 | head -c 160
echo
echo -n "sv   (5014): "
docker exec splice wget -qO- --timeout=5 http://localhost:5014/api/sv/readyz 2>&1 | head -c 160
echo

echo
echo "=== Errores de splice ==="
docker logs splice 2>&1 | grep -iE "ERROR|WARN|exception|failed|refused|timeout" | tail -30

echo
echo "=== Errores de canton ==="
docker logs canton 2>&1 | grep -iE "ERROR|WARN|exception|failed" | tail -20

echo
echo "=== Bases en postgres ==="
docker exec postgres psql -U cnadmin -d postgres -Atl 2>&1 | cut -d'|' -f1 | head -20

echo
echo "=== Memoria ==="
free -h
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"