#!/usr/bin/env bash
# Diagnostico del devnet: salud de los apps, errores y memoria.
set -uo pipefail
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

echo "=== Contenedores ==="
compose ps

echo
echo "=== Estado de splice ==="
docker inspect --format 'restarts={{.RestartCount}} status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} started={{.State.StartedAt}} finished={{.State.FinishedAt}}' splice 2>/dev/null || true
docker inspect --format 'entrypoint={{json .Config.Entrypoint}} cmd={{json .Config.Cmd}}' splice 2>/dev/null || true

echo
echo "=== Validator admin APIs (publicadas) ==="
for p in 2903 3903 4903; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:$p/api/validator/readyz" 2>/dev/null || echo "sin-respuesta")"
  echo "$p: $code"
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
echo "=== Ultimas 40 lineas de splice ==="
docker logs --tail 40 splice 2>&1

echo
echo "=== Errores de splice ==="
docker logs splice 2>&1 | grep -iE "ERROR|Exception|failed|refused|killed|shutdown|stopping" | tail -25

echo
echo "=== Errores de canton ==="
docker logs canton 2>&1 | grep -iE "ERROR|Exception|failed" | tail -15

echo
echo "=== OOM del kernel ==="
sudo dmesg 2>/dev/null | grep -iE "killed process|out of memory" | tail -5 || echo "sin datos"

echo
echo "=== Bases en postgres ==="
docker exec postgres psql -U cnadmin -d postgres -Atl 2>&1 | cut -d'|' -f1 | head -20

echo
echo "=== Memoria ==="
free -h
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}"