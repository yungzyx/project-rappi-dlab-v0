#!/usr/bin/env bash
# make build deja prototipo-app/dist y dashboard-empresa/dist; esto revisa que no lleven rastros de desarrollo.
# Sale con 1 si encuentra alguno. Qué revisa y por qué:
#  1. Siempre: la dirección de la API local (":8000", "localhost"). Un build de producción habla con "/api" (o con
#     VITE_API_URL); si aparecen, la app quedó apuntando al Mac de quien la construyó.
#  2. Salvo con VITE_DEMO=1: los textos de desarrollador y los controles de la demo. La app los deja detrás de
#     `import.meta.env.DEV || VITE_DEMO === '1'`, que Vite pliega al construir, así que en un build normal el código y
#     sus textos desaparecen del bundle: «make mvp», «make knowledge», «Levanta el MVP», «No pude conectar» (aviso de
#     ConnectionGate), «Tecla D» y «Modo de la demo» (interruptor). No se revisan «Modo demo» ni «Rappi hoy»: siguen en
#     el bundle porque la fila de Cuenta y las etiquetas se filtran en tiempo de ejecución.
#  Con VITE_DEMO=1 el grupo 2 se omite: ese build deja esos textos a propósito (la demo desplegada, ver docs/despliegue.md).
set -euo pipefail
cd "$(dirname "$0")/.."

always=(':8000' 'localhost')
dev_only=('make mvp' 'make knowledge' 'Levanta el MVP' 'No pude conectar' 'Tecla D' 'Modo de la demo')

patterns=("${always[@]}")
if [ "${VITE_DEMO:-}" = 1 ]; then
  echo "check-dist: VITE_DEMO=1, se omiten los textos de la demo."
else
  patterns+=("${dev_only[@]}")
fi

status=0
for dir in prototipo-app/dist dashboard-empresa/dist; do
  if [ ! -d "$dir" ]; then
    echo "check-dist: falta $dir; corre \`make build\` primero." >&2
    exit 1
  fi
  for pattern in "${patterns[@]}"; do
    if matches=$(grep -rIl -F -e "$pattern" "$dir"); then
      echo "check-dist: «$pattern» aparece en $dir:" >&2
      echo "$matches" | sed 's/^/  /' >&2
      status=1
    fi
  done
done

if [ "$status" = 0 ]; then
  echo "check-dist: prototipo-app/dist y dashboard-empresa/dist sin rastros de desarrollo."
fi
exit "$status"
