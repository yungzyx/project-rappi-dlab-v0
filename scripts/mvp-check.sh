#!/usr/bin/env bash
# make mvp-check: recorre la app con Chrome (Playwright) contra un catálogo de prueba inventado. No toca la base real:
# `rappi-ia seed-demo` solo siembra DATABASE_URL_TEST (rappi_ia_test), y la API de prueba corre en :8010, la app en :5184.
#   1. en línea: la app abre en la Home conectada;
#   2. sin API: se detiene la API y la app muestra «Sin conexión con Mochi».
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=scripts/mvp-lib.sh
source scripts/mvp-lib.sh

IA=rappi-ia/.venv/bin/rappi-ia
IA_PY=rappi-ia/.venv/bin/python
CHECK=prototipo-app/scripts/mvp-check.mjs
APP=http://localhost:5184

need_command node "instala Node (la versión de .nvmrc) o revisa tu PATH, y vuelve a correr \`make mvp-check\`."
need_command curl "viene con macOS; revisa tu PATH."
need_command lsof "viene con macOS; revisa tu PATH."
need_dir rappi-ia/.venv "corre \`make install\` en rappi-ia."
need_dir prototipo-app/node_modules "corre \`npm ci\` en prototipo-app."
exit_if_missing
require_free_ports 8010 5184

# La misma URL que usa seed-demo (rappi-ia/.env; una variable ya exportada gana). Nunca se imprime: puede traer la clave.
# Solo la variable que falta sale con 3; cualquier otro error (un .venv roto, por ejemplo) se deja ver tal cual.
READ_TEST_URL='import sys
from rappi_ia.db import database_url

try:
    print(database_url("DATABASE_URL_TEST"))
except RuntimeError:
    sys.exit(3)'
status=0
TEST_URL=$("$IA_PY" -c "$READ_TEST_URL") || status=$?
if [ "$status" = 3 ]; then
  fail "Falta DATABASE_URL_TEST en rappi-ia/.env (la base de tests; ver rappi-ia/.env.example)."
elif [ "$status" != 0 ]; then
  fail "No pude leer DATABASE_URL_TEST con $IA_PY (código $status): mira el error de arriba."
fi

echo "Sembrando el catálogo de prueba…"
"$IA" seed-demo # se niega si la base no termina en _test

install_traps
start api env RAPPI_IA_LIGHT=1 DATABASE_URL="$TEST_URL" "$IA_PY" -m uvicorn rappi_ia.api.app:app --host 127.0.0.1 --port 8010
start app env VITE_API_URL=http://localhost:8010 npm --prefix prototipo-app run dev -- --port 5184 --strictPort
wait_for_url "La API de prueba" http://localhost:8010/health 60 api
wait_for_url "La app" "$APP" 30 app

passed=0
total=2
if node "$CHECK" --app "$APP"; then passed=$((passed + 1)); fi
stop_one api
if node "$CHECK" --app "$APP" --expect-offline; then passed=$((passed + 1)); fi

echo "MVP check: $passed de $total bien"
if [ "$passed" != "$total" ]; then exit 1; fi
