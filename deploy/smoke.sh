#!/usr/bin/env bash
# Prueba de humo del stack desplegado: deploy/smoke.sh https://el-dominio
# Revisa la puerta de acceso, la API lista (con la búsqueda semántica), las cabeceras de seguridad, que lo servido no
# apunte a :8000 ni cargue nada que la CSP bloquee, que rappi_api no pueda borrar tablas y que todo el stack esté sano.
# Sale con 0 o dice qué falló.
#
# Necesita la clave de la puerta en claro en BASIC_AUTH_PASSWORD (no se guarda en el servidor; se pasa a curl por la
# entrada estándar, nunca en la línea de comandos). El usuario sale de BASIC_AUTH_USER o del archivo de entorno.
# Corre desde cualquier carpeta, en el servidor (usa `docker compose`). Con un host localhost acepta la CA interna de
# Caddy (curl -k). COMPOSE cambia el comando de compose (por defecto, el de deploy/ con deploy/.env).
set -uo pipefail

url="${1:?Uso: deploy/smoke.sh https://el-dominio}"
url="${url%/}"
here="$(cd "$(dirname "$0")" && pwd)"
read -r -a compose <<<"${COMPOSE:-docker compose -f $here/docker-compose.yml}"

failures=()
fail() { failures+=("$1"); echo "  ✗ $1"; }
pass() { echo "  ✓ $1"; }

insecure=()
case "$url" in https://localhost* | https://127.0.0.1*) insecure=(-k) ;; esac

# Usuario de la puerta: el del entorno o el del contenedor de Caddy (que lo recibe del archivo de entorno).
user="${BASIC_AUTH_USER:-$("${compose[@]}" exec -T web printenv BASIC_AUTH_USER 2>/dev/null)}"
if [ -z "$user" ] || [ -z "${BASIC_AUTH_PASSWORD:-}" ]; then
  echo "smoke: falta BASIC_AUTH_PASSWORD (la clave de la puerta, en claro) o no se encontró BASIC_AUTH_USER." >&2
  exit 2
fi

# curl con credenciales: el usuario y la clave van en un archivo de configuración por la entrada estándar.
authed() { printf 'user = "%s:%s"\n' "$user" "$BASIC_AUTH_PASSWORD" | curl -sS ${insecure[@]+"${insecure[@]}"} -K - "$@"; }
anon() { curl -sS ${insecure[@]+"${insecure[@]}"} "$@"; }

echo "Puerta de acceso"
for path in / /api/health /panel/; do
  code=$(anon -o /dev/null -w '%{http_code}' "$url$path")
  if [ "$code" = 401 ]; then pass "$path sin credenciales: 401"; else fail "$path sin credenciales dio $code (se esperaba 401)"; fi
done

echo "API"
health=$(authed -w '\n%{http_code}' "$url/api/health")
code="${health##*$'\n'}"
body="${health%$'\n'*}"
if [ "$code" = 200 ] && grep -q '"busqueda_semantica":true' <<<"$body"; then
  pass "/api/health: 200 con búsqueda semántica"
else
  fail "/api/health dio $code sin la búsqueda semántica lista: $body"
fi

echo "Cabeceras"
headers=$(authed -o /dev/null -D - "$url/")
for header in "strict-transport-security: max-age=31536000" \
  "content-security-policy: default-src 'self'; img-src 'self' https://images.rappi.cl data:; connect-src 'self'; frame-ancestors 'none'" \
  "x-content-type-options: nosniff" "referrer-policy: no-referrer" "x-robots-tag: noindex, nofollow" \
  "permissions-policy: camera=(), microphone=(), geolocation=()" "cache-control: no-cache"; do
  if grep -qiF "$header" <<<"$headers"; then pass "${header%%:*}"; else fail "falta la cabecera «$header» en /"; fi
done
if grep -qi '^server:' <<<"$headers"; then fail "/ dice su servidor (cabecera Server)"; else pass "sin cabecera Server"; fi
api_headers=$(authed -o /dev/null -D - "$url/api/live")
if grep -qi '^server:' <<<"$api_headers"; then fail "/api/live dice su servidor (cabecera Server)"; else pass "/api sin cabecera Server"; fi
if grep -qi '^content-security-policy:' <<<"$api_headers"; then pass "/api con CSP"; else fail "/api sin CSP"; fi

echo "Lo servido"
index=$(authed "$url/")
assets=$(grep -oE '/assets/[^"]+\.(js|css)' <<<"$index" | sort -u)
if [ -z "$assets" ]; then
  fail "index.html no carga ningún archivo de /assets/"
else
  first=$(head -n 1 <<<"$assets")
  cache=$(authed -o /dev/null -D - "$url$first")
  if grep -qi 'cache-control: public, max-age=31536000, immutable' <<<"$cache"; then
    pass "/assets/ se guarda un año"
  else
    fail "$first sin Cache-Control inmutable"
  fi
fi
served="$index"
for asset in $assets; do served+=$'\n'$(authed "$url$asset"); done
if grep -qF ':8000' <<<"$served"; then fail "lo servido menciona :8000"; else pass "ningún :8000 en lo servido"; fi
# Lo que la CSP bloquearía en index.html: scripts en línea y scripts u hojas de estilo de otro origen.
if grep -oE '<script[^>]*>' <<<"$index" | grep -qv 'src='; then
  fail "index.html trae un script en línea (la CSP lo bloquea)"
else
  pass "sin scripts en línea"
fi
if grep -qE '<(script|link)[^>]+(src|href)="(https?:)?//' <<<"$index"; then
  fail "index.html carga scripts u hojas de estilo de otro origen (la CSP los bloquea)"
else
  pass "scripts y estilos del mismo origen"
fi

echo "Base"
# Como rappi_api, con su clave (dentro del contenedor de la base: no pasa por este equipo).
drop=$("${compose[@]}" exec -T db sh -c \
  'PGPASSWORD="$RAPPI_API_PASSWORD" psql -h 127.0.0.1 -U rappi_api -d "${POSTGRES_DB:-rappi}" -v ON_ERROR_STOP=1 -c "DROP TABLE app_events"' 2>&1)
if grep -q 'must be owner' <<<"$drop"; then
  pass "rappi_api no puede borrar app_events"
else
  fail "rappi_api y DROP TABLE app_events: $drop"
fi

echo "Stack"
ps=$("${compose[@]}" ps --format '{{.Service}} {{.Status}}')
if [ -z "$ps" ]; then
  fail "docker compose ps no muestra servicios"
else
  while read -r service status; do
    if [[ "$status" == *"(healthy)"* ]]; then pass "$service sano"; else fail "$service: $status"; fi
  done <<<"$ps"
fi

if [ "${#failures[@]}" -gt 0 ]; then
  echo "smoke: ${#failures[@]} problema(s):" >&2
  printf '  - %s\n' "${failures[@]}" >&2
  exit 1
fi
echo "smoke: todo bien."
