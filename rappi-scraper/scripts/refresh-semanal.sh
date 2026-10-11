#!/usr/bin/env bash
# La tarea de launchd instalada antes en el Mac mini lo llama con /bin/zsh: se vuelve a lanzar con bash.
if [ -n "${ZSH_VERSION:-}" ]; then exec /bin/bash "$0" "$@"; fi
# Tarea semanal (domingos 03:00): descarga y capa de IA, en orden. En macOS la programa launchd (`make schedule`); en
# un servidor Linux, el timer de systemd deploy/systemd/rappi-refresh.timer, dentro del contenedor jobs.
#   1. rappi migrate (migraciones pendientes, p. ej. tras un git pull) y rappi refresh: tiendas, restaurantes,
#      búsqueda, reportes y respaldo.
#   2. Si rappi-ia está instalado al lado: conceptos, embeddings, evaluación, datos simulados y purga.
# La evaluación no guarda τ (eval/thresholds.json está en git: recalibrar es a mano, con `make eval`).
# Las opciones pasan a `rappi refresh`: tras `retry-failed`, `refresh-semanal.sh --resume-only` retoma solo lo reencolado.
# Variables: RAPPI_BIN (por defecto .venv/bin/rappi), RAPPI_IA_PY (el python de rappi-ia, por defecto su .venv) y
# RAPPI_DATA_DIR (por defecto data/). Compatible con el bash 3.2 de macOS: sin mapfile ni arreglos asociativos.
set -euo pipefail
cd "$(dirname "$0")/.."
DATA=${RAPPI_DATA_DIR:-data}
LOGS=$DATA/logs
RAPPI_BIN=${RAPPI_BIN:-.venv/bin/rappi}
mkdir -p "$LOGS"
# caffeinate (macOS) evita que el Mac se duerma a mitad de la descarga; en Linux no existe ni hace falta.
AWAKE=()
if command -v caffeinate >/dev/null; then AWAKE=(caffeinate -i); fi

# launchd escribe siempre en los mismos dos archivos: pasados 10 MB quedan como .1 (pisando el .1 anterior).
for launchd_log in "$LOGS"/launchd.*.log; do
  if [ -f "$launchd_log" ] && [ "$(wc -c < "$launchd_log")" -gt 10485760 ]; then
    mv -f "$launchd_log" "$launchd_log.1"
  fi
done

# ¿El PID es una tarea semanal viva? (No el de esta misma: en un contenedor nuevo el script vuelve a ser el PID 1.)
weekly_running() {
  [ -n "$1" ] && [ "$1" != "$$" ] && kill -0 "$1" 2>/dev/null || return 1
  if command -v ps >/dev/null; then ps -p "$1" -o command= 2>/dev/null | grep -q refresh-semanal; fi
}
interrupted() {  # candado de una ejecución que murió sin su trap (apagado, corte de luz)
  echo "$(date '+%F %T') interrumpida: la ejecución anterior no terminó (apagado o corte de luz)" \
    >> "$LOGS/ultimo-estado.txt"
}
already_running() {
  echo "$(date '+%F %T') ya hay una actualización semanal en curso; se omite"
  exit 0
}

# Una sola actualización a la vez. El candado de antes era un archivo con el PID: el de una tarea antigua todavía en
# curso también cuenta; si su proceso ya no existe, se anota y se borra.
OLD_LOCK=$DATA/refresh-semanal.pid
if [ -f "$OLD_LOCK" ]; then
  if weekly_running "$(cat "$OLD_LOCK")"; then already_running; fi
  interrupted
  rm -f "$OLD_LOCK"
fi
# El candado es un directorio (mkdir es atómico) con el PID adentro: si ese proceso ya no existe o es otro programa con
# el mismo PID, quedó de una ejecución que murió y no cuenta.
LOCK=$DATA/refresh-semanal.lock
if ! mkdir "$LOCK" 2>/dev/null; then
  if weekly_running "$(cat "$LOCK/pid" 2>/dev/null || true)"; then already_running; fi
  interrupted
  rm -rf "$LOCK"
  mkdir "$LOCK" 2>/dev/null || already_running  # otra ejecución lo tomó en este mismo instante
fi
echo $$ > "$LOCK/pid"
# Una línea por ejecución en ultimo-estado.txt (la muestra `make schedule-status`): un fallo del domingo no queda
# escondido en launchd.err.log ni en el diario de systemd.
nota=""
finish() {
  local rc=$?
  rm -rf "$LOCK"
  echo "$(date '+%F %T') exit=$rc${nota:+ ($nota)}" >> "$LOGS/ultimo-estado.txt"
}
trap finish EXIT
# Con una señal (Ctrl-C, launchctl bootout, systemctl stop) sale con su código y el trap EXIT suelta el candado.
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
if command -v pgrep >/dev/null && pgrep -f "rappi(_scraper)? (refresh|discover|scrape-)|post-refresh" >/dev/null; then
  echo "$(date '+%F %T') hay una descarga o una actualización de rappi-ia en curso; se omite"  # lanzada a mano
  nota="omitida: había una descarga o una actualización en curso"
  exit 0
fi
# Antes de descargar: una migración pendiente haría fallar el refresh al final (tras un día de descarga), y el
# `migrate` de post-refresh nunca llegaría a correr.
"$RAPPI_BIN" migrate
# Código 3: todo terminó salvo el respaldo (quedan los anteriores). Código 5: los restaurantes no se actualizaron
# (tiendas, búsqueda y respaldo sí). Código 6: las dos cosas. En los tres la capa de IA corre igual, pero queda
# anotado. Código 4: posible bloqueo de rappi.cl; aquí se detiene.
refresh_rc=0
${AWAKE[@]+"${AWAKE[@]}"} "$RAPPI_BIN" refresh "$@" || refresh_rc=$?
if [ "$refresh_rc" -eq 3 ]; then
  nota="respaldo fallido: se conservan los anteriores"
elif [ "$refresh_rc" -eq 5 ]; then
  nota="restaurantes sin actualizar"
elif [ "$refresh_rc" -eq 6 ]; then
  nota="restaurantes sin actualizar; respaldo fallido: se conservan los anteriores"
elif [ "$refresh_rc" -eq 4 ]; then
  nota="detenida: posible bloqueo"
  exit "$refresh_rc"
elif [ "$refresh_rc" -ne 0 ]; then
  exit "$refresh_rc"
fi
# El python de rappi-ia: RAPPI_IA_PY (en el contenedor, el del sistema) o su .venv, si está instalado al lado.
if [ -n "${RAPPI_IA_PY:-}" ] || [ -x ../rappi-ia/.venv/bin/python ]; then
  echo "$(date '+%F %T') refresh terminado: actualizando rappi-ia"
  ${AWAKE[@]+"${AWAKE[@]}"} make -C ../rappi-ia post-refresh PY="${RAPPI_IA_PY:-.venv/bin/python}" EVAL_ARGS=
fi
