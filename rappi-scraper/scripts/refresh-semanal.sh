#!/bin/zsh
# Tarea semanal (launchd, domingos 03:00; ver `make schedule`): descarga y capa de IA, en orden.
#   1. rappi migrate (migraciones pendientes, p. ej. tras un git pull) y rappi refresh: tiendas, restaurantes,
#      búsqueda, reportes y respaldo.
#   2. Si rappi-ia está instalado al lado: conceptos, embeddings, evaluación, datos simulados y purga.
# La evaluación no guarda τ (eval/thresholds.json está en git: recalibrar es a mano, con `make eval`).
# Las opciones pasan a `rappi refresh`: tras `retry-failed`, `refresh-semanal.sh --resume-only` retoma solo lo reencolado.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/logs
# Una sola actualización a la vez. El candado es el PID de la tarea en curso: si ese proceso ya no existe
# (corte de luz) o es otro programa con el mismo PID, no cuenta.
LOCK=data/refresh-semanal.pid
if [[ -f $LOCK ]] && ps -p "$(<$LOCK)" -o command= 2>/dev/null | grep -q refresh-semanal; then
  echo "$(date '+%F %T') ya hay una actualización semanal en curso; se omite"
  exit 0
fi
if [[ -f $LOCK ]]; then  # candado de una ejecución que murió sin su trap (apagado, corte de luz)
  echo "$(date '+%F %T') interrumpida: la ejecución anterior no terminó (apagado o corte de luz)" \
    >> data/logs/ultimo-estado.txt
fi
echo $$ > $LOCK
# Una línea por ejecución en data/logs/ultimo-estado.txt (la muestra `make schedule-status`): un fallo del domingo no
# queda escondido en launchd.err.log.
nota=""
trap 'rc=$?; rm -f "$LOCK"; echo "$(date "+%F %T") exit=$rc${nota:+ ($nota)}" >> data/logs/ultimo-estado.txt' EXIT
# zsh no corre el trap EXIT si el script muere por una señal (Ctrl-C, launchctl bootout, cerrar la terminal):
# sin estos, el candado quedaba puesto.
trap 'rm -f "$LOCK"; exit 130' INT
trap 'rm -f "$LOCK"; exit 143' TERM
trap 'rm -f "$LOCK"; exit 129' HUP
if pgrep -f "rappi(_scraper)? (refresh|discover|scrape-)|post-refresh|embed-images" >/dev/null; then  # lanzada a mano
  echo "$(date '+%F %T') hay una descarga o una actualización de rappi-ia en curso; se omite"
  nota="omitida: había una descarga o una actualización en curso"
  exit 0
fi
# Antes de descargar: una migración pendiente haría fallar el refresh al final (tras un día de descarga), y el
# `migrate` de post-refresh nunca llegaría a correr.
.venv/bin/rappi migrate
# Código 3: todo terminó salvo el respaldo (quedan los anteriores). La capa de IA corre igual, pero queda anotado.
refresh_rc=0
caffeinate -i .venv/bin/rappi refresh "$@" || refresh_rc=$?
if (( refresh_rc == 3 )); then
  nota="respaldo fallido: se conservan los anteriores"
elif (( refresh_rc != 0 )); then
  exit $refresh_rc
fi
if [[ -x ../rappi-ia/.venv/bin/python ]]; then
  echo "$(date '+%F %T') refresh terminado: actualizando rappi-ia"
  caffeinate -i make -C ../rappi-ia post-refresh EVAL_ARGS=
fi
