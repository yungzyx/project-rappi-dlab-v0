# Instalación y operación

Cómo montar el proyecto completo en un Mac (Apple Silicon, macOS con [Homebrew](https://brew.sh)) y dejarlo actualizándose solo cada semana. Para un servidor Linux con Docker, ver [despliegue.md](despliegue.md).

Después de clonar (paso 2), **todos los comandos parten de la raíz del repositorio**.

## Qué viaja por dónde

| Qué | Cómo llega |
|---|---|
| Código (scraper, rappi-ia, prototipo, panel, docs) | Este repositorio (privado): `gh repo clone` |
| Base de datos (catálogo, precios, menús, conceptos, embeddings) | Un respaldo de Postgres (`.dump`) hecho en otro equipo, o una descarga nueva. **No va al repositorio:** contiene datos de rappi.cl y de sus comercios, que se usan solo con fines de investigación y demostración |
| Configuración (`.env`) | Se crea sola desde `.env.example` al instalar. `ANTHROPIC_API_KEY` y `TYPESAFE_API_KEY` son opcionales y se agregan a mano en `rappi-ia/.env` |
| Modelo de IA (e5; ~1 GB) | Se descarga de Hugging Face la primera vez que se usa |
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
caffeinate -i make post-refresh           # purga, categorías nuevas con Jev (si está adoptado), conceptos, tarjetas del juego, embeddings, evaluación, datos simulados y capa de datos al día con la base, y otra purga
```

- **Tarjetas del juego:** `rappi-ia knowledge` (`make knowledge`; corre en `post-refresh`, después de `concepts`, y en `make mvp`, `make serve` y `make serve-lan`, después de migrar) carga las 108 tarjetas de `src/rappi_ia/game/knowledge.json` en `knowledge_cards` y sus ligas a conceptos (`card_concepts.toml`, revisadas una por una) en `knowledge_card_concepts`; las tarjetas que salen del archivo se borran. Sin ellas una ronda solo muestra «Aún no hay tarjetas»; como la API las carga al levantarse, eso pasa únicamente si se la arranca sin `make` (uvicorn directo). El progreso de cada persona (`game_state`) lo guarda la API.
- **τ:** `make post-refresh` también recalibra τ en `src/rappi_ia/eval/thresholds.json` (solo en verticales con negativas que dependen de τ; los demás conservan el suyo). Si cambia, revisar y hacer commit.
- **Evaluación:** el reporte queda en `data/eval/busqueda.md` (dentro de `rappi-ia/`).
- **Jev (opcional):** `post-refresh` corre primero `make jev-categorias` (Jev etiqueta las categorías nuevas) y `make eval` suma a Jev como juez, **solo** si `rappi-ia/.env` tiene `TYPESAFE_API_KEY` y el repositorio tiene `src/rappi_ia/eval/jev-adopcion.json` (lo crea el usuario tras el piloto). Sin la clave o sin ese archivo ambos pasos no hacen nada, lo dicen en una línea y terminan bien, así que no hace falta instalar ni configurar nada para el flujo de siempre. Cómo ponerlo en marcha: [jev.md](jev.md).
- **Memoria de los índices:** `make embed` (parte de `post-refresh`) construye un índice HNSW por vertical con 1 GB de `maintenance_work_mem`, solo durante esa transacción. Se ajusta con `HNSW_MAINTENANCE_WORK_MEM` en `rappi-ia/.env` (ver `.env.example`); bájalo si el equipo tiene poca memoria.

## 5. El MVP

```bash
(cd prototipo-app && npm ci)
(cd dashboard-empresa && npm ci)
make mvp                  # desde la raíz del repositorio
```

`make mvp` es la **demo local**: levanta la API (:8000), la app (:5174) y el panel (:5175) sobre la base `rappi`, con el registro de cada uno prefijado (`[api]`, `[app]`, `[panel]`). No es para un servidor: migra la base sin respaldo (en un servidor, ver [despliegue.md](despliegue.md)):

1. Revisa que estén instalados `rappi-ia/.venv` y los `node_modules` de la app y del panel, y que los puertos 8000, 5174 y 5175 estén libres. Si falta algo, dice qué comando correr.
2. Revisa la base con `rappi-ia doctor` (solo lectura): si Postgres no responde, si la base `rappi` no existe o si no tiene catálogo, explica qué falta (sección 3) y termina.
3. Revisa las migraciones pendientes (`rappi-ia check-migrations`, solo lectura). Las migraciones se registran por nombre de archivo: una de rama que se aplica y después se edita nunca se vuelve a aplicar. Por eso, si la base `rappi` tiene pendientes y el código no está en `origin/main`, se niega: lista las pendientes y dice cómo seguir, con una copia de la base (`createdb -T rappi rappi_staging` con la API detenida y `DATABASE_URL=postgresql:///rappi_staging make mvp`) o a sabiendas con `MIGRATE=1 make mvp`. `make serve` y `make serve-lan` hacen la misma revisión. Con otra base (como la copia) o sin pendientes no pregunta nada.
4. Aplica las migraciones pendientes (`make migrate` en `rappi-ia/`), carga las tarjetas del juego (`rappi-ia knowledge`: idempotente, lee el archivo del repo y no descarga nada, así el juego no abre vacío aunque no haya corrido `post-refresh`) y arranca los tres. Si el paso 3 se negó, el script ya terminó y no escribe nada en la base.
5. Cuando responden, imprime «MVP listo: app http://localhost:5174 · panel http://localhost:5175 · API http://localhost:8000/docs». La API tarda en quedar lista porque carga el modelo de texto: la primera vez lo descarga (~1 GB) y puede tardar varios minutos. Mientras siga viva el script la espera y avisa cada 15 s («[mvp] La API sigue arrancando (cargando modelos)…»); solo termina si el proceso se cae.

Ctrl-C detiene los tres; si uno se cae solo, detiene el resto. No descarga nada de rappi.cl.

**Desde un iPhone:** `make mvp LAN=1` abre la API, la app y el panel a la red local (`make serve-lan` y `--host`); cada uno busca la API en el host desde el que se abrió la página. Solo en una red de confianza: la API no tiene puerta de acceso (los datos de cada persona sí piden su token de sesión).

- La app busca la API en el mismo host desde el que se abrió (puerto 8000), así que no hace falta configurarla.
- Sirve en la wifi de casa (192.168.x, 10.x), con el hotspot del iPhone (el Mac queda en 172.20.10.x) y con el nombre Bonjour del Mac (`http://nombre-del-mac.local:5174`).
- macOS pide permiso de red la primera vez.

**Si aparece «Sin conexión con Mochi»:** la app no corre sin la API y no tiene respaldo local.

- ¿Está corriendo `make mvp`? Si no, levántalo desde la raíz.
- ¿La API terminó de cargar? Espera a «MVP listo» (o a «Application startup complete» en el registro `[api]`): la pantalla vuelve a probar sola cada 2 s y entra cuando responde; **Reintentar** prueba al instante.
- ¿Se abrió desde otro dispositivo? Entonces el MVP tiene que haberse levantado con `LAN=1`.
- ¿La API está en otro puerto o equipo? Crea `prototipo-app/.env.local` con `VITE_API_URL=http://localhost:8001` y reinicia la app.
- ¿La API se cayó? Mira el registro `[api]`: con Postgres caído responde 503.

**`make mvp-check`** recorre el MVP con Chrome (Playwright, usa el Google Chrome instalado) contra un catálogo de prueba **inventado**, sin tocar la base `rappi`. Siembra `rappi_ia_test` (`rappi-ia seed-demo`, que se niega con cualquier base que no termine en `_test`), levanta una API liviana en :8010 (con `GAME_MIN_ITEMS=1`, para que el catálogo chico alcance a armar desafíos), la app en :5184 y el panel en :5185 (que pide sus datos a esa API), y revisa:

1. **En línea:** la app abre en la Home, conectada (la primera visita muestra el aviso de privacidad y la prueba lo cierra).
2. **Compra:** Home → Grocery → la primera tienda → agregar un producto → carrito → pagar. En `rappi_ia_test` (solo lectura) queda un pedido `prototype` cuyas líneas son productos sembrados.
3. **Kit de Mochi:** «cerveza» en el buscador con Mochi muestra un grupo por vertical; el kit «Carrete» de la Home, agregado y pagado, deja un pedido con productos sembrados y al menos una `suggestion_accepted` con origen `agent-plan` en `app_events`.
4. **Juego:** abrir el juego desde el pasaporte y empezar una ronda en el Súper muestra como primer paso el primer dato que sirve `GET /game/cards?vertical=supermercado`; al darlo vuelta y seguir, `game_state` (solo lectura) guarda ese dato en `discovered`. Es el primer paso de una ronda, no la ronda entera.
5. **Dato del agente:** el chip «Algo dulce» del buscador trae en la respuesta de Mochi un «¿Sabías que…?» con su fuente.
6. **Panel:** abierto en «Uso del MVP» con la fuente del prototipo, muestra «Plan» con al menos una oferta aceptada (la del kit), al menos una tarjeta del juego (la de la ronda) y el rótulo «uso del MVP, pocas personas: no es evidencia», sin el aviso de datos guardados. Espera hasta 30 s a que la API ya cuente los eventos de las revisiones anteriores (la app los manda en lotes cada 5 s).
7. **Sin API:** al detener la API, la app muestra «Sin conexión con Mochi».

Mientras la API está en marcha, también falla ante un error de la página o de la consola o una respuesta 4xx/5xx (solo se ignoran las imágenes de prueba, que no existen). Termina con «MVP check: 7 de 7 bien» y no deja nada escuchando. Necesita libres los puertos 8010, 5184 y 5185. **Borra y vuelve a sembrar `rappi_ia_test`:** comparte con `make test` y `make contract` de `rappi-ia/` un candado (`.git/rappi-ia-test-db.lock`, en la carpeta común de git, así que también entre worktrees; fuera de git, `rappi-ia/.test-db.lock`), así que si otra prueba está corriendo sale de inmediato con «Otra prueba está usando rappi_ia_test»; si el proceso que lo tenía murió (kill -9, apagón), el siguiente comando toma el candado solo; si el aviso persiste y nada usa la base, el mensaje dice cómo borrarlo (`rm -rf` con la ruta del candado). Funciona igual en Linux (sin `lsof`; con `CHROME_PATH` o `PLAYWRIGHT_CHANNEL` se elige otro Chrome) y es el job `mvp-check` del CI (que sube capturas de las revisiones que fallen).

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
  - Si termina bien (o solo fallaron el respaldo o los restaurantes: códigos 3, 5 y 6 de `rappi refresh`, ver [rappi-scraper/README.md](../rappi-scraper/README.md)), `make post-refresh` de rappi-ia: purga (primero, para cumplir la retención aunque falle otro paso), categorías nuevas con Jev (solo con clave y adopción), conceptos, tarjetas del juego, embeddings, evaluación (con Jev como juez si está adoptado), datos simulados, capa de datos (`make layers`) y otra purga.
  - Nunca corren dos descargas a la vez: los comandos que descargan comparten el candado `rappi-scraper/data/scraper.lock`, que el sistema suelta aunque el proceso muera. Además, la tarea semanal tiene su propio candado, que se borra aunque la corten con una señal (Ctrl-C, cerrar la terminal).
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
  - «restaurantes sin actualizar»: falló el descubrimiento de restaurantes (p. ej. un sitemap caído); las tiendas, la búsqueda, el respaldo y la capa de IA sí se hicieron, y la semana siguiente se descubre de nuevo (si además falló el respaldo, la línea dice las dos cosas);
  - `exit=4` «detenida: posible bloqueo»: ver el punto siguiente;
  - un código distinto de 0: falló; el detalle está en `rappi-scraper/data/logs/launchd.err.log`.
- **Posible bloqueo:** si 20 requests seguidos son rechazados (403, 429, página de desafío) o 10 jobs seguidos fallan sin respuesta útil de rappi.cl (403, 429, red), la descarga se detiene, el reporte de la corrida lo marca con ⛔ y la corrida queda abierta, salvo si fue al descubrir: la próxima actualización la retoma. No hay que hacer nada salvo revisar el reporte. Si el ⛔ se repite semana tras semana con los mismos jobs, no es un bloqueo sino un error fijo de esos jobs (por ejemplo, rappi.cl cambió esas páginas): hay que revisar su error. Mientras tanto no se actualiza nada; después de unas semanas (4 intentos) esos jobs quedan fallidos y la corrida sigue.
- **Reportes:** la salida completa queda en `rappi-scraper/data/logs/launchd.*.log` y el reporte de calidad en `rappi-scraper/data/reports/`.
- **`rappi refresh` lanzado a mano:** `./scripts/despues-del-refresh.sh` en `rappi-ia/` espera a que termine y corre `make post-refresh`. A diferencia de la tarea semanal, recalibra τ en `thresholds.json`: si cambia, revisar y hacer commit.

## 7. Operación

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

## 8. Despliegue

En un servidor Linux (Docker Compose, Caddy con TLS y puerta de acceso, roles de base separados, respaldos fuera del equipo): [despliegue.md](despliegue.md).
