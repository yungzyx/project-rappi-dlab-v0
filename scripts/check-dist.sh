#!/usr/bin/env bash
# make build deja prototipo-app/dist y dashboard-empresa/dist; esto revisa que no lleven rastros de desarrollo: la
# dirección de la API local (:8000, localhost) ni las instrucciones de `make mvp`. Sale con 1 si encuentra alguno.
set -euo pipefail
cd "$(dirname "$0")/.."

status=0
for dir in prototipo-app/dist dashboard-empresa/dist; do
  if [ ! -d "$dir" ]; then
    echo "check-dist: falta $dir; corre \`make build\` primero." >&2
    exit 1
  fi
  for pattern in ':8000' 'localhost' 'make mvp'; do
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
