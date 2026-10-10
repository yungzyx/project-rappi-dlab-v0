#!/usr/bin/env bash
# make mvp-check: recorre la app con Chrome (Playwright) contra un catálogo de prueba inventado. No toca la base real:
# `rappi-ia seed-demo` solo siembra DATABASE_URL_TEST (rappi_ia_test), y la API de prueba corre en :8010, la app en :5184.
#   1. en línea: la app abre en la Home conectada;
#   2. compra: Home → Grocery → primera tienda → agregar un producto → carrito → pagar, y en rappi_ia_test (solo lectura)
#      queda un pedido `prototype` cuyas líneas son productos (o platos) sembrados;
#   3. kit de Mochi: «cerveza» en el buscador con Mochi (grupos por vertical) → plan «Carrete» en la Home → agregar el
#      kit → pagar, y en rappi_ia_test (solo lectura) el pedido tiene líneas sembradas y la persona dejó al menos una
#      `suggestion_accepted` con origen `mochi-plan`;
#   4. sin API: se detiene la API y la app muestra «Sin conexión con Mochi».
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

# El pedido de la compra: el último de la app (`prototype`; los `synthetic` son del generador) y los demás de la misma
# persona (un kit de varias verticales son varios pedidos), con todas sus líneas productos o platos sembrados (un kit
# puede traer un plato de restaurante). Con el argumento `kit`, además esa persona dejó al menos una
# `suggestion_accepted` con origen `mochi-plan` (app_events). Solo lee.
# Reintenta 5 s por si el pedido o los eventos tardan en quedar confirmados.
read -r -d '' CHECK_ORDER <<'PY' || true
import sys
import time

import psycopg
from rappi_ia.db import database_url

QUERY = """
SELECT o.order_id, o.vertical, o.user_id, count(*),
       count(*) FILTER (WHERE l.entity_type = 'catalog_item' AND EXISTS (
                                  SELECT 1 FROM catalog_items ci WHERE ci.master_product_id::text = l.entity_id)
                           OR l.entity_type = 'menu_item' AND EXISTS (
                                  SELECT 1 FROM menu_items mi WHERE mi.item_id::text = l.entity_id))
FROM app_orders o JOIN app_order_lines l USING (order_id)
WHERE o.source = 'prototype'
GROUP BY o.order_id, o.vertical, o.user_id, o.ts
ORDER BY o.ts DESC
"""
ACCEPTED = """
SELECT count(*) FROM app_events
WHERE user_id = %s AND type = 'suggestion_accepted' AND payload->>'origen' = 'mochi-plan'
"""
kit = sys.argv[1:] == ["kit"]

with psycopg.connect(database_url("DATABASE_URL_TEST"), autocommit=True) as conn:
    conn.read_only = True
    for _ in range(10):
        rows = conn.execute(QUERY).fetchall()
        accepted = conn.execute(ACCEPTED, (rows[0][2],)).fetchone()[0] if rows else 0
        if rows and (accepted or not kit):
            break
        time.sleep(0.5)

if not rows:
    sys.exit("  ✗ pedido: la base de prueba no tiene ningún pedido de la app (source = prototype)")
user = rows[0][2]
for order_id, vertical, _, lines, seeded in (row for row in rows if row[2] == user):
    if seeded != lines:
        sys.exit(f"  ✗ pedido: {order_id} tiene {lines} línea(s) y solo {seeded} son productos o platos sembrados")
    print(f"  ✓ pedido: {order_id} ({vertical}, {lines} línea(s), todas sembradas)")
if kit:
    if not accepted:
        sys.exit("  ✗ eventos: la persona del pedido no dejó ninguna suggestion_accepted con origen mochi-plan")
    print(f"  ✓ eventos: {accepted} suggestion_accepted con origen mochi-plan")
PY

echo "Sembrando el catálogo de prueba…"
"$IA" seed-demo # se niega si la base no termina en _test

install_traps
start api env RAPPI_IA_LIGHT=1 DATABASE_URL="$TEST_URL" "$IA_PY" -m uvicorn rappi_ia.api.app:app --host 127.0.0.1 --port 8010
start app env VITE_API_URL=http://localhost:8010 npm --prefix prototipo-app run dev -- --port 5184 --strictPort
wait_for_url "La API de prueba" http://localhost:8010/health 60 api
wait_for_url "La app" "$APP" 30 app

passed=0
total=4
if node "$CHECK" --app "$APP"; then passed=$((passed + 1)); fi
if node "$CHECK" --app "$APP" --shop && "$IA_PY" -c "$CHECK_ORDER"; then passed=$((passed + 1)); fi
if node "$CHECK" --app "$APP" --kit && "$IA_PY" -c "$CHECK_ORDER" kit; then passed=$((passed + 1)); fi
stop_one api
if node "$CHECK" --app "$APP" --expect-offline; then passed=$((passed + 1)); fi

echo "MVP check: $passed de $total bien"
if [ "$passed" != "$total" ]; then exit 1; fi
