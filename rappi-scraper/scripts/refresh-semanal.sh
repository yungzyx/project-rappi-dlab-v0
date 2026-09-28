#!/bin/zsh
# Tarea semanal (launchd, domingos 03:00; ver `make schedule`): descarga y capa de IA, en orden.
#   1. rappi refresh: tiendas, restaurantes, búsqueda, reportes y respaldo.
#   2. Si rappi-ia está instalado al lado: conceptos, embeddings, evaluación, datos simulados y purga.
# La evaluación no guarda τ (eval/thresholds.json está en git: recalibrar es a mano, con `make eval`).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data
# Una sola actualización a la vez. El candado es el PID de la tarea en curso: si ese proceso ya no existe
# (corte de luz) o es otro programa con el mismo PID, no cuenta.
LOCK=data/refresh-semanal.pid
if [[ -f $LOCK ]] && ps -p "$(<$LOCK)" -o command= 2>/dev/null | grep -q refresh-semanal; then
  echo "$(date '+%F %T') ya hay una actualización semanal en curso; se omite"
  exit 0
fi
echo $$ > $LOCK
trap 'rm -f "$LOCK"' EXIT
# zsh no corre el trap EXIT si el script muere por una señal (Ctrl-C, launchctl bootout, cerrar la terminal):
# sin estos, el candado quedaba puesto.
trap 'rm -f "$LOCK"; exit 130' INT
trap 'rm -f "$LOCK"; exit 143' TERM
trap 'rm -f "$LOCK"; exit 129' HUP
if pgrep -f "rappi(_scraper)? refresh|post-refresh" >/dev/null; then  # una descarga o actualización lanzada a mano
  echo "$(date '+%F %T') hay una descarga o una actualización de rappi-ia en curso; se omite"
  exit 0
fi
caffeinate -i .venv/bin/rappi refresh
if [[ -x ../rappi-ia/.venv/bin/python ]]; then
  echo "$(date '+%F %T') refresh terminado: actualizando rappi-ia"
  caffeinate -i make -C ../rappi-ia post-refresh EVAL_ARGS=
fi
