# Instalación y operación

Cómo montar el proyecto completo en un Mac (Apple Silicon, macOS con [Homebrew](https://brew.sh)) y dejarlo actualizándose solo cada semana.

Después de clonar (paso 2), **todos los comandos parten de la raíz del repositorio**.

## Qué viaja por dónde

| Qué | Cómo llega |
|---|---|
| Código (scraper, rappi-ia, prototipo, docs) | Este repositorio (privado): `gh repo clone` |
| Base de datos (catálogo, precios, menús, conceptos, embeddings) | Un respaldo de Postgres (`.dump`) hecho en otro equipo, o una descarga nueva. **No va al repositorio:** contiene datos de rappi.cl y de sus comercios, que se usan solo con fines de investigación y demostración |
| Configuración (`.env`) | Se crea sola desde `.env.example` al instalar. `ANTHROPIC_API_KEY` es opcional y se agrega a mano |
| Modelos de IA (e5, CLIP, Whisper; ~2 GB) | Se descargan de Hugging Face la primera vez que se usan |
| `node_modules`, `.venv` | Se instalan con los comandos de abajo; no se copian entre equipos |

## 1. Requisitos

```bash
brew install git gh python@3.13 node
python3.13 --version   # 3.13.x (el `python3` de macOS es 3.9 y no sirve; los Makefiles usan python3.13)
node --version         # 22.22+ o 24.15+
gh auth login          # GitHub.com → HTTPS → "Authenticate Git with your GitHub credentials": Yes
```

## 2. Código

```bash
gh repo clone yungzyx/rappi-dlab
cd rappi-dlab
```

Si este equipo va a correr la actualización semanal, clona el repositorio **fuera** de Documentos, Escritorio y Descargas (por ejemplo, directamente en tu carpeta de usuario). macOS no deja que las tareas programadas (launchd) lean esas carpetas, y la actualización fallaría sin avisar.

## 3. Base de datos

```bash
cd rappi-scraper
make db        # Postgres 17 + pgvector (Homebrew), bases rappi y rappi_test
make install   # .venv del scraper y .env
```

`postgresql@17` no deja sus comandos (`psql`, `pg_restore`…) en el PATH. Para dejarlos siempre disponibles:

```bash
echo 'export PATH="$(brew --prefix)/opt/postgresql@17/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
```

**Desde un respaldo** (recomendado). En el equipo de origen, `make backup` en `rappi-scraper/` deja `data/backups/rappi_<fecha>.dump`. Cópialo a este equipo y, desde `rappi-scraper/`:

```bash
dropdb --if-exists rappi && createdb rappi
pg_restore --no-owner -d rappi ruta/al/rappi_<fecha>.dump
.venv/bin/rappi migrate    # migraciones nuevas, si las hay
.venv/bin/rappi status     # corridas y resumen por vertical
make test
```

**Opcional:** la restauración reconstruye los índices vectoriales (HNSW), y lo hace más rápido con más memoria de mantenimiento. Para darle 1 GB solo a esa sesión de Postgres, usa este `pg_restore` en lugar del de arriba:

```bash
PGOPTIONS='-c maintenance_work_mem=1GB' pg_restore --no-owner -d rappi ruta/al/rappi_<fecha>.dump
```

No cambia la configuración de Postgres. Si el equipo tiene poca memoria, usa un valor menor.

**Sin respaldo:** `.venv/bin/rappi migrate` crea las tablas y `.venv/bin/rappi refresh` descubre y descarga todo desde cero. Son días de descarga (la primera descarga completa tomó del 24 al 27-09-2026), porque va una página a la vez con pausas de 1,5–3 s. Se puede cortar y retomar con el mismo comando.

## 4. Capa de IA

```bash
cd rappi-ia
make install install-ml db-test migrate   # .venv, paquetes de los modelos (~1 GB), base de tests
make test
caffeinate -i make post-refresh           # purga, conceptos, embeddings, evaluación y datos simulados al día con la base
```

- **τ:** `make post-refresh` también recalibra τ en `src/rappi_ia/eval/thresholds.json` (solo en verticales con negativas que dependen de τ; los demás conservan el suyo). Si cambia, revisar y hacer commit.
- **Evaluación:** el reporte queda en `data/eval/busqueda.md` (dentro de `rappi-ia/`).
- **Memoria de los índices:** `make embed` (parte de `post-refresh`) construye un índice HNSW por vertical con 1 GB de `maintenance_work_mem`, solo durante esa transacción. Se ajusta con `HNSW_MAINTENANCE_WORK_MEM` en `rappi-ia/.env` (ver `.env.example`); bájalo si el equipo tiene poca memoria.

## 5. El MVP

```bash
(cd prototipo-app && npm ci)
(cd dashboard-empresa && npm ci)
make mvp                  # desde la raíz del repositorio
```

`make mvp` levanta la API (:8000), la app (:5174) y el panel (:5175) sobre la base `rappi`, con el registro de cada uno prefijado (`[api]`, `[app]`, `[panel]`):

1. Revisa que estén instalados `rappi-ia/.venv` y los `node_modules` de la app y del panel, y que los puertos 8000, 5174 y 5175 estén libres. Si falta algo, dice qué comando correr.
2. Revisa la base con `rappi-ia doctor` (solo lectura): si Postgres no responde, si la base `rappi` no existe o si no tiene catálogo, explica qué falta (sección 3) y termina.
3. Revisa las migraciones pendientes (`rappi-ia check-migrations`, solo lectura). Las migraciones se registran por nombre de archivo: una de rama que se aplica y después se edita nunca se vuelve a aplicar. Por eso, si la base `rappi` tiene pendientes y el código no está en `origin/main`, se niega: lista las pendientes y dice cómo seguir, con una copia de la base (`createdb -T rappi rappi_staging` con la API detenida y `DATABASE_URL=postgresql:///rappi_staging make mvp`) o a sabiendas con `MIGRATE=1 make mvp`. `make serve` y `make serve-lan` hacen la misma revisión. Con otra base (como la copia) o sin pendientes no pregunta nada.
4. Aplica las migraciones pendientes (`make migrate` en `rappi-ia/`) y arranca los tres.
5. Cuando responden, imprime «MVP listo: app http://localhost:5174 · panel http://localhost:5175 · API http://localhost:8000/docs». La API tarda en quedar lista porque carga los modelos: la primera vez los descarga (~2,5 GB) y puede tardar varios minutos. Mientras siga viva el script la espera y avisa cada 15 s («[mvp] La API sigue arrancando (cargando modelos)…»); solo termina si el proceso se cae.

Ctrl-C detiene los tres; si uno se cae solo, detiene el resto. No descarga nada de rappi.cl.

**Desde un iPhone:** `make mvp LAN=1` abre la API y la app a la red local (`make serve-lan` y `--host`). El panel pide sus datos a `localhost:8000` (fijo), así que desde otro dispositivo no trae nada: solo sirve en este equipo. Solo en una red de confianza: la API no tiene autenticación.

- La app busca la API en el mismo host desde el que se abrió (puerto 8000), así que no hace falta configurarla.
- Sirve en la wifi de casa (192.168.x, 10.x), con el hotspot del iPhone (el Mac queda en 172.20.10.x) y con el nombre Bonjour del Mac (`http://nombre-del-mac.local:5174`).
- macOS pide permiso de red la primera vez.

**Si aparece «Sin conexión con Mochi»:** la app no corre sin la API y no tiene respaldo local.

- ¿Está corriendo `make mvp`? Si no, levántalo desde la raíz.
- ¿La API terminó de cargar? Espera a «MVP listo» (o a «Application startup complete» en el registro `[api]`): la pantalla vuelve a probar sola cada 2 s y entra cuando responde; **Reintentar** prueba al instante.
- ¿Se abrió desde otro dispositivo? Entonces el MVP tiene que haberse levantado con `LAN=1`.
- ¿La API está en otro puerto o equipo? Crea `prototipo-app/.env.local` con `VITE_API_URL=http://localhost:8001` y reinicia la app.
- ¿La API se cayó? Mira el registro `[api]`: con Postgres caído responde 503.

**`make mvp-check`** recorre la app con Chrome (Playwright, usa el Google Chrome instalado) contra un catálogo de prueba **inventado**, sin tocar la base `rappi`. Siembra `rappi_ia_test` (`rappi-ia seed-demo`, que se niega con cualquier base que no termine en `_test`), levanta una API liviana en :8010 y la app en :5184, comprueba que la Home abre conectada, que una compra (Home → Grocery → la primera tienda → agregar un producto → carrito → pagar) llega a la API y queda en `rappi_ia_test` como un pedido `prototype` con productos sembrados (solo lectura) y que, al detener la API, aparece «Sin conexión con Mochi». Mientras la API está en marcha, también falla ante un error de la página o de la consola o una respuesta 4xx/5xx (solo se ignoran las imágenes de prueba, que no existen). Termina con «MVP check: 3 de 3 bien» y no deja nada escuchando. **Borra y vuelve a sembrar `rappi_ia_test`:** no lo corras junto con `make test` de `rappi-ia/`, que usa la misma base.

También: `make contract` en `rappi-ia/` reescribe las respuestas de ejemplo de la API que usa la app (`prototipo-app/src/api/fixtures/`; el CI falla si quedan desactualizadas), y `npm run screenshots` en `prototipo-app/` necesita el MVP corriendo y, como paga una compra, deja un pedido y sus eventos (`source = 'prototype'`) en la base real.

## 6. Actualización semanal

Va en **un solo** equipo: uno que quede siempre encendido. Programarla en dos equipos duplicaría las descargas sobre rappi.cl.

```bash
cd rappi-scraper
make schedule          # domingos 03:00: descarga y, al terminar, capa de IA
make schedule-status   # ¿está activa? ¿cómo terminó la última vez?
```

- **Qué corre:** `rappi-scraper/scripts/refresh-semanal.sh`.
  - Primero `rappi migrate` (las migraciones que haya traído un `git pull`) y `rappi refresh`: tiendas, restaurantes, búsqueda, reportes y respaldo en `data/backups/` (quedan los últimos 4).
  - Si termina bien (o solo falló el respaldo), `make post-refresh` de rappi-ia: purga (primero, para cumplir la retención aunque falle otro paso), conceptos, embeddings, evaluación, datos simulados y otra purga.
  - Nunca corren dos descargas a la vez: los comandos que descargan (y `make images`) comparten el candado `rappi-scraper/data/scraper.lock`, que el sistema suelta aunque el proceso muera. Además, la tarea semanal tiene su propio candado, que se borra aunque la corten con una señal (Ctrl-C, cerrar la terminal).
- **τ:** la evaluación semanal no guarda τ, porque `thresholds.json` está en el repositorio. Para recalibrar: `make eval` a mano en `rappi-ia/` y commit.
- **Dormido o apagado:** si a esa hora el equipo estaba **dormido**, la tarea corre al despertar; si estaba **apagado**, esa semana se salta. Por eso conviene:
  - que no se duerma (Ajustes del Sistema → Energía → evitar el reposo automático);
  - que se encienda solo tras un corte de luz (misma pantalla); `sudo pmset -a autorestart 1 sleep 0` deja ambas cosas;
  - que quede con la sesión iniciada, porque launchd corre la tarea en la sesión del usuario.
- **FileVault:** en el equipo de la tarea semanal se mantiene activo ([decisiones.md](decisiones.md#operación)). Tras un corte de luz el equipo se reenciende pero espera la clave: hasta escribirla no corren Postgres ni la tarea, y si pasa el domingo 03:00 esa semana se salta.
- **Después de cada semana:** `make schedule-status` debe mostrar `last exit code = 0`. En «Últimas ejecuciones» (sale de `rappi-scraper/data/logs/ultimo-estado.txt`) hay una línea por ejecución:
  - `exit=0`: terminó bien;
  - «omitida»: otra descarga estaba en curso;
  - «interrumpida»: la anterior se cortó (apagado, corte de luz) y se retoma en la etapa donde quedó, sin volver a bajar tiendas ya terminadas; si el corte fue después de las descargas (en la búsqueda, el respaldo o la capa de IA), `./scripts/refresh-semanal.sh --resume-only` termina esos pasos sin descargar de nuevo;
  - «respaldo fallido»: la descarga y la capa de IA terminaron, pero no hay respaldo nuevo (se conservan los anteriores); el error está en `launchd.err.log`, y «Respaldo más nuevo» muestra de cuándo es el último;
  - un código distinto de 0: falló; el detalle está en `rappi-scraper/data/logs/launchd.err.log`.
- **Posible bloqueo:** si 10 jobs seguidos fallan sin respuesta útil de rappi.cl (403, 429, red), la descarga se detiene, el reporte de la corrida lo marca con ⛔ y la corrida queda abierta: la próxima actualización la retoma. No hay que hacer nada salvo revisar el reporte. Si el ⛔ se repite semana tras semana con los mismos jobs, no es un bloqueo sino un error fijo de esos jobs (por ejemplo, rappi.cl cambió esas páginas): hay que revisar su error. Mientras tanto no se actualiza nada; después de unas semanas (4 intentos) esos jobs quedan fallidos y la corrida sigue.
- **Reportes:** la salida completa queda en `rappi-scraper/data/logs/launchd.*.log` y el reporte de calidad en `rappi-scraper/data/reports/`.
- **`rappi refresh` lanzado a mano:** `./scripts/despues-del-refresh.sh` en `rappi-ia/` espera a que termine y corre `make post-refresh`. A diferencia de la tarea semanal, recalibra τ en `thresholds.json`: si cambia, revisar y hacer commit.
- **Fotos:** `make images` en `rappi-ia/`, a mano (son decenas de miles de descargas). Toma el mismo candado que el scraper: si hay una descarga en curso, no arranca.

## Operación

- **Jobs fallidos en una corrida** (el reporte los lista; a veces Rappi entrega páginas incompletas por un rato):

  ```bash
  cd rappi-scraper
  .venv/bin/rappi retry-failed --kind stores
  .venv/bin/rappi retry-failed --kind restaurants
  ./scripts/refresh-semanal.sh --resume-only
  ```

  Con `--resume-only` el script retoma solo las corridas que `retry-failed` reabrió, arma la búsqueda, respalda y actualiza la capa de IA. Sin esa opción, si uno de los dos `retry-failed` no reencoló nada (no había fallidos o ya llevan 4 intentos), esa corrida sigue cerrada y el script empezaría una nueva: por ejemplo, volvería a bajar todos los restaurantes (unas 5,5 h). Así se recuperaron el 28-09-2026 los fallidos de la primera descarga completa; farmacia, por ejemplo, pasó de 5 a 13 tiendas descargadas.
- **Después de un `git pull`:** `make migrate` en `rappi-scraper/` (aplica las migraciones nuevas del scraper y de rappi-ia, que comparten historial). La tarea semanal también las aplica antes de descargar, y `make serve`, `make serve-lan` y `make refresh` también. `rappi refresh` y `rappi build-search` lanzados a mano no corren con migraciones pendientes: piden `rappi migrate`.
- **Respaldo a mano:** `make backup` en `rappi-scraper/`.
- **Mover la carpeta del proyecto** rompe los `.venv` (guardan rutas absolutas): recréalos con `make install` en `rappi-scraper/` y `make install install-ml` en `rappi-ia/`. No la muevas con una descarga en curso.
- **Ver la base desde otro equipo**, sin abrir Postgres a la red:
  - en el equipo de la base, activa Ajustes del Sistema → General → Compartir → **Sesión remota** (SSH);
  - en TablePlus, crea una conexión **Over SSH** con ese equipo como servidor y la base en `127.0.0.1:5432`, `rappi`;
  - como comando de inicio, `SET default_transaction_read_only = on;`.

  Consultas de ejemplo: [sql/](sql/).
