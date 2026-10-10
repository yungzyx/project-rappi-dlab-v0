#!/usr/bin/env bash
# make mvp: levanta la API de rappi-ia (:8000), la app (:5174) y el panel (:5175) sobre la base real, en un solo
# comando, y avisa cuando responden. Ctrl-C detiene los tres.
# No descarga nada de rappi.cl: usa la base `rappi` que ya está en este Mac (ver docs/instalacion.md).
# Con LAN=1 la API y la app quedan en la red local (para el iPhone; sin autenticación: solo en una red de confianza).
# El panel pide sus datos a localhost:8000 (dashboard-empresa/src/lib/api.js): desde otro dispositivo no trae nada.
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/mvp-lib.sh
source scripts/mvp-lib.sh

IA=rappi-ia/.venv/bin/rappi-ia

need_command npm "instala Node (la versión de .nvmrc) o revisa tu PATH, y vuelve a correr \`make mvp\`."
need_command curl "viene con macOS; revisa tu PATH."
need_command lsof "viene con macOS; revisa tu PATH."
need_dir rappi-ia/.venv "corre \`make install\` en rappi-ia."
need_dir prototipo-app/node_modules "corre \`npm ci\` en prototipo-app."
need_dir dashboard-empresa/node_modules "corre \`npm ci\` en dashboard-empresa."
exit_if_missing
require_free_ports 8000 5174 5175

echo "Revisando la base…"
"$IA" doctor # imprime su propio mensaje; si la base no está lista, termina con 1 y el script se detiene
# Se niega a migrar la base real con migraciones de una rama sin fusionar (MIGRATE=1 lo fuerza; ver
# `rappi-ia check-migrations`); si se niega, termina con 1 y el script se detiene antes de migrar.
"$IA" check-migrations
make -s --no-print-directory -C rappi-ia migrate

if [ "${LAN:-}" = 1 ]; then
  SERVE=serve-lan
  HOST_FLAG=--host
else
  SERVE=serve
  HOST_FLAG=
fi

install_traps
start api make --no-print-directory -C rappi-ia "$SERVE"
start app npm --prefix prototipo-app run dev -- --port 5174 --strictPort $HOST_FLAG
start panel npm --prefix dashboard-empresa run dev -- --port 5175 --strictPort $HOST_FLAG

# Con los modelos locales la API tarda en arrancar (la primera vez descarga ~2,5 GB): sin límite de tiempo mientras siga
# viva, avisando cada 15 s. La app y el panel responden en un par de segundos.
wait_for_url "La API" http://localhost:8000/health 0 api "cargando modelos"
wait_for_url "La app" http://localhost:5174 30 app
wait_for_url "El panel" http://localhost:5175 30 panel
echo "MVP listo: app http://localhost:5174 · panel http://localhost:5175 · API http://localhost:8000/docs"
echo "Ctrl-C detiene los tres."

while all_alive; do sleep 1; done
fail "El proceso [$DEAD] se detuvo (mira su registro más arriba); detengo el resto."
