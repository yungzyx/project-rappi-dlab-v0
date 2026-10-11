#!/usr/bin/env bash
# Corre un comando con el candado de la base de prueba: `with-test-db-lock.sh <comando>...`.
# `make test`, `make contract` y `make mvp-check` borran y vuelven a sembrar rappi_ia_test; si dos coinciden, fallan al
# azar. El candado es el directorio rappi-ia/.test-db.lock (mkdir es atómico en macOS y en Linux) con el pid de quien lo
# tiene: si ese proceso ya no existe (se mató con kill -9, se apagó el equipo), el candado se toma sin avisar.
set -euo pipefail

LOCK="$(cd "$(dirname "$0")/.." && pwd)/.test-db.lock"

busy() {
  echo "Otra prueba está usando rappi_ia_test; espera a que termine." >&2
  exit 1
}

if ! mkdir "$LOCK" 2>/dev/null; then
  owner=$(cat "$LOCK/pid" 2>/dev/null || true)
  # Sin pid todavía = quien lo tomó está justo escribiéndolo: se considera ocupado.
  if [ -z "$owner" ] || kill -0 "$owner" 2>/dev/null; then busy; fi
  rm -rf "$LOCK"
  mkdir "$LOCK" 2>/dev/null || busy
fi
echo "$$" >"$LOCK/pid"
trap 'rm -rf "$LOCK"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

"$@"
