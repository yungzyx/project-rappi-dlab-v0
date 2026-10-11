# Calidad y despliegue del MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el MVP pueda correr en un servidor Linux como **demo cerrada**: detrás de una puerta de acceso (basic auth), con `noindex` y el aviso «demo no oficial» visible, porque abrirlo republicaría el catálogo descargado. La app y el panel se sirven construidos, la API va en el mismo origen bajo `/api` detrás de Caddy con TLS y cabeceras de seguridad; la API aguanta carga (pool, cupos, límites, tope de Claude), sabe quién es cada persona sin cuentas (id emitido por el servidor + token HMAC), migra como paso aparte con candado, y la tarea semanal, los respaldos fuera del equipo y la purga de 90 días corren en Linux. Todo funciona con valores de ejemplo y variables documentadas; los valores reales los pone el usuario. `make mvp` sigue siendo la demo local en macOS, sin cambios para quien la usa.

**Architecture:** un solo host con Docker Compose: `db` (pgvector:pg17, puerto sin publicar), `migrate` (una vez por despliegue: `rappi-ia deploy-migrate`), `api` (uvicorn, 1 worker, e5 dentro de la imagen, `HF_HUB_OFFLINE=1`), `web` (Caddy: TLS automático, basic auth, cabeceras, `dist/` de la app en `/`, panel opcional en `/panel/`, `/api/*` → `api:8000`) y `jobs` (perfil `jobs`: tarea semanal, respaldo nocturno y purga diaria, lanzados por timers de systemd del host). Dos roles de Postgres: `rappi_owner` (migraciones y tareas) y `rappi_api` (lectura del catálogo y escritura solo en las tablas de la app). Sin Kubernetes, sin base administrada, sin CDN.

**Tech Stack:** Docker + Compose v2, Caddy 2, Postgres 17 + pgvector, Python 3.13 (FastAPI, uvicorn, psycopg 3 + `psycopg-pool`), Node 24 (build), bash, systemd timers, restic (copia fuera del equipo); pytest, Vitest, Playwright; Archify.

**Spec:** sobre todo la revisión F (`scratchpad/revision/F-security-deploy.md`: hallazgos, tabla «Deployability gaps» y «Proposed deployment plan»), más los puntos de despliegue de A–E (ids como `A-C2` = revisión A, Crítico 2). Diseño: `docs/superpowers/specs/2026-10-10-mvp-integrado-design.md` (§6 «Reglas que no cambian»; §7 dejaba «despliegue en la nube» fuera del MVP: este plan es la etapa siguiente, sin cuentas ni pagos). **Requisito:** `2026-10-11-revision-integral.md` fusionado (scripts sin `lsof`, timeouts por clase con `SET LOCAL`, `mvp-check` en el CI, `forgetAll`, códigos de salida 4/5 del refresh).

## Global Constraints

- Todo lo que ve el usuario (CLI, logs, docs, textos de la app, mensajes de error) en español; código en inglés.
- Nunca escribir «Mochi» ni «chat» en código nuevo: el nombre visible sale de `config.AGENT_NAME` y de `prototipo-app/src/agent/name.js`. Los mensajes nuevos de error son neutros («Hay mucha gente ahora; intenta en unos segundos.»).
- Los datos descargados nunca van a git ni a una imagen: el catálogo vive en el volumen de la base y llega por un dump que copia el usuario. Nunca dos descargas a la vez contra rappi.cl: el candado de archivo más un candado de Postgres (Task 6); los timers se activan en **un solo** host.
- Datos de usuarios: solo `source = 'synthetic'` o `'prototype'`; métricas simuladas nunca como evidencia.
- Tests de integración solo contra `rappi_test` y `rappi_ia_test`. Antes de cerrar cada tarea: `make test` y `make lint` (rappi-ia, rappi-scraper), `npm test` y `npm run lint` (prototipo-app, dashboard-empresa), `make contract` sin diferencias, y `make mvp-check` → «7 de 7 bien» (no se agrega ni quita ningún chequeo).
- **Ningún secreto real en el repo**: todo por variables de entorno con valores de ejemplo (`cambiar-esto`) en `deploy/.env.example`; el archivo real vive fuera del repo (`/etc/rappi/rappi.env`, modo 0600). `git grep -nE "sk-ant-|BEGIN (RSA|OPENSSH)|password=[^c$]"` sin resultados al final de cada tarea.
- **Local intacto**: sin variables nuevas, `make mvp`, `make serve`, `make serve-lan` y `make mvp-check` se comportan como hoy en macOS. Las protecciones de producción se activan con `API_ENV=production`, que pone valores seguros por defecto.
- Las piezas marcadas **[USUARIO]** necesitan algo que solo el usuario tiene o decide (dominio, servidor, claves, destino de respaldos, decisiones de exposición). La implementación usa marcadores y lo deja escrito en `docs/despliegue.md` §0.
- Migraciones solo en `rappi-scraper/src/rappi_scraper/storage/migrations/` (la de este plan es `033_user_tokens.sql`), con `COMMENT` en español.

## Review Focus

1. **Puerta cerrada:** sin credenciales, `/`, `/api/health` y `/panel/` responden 401; con ellas, `X-Robots-Tag: noindex`, la CSP y el aviso «Demo no oficial» están presentes (Task 6, `deploy/smoke.sh`).
2. **Identidad firmada:** con mi token y el id de otra persona, `GET`/`DELETE /profile`, `GET`/`PUT /game/state`, `/events`, `/orders` y `/agent/*` → 403; sin token → 401; un id viejo se reclama una sola vez (Task 4).
3. **Carga y costo:** con `oha -c 100 -n 1000` contra `/agent/ask`, solo 200, 429 o 503; las conexiones de la API nunca pasan `API_POOL_MAX`; con `LLM_DAILY_CALL_CAP` alcanzado se usan plantillas (Task 2).
4. **Migrar es un paso aparte:** dos `migrate` a la vez no chocan; en producción la API nunca migra y `/health` da 503 con migraciones pendientes; `deploy-migrate` respalda antes (Task 5).
5. **Nada local se rompió y nada secreto entró:** `make mvp` en macOS sin `.env` nuevos y `make mvp-check` 7 de 7; ningún `.env` real ni dump en el árbol (`git status` limpio tras `docker compose build`).

---

### Task 1: Avisos de demo y configuración por entorno (app, panel y API)

Cierra **B-I4, B-I5, C-I1, C-M8, F-I2, F-I3, F-M5** y la parte visible de **F-C2** (la puerta es Task 6).

**Files:**
- Modify: `prototipo-app/src/api/client.js`, `prototipo-app/index.html`, `prototipo-app/src/components/ConnectionGate.jsx`, `prototipo-app/src/screens/game/Round.jsx`, `prototipo-app/src/components/DemoToggle.jsx`, `prototipo-app/src/state/DemoContext.jsx`, `prototipo-app/src/screens/home/` (pantalla de la Home), `dashboard-empresa/src/lib/api.js`, `dashboard-empresa/vite.config.js`, `dashboard-empresa/src/App.jsx` (enlace relativo a la presentación), `dashboard-empresa/index.html`, `rappi-ia/src/rappi_ia/config.py`, `rappi-ia/src/rappi_ia/api/app.py`, `Makefile` (raíz)
- Create: `prototipo-app/src/components/DemoDisclaimer.jsx`, `prototipo-app/public/robots.txt`, `dashboard-empresa/public/robots.txt`, `prototipo-app/.env.example`, `dashboard-empresa/.env.example`, `scripts/check-dist.sh`
- Test: `prototipo-app/src/api/client.test.js`, `prototipo-app/src/components/*.test.jsx`, `dashboard-empresa/src/lib/api.test.js`, `rappi-ia/tests/unit/test_cors.py`, nuevo `rappi-ia/tests/unit/test_api_env.py`

**Interfaces:**
- App y panel: `apiUrl(env, location) -> string` (función pura, exportada para test): `VITE_API_URL` sin barra final; si falta, en build de producción `'/api'` (mismo origen), en desarrollo `http://${location.hostname || 'localhost'}:8000` (el panel copia la lógica de la app: desde el iPhone con `LAN=1` ya funciona, C-I1).
- `VITE_DEMO`: el interruptor «Rappi hoy / Prototipo final», la tecla D y los textos para desarrolladores («make mvp», «make knowledge», la URL de la API) solo con `import.meta.env.DEV || VITE_DEMO === '1'`. En producción: «Sin conexión. Intenta de nuevo en un momento.». `event.key?.toLowerCase()` en `DemoContext`. **[USUARIO]** decide si la demo desplegada muestra el interruptor (`VITE_DEMO=1` en el build).
- Aviso visible: `DemoDisclaimer` fijo en la Home y en el pie del panel: «Demo no oficial · prototipo independiente, no afiliado a Rappi». `index.html` de las dos apps: `<title>` sin «Rappi» delante («Prototipo independiente con %AGENT_NAME%»), `apple-mobile-web-app-title` «Demo no oficial», `<meta name="robots" content="noindex, nofollow">`; `robots.txt` con `Disallow: /`.
- Panel bajo subruta: `base: process.env.PANEL_BASE ?? '/'` en `vite.config.js`; enlace `import.meta.env.BASE_URL + 'presentacion.html'`.
- API (`config.py`): `API_ENV` (`local` por defecto | `production`), `API_ENABLE_ANALYTICS` (por defecto `1` en local, `0` en producción), `API_DOCS` (igual). Con `API_ENV=production`: sin el regex de `localhost:51xx` ni `API_ALLOW_LAN`; los orígenes son exactamente `API_CORS_ORIGINS` (el beacon compara con esa lista). Con analíticas apagadas, el router `/analytics/*` no se monta (404); con docs apagadas, `docs_url`/`openapi_url=None`.
- Raíz: `make build` (`npm ci && npm run build` en las dos apps, con `VITE_API_URL` por defecto `/api`) y `scripts/check-dist.sh`, que falla si `dist/` contiene `:8000`, `localhost` o `make mvp`. La ayuda de `make mvp` dice «demo local con servidores de desarrollo; para un servidor, ver docs/despliegue.md».

- [ ] **Step 1: Tests que fallan.** `apiUrl en producción sin variable devuelve /api`, `apiUrl quita la barra final`, `el panel en desarrollo usa el host de la página` (`hostname = '10.0.0.5'`), `sin VITE_DEMO la tecla D no hace nada y no hay texto make mvp`, `keydown sin key no lanza`, `la Home muestra el aviso de demo no oficial`; rappi-ia: `test_production_rejects_localhost_origin`, `test_production_ignores_allow_lan`, `test_analytics_off_is_404`, `test_docs_off_is_404`, `test_beacon_accepts_configured_https_origin`.
- [ ] **Step 2: Implementar hasta verde.**
- [ ] **Step 3: Verificar** `make build && scripts/check-dist.sh` (sale 0); suites; `make mvp` en macOS sin `.env` nuevos abre como hoy; `make mvp-check` → «7 de 7 bien».
- [ ] **Step 4: Commit** `feat: configuración por entorno, aviso de demo no oficial y builds sin rastros de desarrollo`.

### Task 2: API bajo carga — pool, cupos, límites y tope de Claude

Cierra **F-C1, A-I1, A-I7, A-M3, A-M5**.

**Files:**
- Modify: `rappi-ia/pyproject.toml` y `rappi-ia/requirements.lock.txt` (`psycopg-pool`), `rappi-ia/src/rappi_ia/api/{deps,app,agent,game,catalog}.py`, `rappi-ia/src/rappi_ia/retrieval/hybrid.py` (`SET LOCAL`), `rappi-ia/src/rappi_ia/agent/compose.py`, `rappi-ia/src/rappi_ia/events/store.py`, `rappi-ia/src/rappi_ia/cli.py` (`purge`), `rappi-ia/src/rappi_ia/config.py`, `rappi-ia/.env.example`
- Create: `rappi-ia/src/rappi_ia/api/limits.py`, `rappi-ia/tests/unit/test_limits.py`, `rappi-ia/tests/integration/test_pool.py`

**Interfaces:**
- Pool: `ConnectionPool(conninfo, min_size=API_POOL_MIN=2, max_size=API_POOL_MAX=10, timeout=API_POOL_TIMEOUT_S=3, kwargs={"application_name": "rappi-ia-api"}, configure=…)` abierto y cerrado en `lifespan`; `configure` fija `idle_in_transaction_session_timeout = '10s'`. `get_conn`/`get_analytics_conn` (de la revisión integral) y `get_connector` salen del pool; `PoolTimeout` → 503 «Hay mucha gente ahora; intenta en unos segundos.». `/agent/ask` hace `commit` antes de redactar con el LLM. `SET LOCAL hnsw.ef_search` y `hnsw.iterative_scan` (A-M3).
- Cupos (`limits.py`): `concurrency_cap(name: str, limit: int)` → dependencia con `threading.BoundedSemaphore`, `acquire(blocking=False)`; lleno → 503 con `Retry-After: 2`. Se declara en `dependencies=[…]` de la ruta para que se resuelva **antes** de pedir conexión. Valores: `API_MAX_CONCURRENT_ASK=4`, `_SEARCH=8`, `_OFFER=4`, `_ORDERS=4`, `_ANALYTICS=2`.
- Tamaño de cuerpo: middleware ASGI `MaxBodySize(API_MAX_BODY_BYTES=524288)` (mismo tope que el beacon): por `Content-Length` y contando lo que llega → 413.
- Límite por IP (en proceso; válido con 1 worker, documentado): ventana deslizante, `API_RATE_PER_MIN=120` y `API_RATE_WRITE_PER_MIN=60` (POST/PUT/DELETE); 429 «Demasiadas solicitudes; espera un momento.» con `Retry-After`; memoria acotada (LRU de 10 000 IPs). La IP es `request.client.host`, correcta con `--proxy-headers` (Task 6).
- Tope de Claude: `LLM_DAILY_CALL_CAP=300` (0 = nunca llama) por proceso y por día de Santiago; alcanzado → plantilla y una sola línea de log «Tope diario de redacción con Claude alcanzado (N): se usan plantillas.».
- Escrituras anónimas (A-I7): `ensure_user` una vez por lote; `rappi-ia purge` también borra usuarios `prototype` sin actividad en `PROTOTYPE_USER_RETENTION_DAYS=180` (**[USUARIO]** confirma el número; queda en `docs/despliegue.md` §7). El tope de usuarios nuevos por IP está en Task 4.
- Beacon (A-M5): valida origen y tamaño antes de pedir conexión; la conexión se abre dentro de `_save_events`.

- [ ] **Step 1: Tests que fallan.** `test_limits.py`: `test_cap_full_returns_503_with_retry_after`, `test_cap_resolves_before_connection` (la dependencia de conexión no se llama), `test_body_over_limit_is_413`, `test_rate_limit_429_then_recovers`, `test_rate_limit_memory_is_bounded`, `test_llm_daily_cap_uses_template`, `test_beacon_bad_origin_opens_no_connection`. `test_pool.py`: `test_fifty_requests_stay_within_pool` (`pg_stat_activity` con `application_name='rappi-ia-api'` ≤ `API_POOL_MAX`), `test_set_local_does_not_leak_to_next_request`, `test_pool_timeout_is_503`, `test_record_ensures_user_once_per_batch`, `test_purge_removes_only_inactive_prototype_users` (los `synthetic` no se tocan).
- [ ] **Step 2: Implementar hasta verde.**
- [ ] **Step 3: Verificar** suites; en `rappi_staging` con la API local, `oha -c 100 -n 1000 -m POST -d '{"message":"una hamburguesa"}' http://localhost:8000/agent/ask` → solo 200/429/503 (cifras en el PR); `make mvp-check` → «7 de 7 bien».
- [ ] **Step 4: Commit** `feat: la API aguanta carga con pool, cupos, límites y tope de Claude`.

### Task 3: Salud, registros y errores sin datos de personas

Cierra **A-I8, A-I9, F-M1, F-M3**.

**Files:**
- Modify: `rappi-ia/src/rappi_ia/api/{app,services,game}.py`, `rappi-ia/Makefile` (`serve`, `serve-lan`: `--no-access-log`), `scripts/mvp.sh` y `scripts/mvp-check.sh` si esperan `/health` con otra forma, `prototipo-app/src/api/client.js` (`health()` acepta 503 como «sin conexión»)
- Create: `rappi-ia/src/rappi_ia/api/logs.py`, `rappi-ia/tests/unit/test_api_health_logs.py`

**Interfaces:**
- `GET /live` → `{"ok": true}` sin tocar la base (liveness del contenedor).
- `GET /health` (lo que ya usa la app) pasa a ser readiness: 200 con `{"ok": true, …}` si está lista; 503 con `{"ok": false, "motivos": [...]}` si la base no responde, hay 0 documentos, faltan migraciones o `API_REQUIRE_SEMANTIC=1` y falta la búsqueda semántica. `faltantes` y `motivos` son códigos (`busqueda_semantica`, `redaccion_llm`, `base`, `migraciones_pendientes`, `sin_documentos`), nunca texto de excepción ni rutas; el nombre del modelo solo con `API_ENV=local`.
- Errores: los `ValueError` que hoy se reflejan («El usuario X es de otra fuente», etc.) → 400 «Solicitud no válida» (el detalle va al log, sin el id).
- `logs.configure_logging(level=LOG_LEVEL)` en `lifespan`: formato `%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s`; middleware que pone `X-Request-ID` y escribe una línea de acceso con método, **plantilla de ruta** (`/profile/{user_id}`), estado y ms, sin query string ni ids; uvicorn con `--no-access-log` en todos los arranques; `invalid_data` registra la plantilla, no la ruta.

- [ ] **Step 1: Tests que fallan.** `test_live_without_db`, `test_health_503_when_db_down`, `test_health_503_light_mode_when_semantic_required`, `test_health_503_with_pending_migrations`, `test_health_has_no_exception_text`, `test_rappi_ia_info_logs_appear` (`caplog` con `rappi_ia.layers.segments`), `test_access_log_uses_route_template` (pedir `/profile/proto-abc?x=1`: el log tiene `/profile/{user_id}` y no `proto-abc`), `test_other_source_error_is_generic`; app: `health con 503 cuenta como sin conexión`.
- [ ] **Step 2: Implementar hasta verde.** `make contract` si cambia el ejemplo de `/health`.
- [ ] **Step 3: Verificar** suites; `make mvp-check` → «7 de 7 bien» (el chequeo 7, «sin API», sigue igual).
- [ ] **Step 4: Commit** `feat: salud lista o no lista, registros con hora y sin ids de personas`.

### Task 4: Identidad anónima firmada

Cierra **A-C2, F-I1** (y con ello el id en la URL de B-I8: un id que aparece en un log ya no basta).

**Files:**
- Create: `rappi-scraper/src/rappi_scraper/storage/migrations/033_user_tokens.sql`, `rappi-ia/src/rappi_ia/api/identity.py`, `rappi-ia/tests/unit/test_identity.py`, `rappi-ia/tests/integration/test_ownership.py`
- Modify: `rappi-ia/src/rappi_ia/api/{app,agent,game}.py`, `rappi-ia/src/rappi_ia/config.py`, `rappi-ia/src/rappi_ia/cli.py` (`rappi-ia token`), `rappi-ia/.gitignore` (si `data/` no cubre el secreto), `prototipo-app/src/api/{user,client,game,agent}.js`, `prototipo-app/src/state/forgetAll.js`, `prototipo-app/src/state/EventsContext.jsx` (beacon), fixtures de contrato (`make contract`), `rappi-ia/scripts/probar_agente.py` y `scripts/mvp-check.sh`/`mvp-check.mjs` si leen perfiles

**Interfaces:**
- Secreto: `API_SECRET` (≥ 32 bytes). Sin la variable, en local se crea una vez `rappi-ia/data/api-secret` (modo 0600, fuera de git); con `API_ENV=production` y sin la variable, la API no arranca: «Falta API_SECRET (ver docs/despliegue.md).». **[USUARIO]** genera el valor real con `openssl rand -hex 32`.
- `identity.sign(user_id) -> str` = `f"{user_id}.{b64url(hmac_sha256(secret, user_id))}"`; `identity.verify(token) -> str | None` (`hmac.compare_digest`); dependencia `current_user(request) -> str | None` desde la cabecera `X-User-Token`; `require_user(user_id, current)` → 401 «Falta la sesión» sin token, 403 «No autorizado» si no coincide.
- `POST /session` con `{"legacy_user_id": str | None}` → `{"user_id", "token"}`. Un id viejo se acepta solo si tiene el formato del prototipo, existe con `source='prototype'` y `token_issued_at IS NULL` (lo reclama una sola vez); si no, id nuevo `proto-` + 16 hex de `secrets`. Tope `API_NEW_USERS_PER_IP_DAY=20` → 429.
- `033_user_tokens.sql`: `app_users.token_issued_at timestamptz` con `COMMENT`.
- Rutas que exigen coincidencia: `GET`/`DELETE /profile/{user_id}`, `GET`/`PUT /game/state/{user_id}`, `/recommendations?user_id`, `POST /events` y `/orders` (`user_id` del cuerpo), `/agent/ask|offer|plans` cuando traen `user_id`. Sin `user_id` (frases de `make warm`) siguen anónimas. Las rutas no cambian de forma (menos cambios en el contrato).
- Beacon: `sendBeacon` no manda cabeceras, así que el token va en el cuerpo (`token`).
- `rappi-ia token <user_id>`: firma con el secreto local, para herramientas del operador.
- App: `user.js` guarda `rappi-proto-token`; la primera carga llama `/session` con el id viejo; `client.js` agrega `X-User-Token` a todo; ante 401 pide sesión nueva una vez; `forgetAll` borra el token y pide sesión nueva.

- [ ] **Step 1: Tests que fallan.** `test_identity.py`: `test_sign_verify_roundtrip`, `test_tampered_token_is_rejected`, `test_production_requires_api_secret`, `test_local_secret_file_is_0600_and_stable`. `test_ownership.py`: `test_delete_other_profile_is_403`, `test_put_other_game_state_is_403`, `test_get_other_recommendations_is_403`, `test_events_body_user_mismatch_is_403`, `test_missing_token_is_401`, `test_legacy_id_claimed_once`, `test_new_users_per_ip_cap_is_429`, `test_beacon_with_body_token`, `test_anonymous_ask_still_works`. App: `client manda X-User-Token`, `un 401 renueva la sesión una sola vez`, `la primera carga migra el id viejo`, `forgetAll pide una sesión nueva`.
- [ ] **Step 2: Implementar hasta verde.** `make contract` (nuevo ejemplo de `/session`).
- [ ] **Step 3: Verificar** suites; `make mvp-check` → «7 de 7 bien» (la compra, el kit y el juego pasan con token).
- [ ] **Step 4: Commit** `feat: identidad anónima firmada; un id ajeno ya no lee ni borra datos`.

### Task 5: Migrar es un paso del despliegue, con candado y respaldo

Cierra **D-I7, F-M9, C-I6**.

**Files:**
- Modify: `rappi-scraper/src/rappi_scraper/storage/db.py`, `rappi-ia/src/rappi_ia/db.py`, `rappi-ia/src/rappi_ia/cli.py` (`deploy-migrate`, `check-migrations`), `rappi-ia/src/rappi_ia/api/app.py` (nunca migra), `rappi-ia/Makefile` (`deploy-migrate`)
- Test: `rappi-scraper/tests/integration/test_migrate_lock.py` (nuevo), `rappi-ia/tests/integration/test_deploy_migrate.py` (nuevo)

**Interfaces:**
- `migrate(conn)`: `SELECT pg_advisory_lock(72000)` al empezar y `pg_advisory_unlock` al terminar; `SET lock_timeout = MIGRATE_LOCK_TIMEOUT` (`'10s'` por defecto); `schema_migrations` suma `checksum text` (`ADD COLUMN IF NOT EXISTS` en `db.py`, no es migración) con el md5 del archivo; filas viejas sin checksum se completan sin aviso. `check_migrations` avisa «La migración X cambió después de aplicarse» si el md5 no coincide. Docstring de `db.py`: los `CHECK` nuevos sobre tablas grandes van con `NOT VALID` + `VALIDATE CONSTRAINT`.
- `rappi-ia deploy-migrate [--sin-respaldo]`: si hay pendientes, primero `rappi backup` (falla → no migra), después `migrate`, `knowledge` y, si existe `DB_API_ROLE`, `deploy/db/grants.sql`. Imprime qué hizo. Es el comando del servicio `migrate` (Task 6).
- Con `API_ENV=production`, ni el arranque de la API ni ningún objetivo de servidor migran; `/health` da 503 `migraciones_pendientes` (Task 3). `make mvp`, `make serve` y `make serve-lan` siguen migrando en local (con su `check-migrations` de siempre).

- [ ] **Step 1: Tests que fallan.** `test_concurrent_migrate_applies_each_file_once` (dos hilos sobre `rappi_test`), `test_migration_behind_row_lock_fails_fast` (`LockNotAvailable` con una transacción abierta sobre `menu_items`), `test_checksum_mismatch_warns`, `test_deploy_migrate_backs_up_only_when_pending` (respaldo falso), `test_failed_backup_blocks_migration`, `test_production_start_does_not_migrate`.
- [ ] **Step 2: Implementar hasta verde.**
- [ ] **Step 3: Verificar** suites; `make mvp` local sigue migrando y arranca; `make mvp-check` → «7 de 7 bien».
- [ ] **Step 4: Commit** `feat: migraciones con candado y checksum, y deploy-migrate respalda antes`.

### Task 6: Contenedores, Caddy con TLS y puerta, roles de base

Cierra **F-C2, C-C1, F-I4, F-I5, F-I6, D-I5, F-M8**.

**Files:**
- Create: `deploy/Dockerfile.api` (objetivos `api` y `jobs`), `deploy/Dockerfile.web`, `deploy/Caddyfile`, `deploy/docker-compose.yml`, `deploy/.env.example`, `deploy/db/init-roles.sh`, `deploy/db/grants.sql`, `deploy/smoke.sh`, `.dockerignore`
- Modify: `rappi-scraper/src/rappi_scraper/config.py`, `rappi-scraper/src/rappi_scraper/lock.py`, `rappi-ia/src/rappi_ia/config.py`, `rappi-ia/src/rappi_ia/embeddings/models.py` (`revision`), `rappi-ia/Makefile` (`brew --prefix` solo si existe `brew`), `.github/workflows/ci.yml` (job `docker`), `rappi-scraper/.env.example`, `rappi-ia/.env.example`

**Interfaces:**
- Rutas independientes de dónde quedó el código (D-I5): `RAPPI_DATA_DIR` (scraper) y `RAPPI_IA_DATA_DIR` (rappi-ia), por defecto las de hoy; `.env` desde `RAPPI_ENV_FILE`, si no el de siempre. `download_lock()` además toma `pg_try_advisory_lock(72001)` en la base cuando hay `DATABASE_URL`: dos contenedores o dos hosts sobre la misma base no descargan a la vez («Ya hay una descarga en curso (en otro proceso o equipo).»).
- Modelo fijado (F-M8): `TEXT_EMBEDDING_REVISION` en `config.py` con el commit vigente de `intfloat/multilingual-e5-base` (se anota al implementar) y `revision=` al cargarlo.
- `Dockerfile.api`: `python:3.13-slim`, contexto = raíz del repo, torch desde `https://download.pytorch.org/whl/cpu`, instalación editable con `-c rappi-ia/requirements.lock.txt` de `rappi-scraper` y `rappi-ia[api,ml]`, modelo horneado en `HF_HOME=/opt/hf` (arg `BAKE_MODEL=1`; el CI construye con `0`), `HF_HUB_OFFLINE=1` en ejecución, usuario `rappi` (uid 10001). `CMD uvicorn rappi_ia.api.app:app --host 0.0.0.0 --port 8000 --workers ${API_WORKERS:-1} --proxy-headers --forwarded-allow-ips='*' --no-access-log` (aceptable porque el puerto de la API no se publica). Objetivo `jobs`: lo mismo + `postgresql-client-17` (PGDG), `bash`, `make`, `restic`.
- `Dockerfile.web`: etapa `node:24` (`npm ci && npm run build` con `VITE_API_URL=/api`, `VITE_DEMO` como arg; panel con `PANEL_BASE=/panel/` solo si `WITH_PANEL=1`), etapa `caddy:2` con los `dist/` y el `Caddyfile`; `scripts/check-dist.sh` corre en la etapa de build.
- `Caddyfile`: sitio `{$DOMAIN}` (con `DOMAIN=localhost` usa la CA interna para probar); `basic_auth` con `{$BASIC_AUTH_USER} {$BASIC_AUTH_HASH}` sobre **todo** (app, `/api/*`, `/panel/*`); `request_body { max_size 1MB }`; `handle_path /api/* { reverse_proxy api:8000 }`; `/panel/*` sirve el panel o 404 si no se construyó; cabeceras: `Strict-Transport-Security "max-age=31536000"`, `Content-Security-Policy "default-src 'self'; img-src 'self' https://images.rappi.cl data:; connect-src 'self'; frame-ancestors 'none'"`, `X-Content-Type-Options nosniff`, `Referrer-Policy no-referrer`, `X-Robots-Tag "noindex, nofollow"`, `Permissions-Policy "camera=(), microphone=(), geolocation=()"`, `-Server`; `/assets/*` con `Cache-Control "public, max-age=31536000, immutable"` e `index.html` con `no-cache`.
- `docker-compose.yml`: `db` (`pgvector/pgvector:pg17`, volumen `pgdata`, sin `ports`, `pg_isready`, `-c shared_buffers=1GB -c max_connections=50`, `init-roles.sh` en `/docker-entrypoint-initdb.d`); `migrate` (objetivo `jobs`, rol `rappi_owner`, `rappi-ia deploy-migrate`, `restart: "no"`); `api` (rol `rappi_api`, `depends_on` `migrate: service_completed_successfully` y `db: service_healthy`, healthcheck `curl -f localhost:8000/health` con `start_period: 120s`, `API_ENV=production`, `API_CORS_ORIGINS=https://${DOMAIN}`); `web` (puertos 80 y 443, volúmenes `caddy_data`/`caddy_config`); `jobs` (perfil `jobs`, rol `rappi_owner`, volúmenes `rappi-data` y `backups`). Todos con `env_file: ${RAPPI_ENV_FILE:-/etc/rappi/rappi.env}` y `logging: json-file` (`max-size: 10m`, `max-file: 5`).
- Roles (F-I6): `init-roles.sh` crea `rappi_owner` y `rappi_api` con claves desde `RAPPI_OWNER_PASSWORD`/`RAPPI_API_PASSWORD` (SCRAM); `grants.sql` (idempotente, lo corre `deploy-migrate`): `SELECT` en `public` y `capa`; `INSERT/UPDATE/DELETE` solo en `app_users`, `app_events`, `app_orders`, `app_order_lines`, `game_state`, `user_segments`, `user_segment_history`; `USAGE` de sus secuencias; `ALTER DEFAULT PRIVILEGES FOR ROLE rappi_owner GRANT SELECT ON TABLES TO rappi_api`.
- `deploy/.env.example`: `DOMAIN`, `BASIC_AUTH_USER`, `BASIC_AUTH_HASH` (con `caddy hash-password`), `POSTGRES_PASSWORD`, `RAPPI_OWNER_PASSWORD`, `RAPPI_API_PASSWORD`, `DATABASE_URL` por servicio, `API_SECRET`, `API_ENABLE_ANALYTICS=0`, `LLM_DAILY_CALL_CAP=300`, `ANTHROPIC_API_KEY=` (vacío: plantillas), `TYPESAFE_API_KEY=` (solo `jobs`), `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`; todos con `cambiar-esto` y una línea de qué es. **[USUARIO]**: dominio y DNS, servidor (mínimo 4 vCPU, 8 GB, 60 GB SSD), usuario y clave de la puerta, claves de base, `API_SECRET`, si se despliega el panel (`WITH_PANEL`, `API_ENABLE_ANALYTICS`).
- `deploy/smoke.sh <url>`: 401 sin credenciales en `/`, `/api/health` y `/panel/`; con credenciales `/api/health` 200 con `busqueda_semantica`; cabeceras presentes; ningún `:8000` en lo servido; `psql` como `rappi_api` no puede `DROP TABLE app_events`; `docker compose ps` todo `healthy`. Sale 0 o dice qué falló.

- [ ] **Step 1: Tests que fallan.** `test_data_dir_from_env` (scraper y rappi-ia), `test_env_file_from_env`, `test_download_lock_also_takes_pg_lock` (dos conexiones a `rappi_test`), `test_model_loaded_with_pinned_revision`; `deploy/smoke.sh` contra el stack con `DOMAIN=localhost` falla antes de existir el stack.
- [ ] **Step 2: Implementar.** `docker compose -f deploy/docker-compose.yml up -d` en este Mac (o una VM Linux) con `DOMAIN=localhost`, un dump de `rappi_staging` restaurado en el volumen y `deploy-migrate`.
- [ ] **Step 3: Verificar** `deploy/smoke.sh https://localhost` sale 0; con la red a huggingface.co cortada la API sigue lista; el recorrido de `mvp-check` hecho a mano en el navegador sobre el stack no deja violaciones de CSP en la consola; `pgrep -f vite` vacío; el job `docker` del CI en verde; `git status` limpio (ningún `.env` ni dump); `make mvp-check` local → «7 de 7 bien».
- [ ] **Step 4: Commit** `feat: contenedores, Caddy con TLS y puerta de acceso, roles de base separados`.

### Task 7: Tarea semanal en Linux, respaldos fuera del equipo y purga diaria

Cierra **D-C2, F-I7, D-M8**.

**Files:**
- Modify: `rappi-scraper/scripts/refresh-semanal.sh`, `rappi-ia/scripts/despues-del-refresh.sh`, `rappi-scraper/scripts/launchd/cl.rappi.refresh.plist.template` (llama a bash), `rappi-scraper/Makefile` (`schedule` en Linux remite a `deploy/systemd`), `rappi-scraper/src/rappi_scraper/cli.py` (`_setup_logging` poda), `rappi-scraper/tests/unit/test_weekly_script.py`
- Create: `deploy/systemd/rappi-refresh.service`, `deploy/systemd/rappi-refresh.timer`, `deploy/systemd/rappi-daily.service`, `deploy/systemd/rappi-daily.timer`, `deploy/scripts/backup-nightly.sh`, `deploy/scripts/restore-check.sh`, `rappi-scraper/tests/unit/test_deploy_scripts.py`

**Interfaces:**
- `refresh-semanal.sh`: `#!/usr/bin/env bash`, sin sintaxis de zsh; `AWAKE=(); command -v caffeinate >/dev/null && AWAKE=(caffeinate -i)`; candado con `mkdir "$DATA/refresh-semanal.lock"` (atómico, sin dependencias) y el PID adentro para detectar uno abandonado; respeta `RAPPI_BIN` (por defecto `.venv/bin/rappi`) y `RAPPI_IA_PY` para `make -C ../rappi-ia post-refresh PY=…`; conserva los códigos 3, 4 y 5 y la línea de `ultimo-estado.txt`; rota `launchd.*.log` de más de 10 MB (`mv` a `.1`). Lo mismo para `despues-del-refresh.sh`.
- Poda de registros (D-M8): `_setup_logging` borra `data/logs/*_*.log` con más de `LOG_RETENTION_WEEKS=8` semanas.
- systemd: `rappi-refresh.timer` (`OnCalendar=Sun 03:00 America/Santiago`, `Persistent=true`) → `docker compose --profile jobs run --rm jobs bash rappi-scraper/scripts/refresh-semanal.sh`, `TimeoutStartSec=infinity`; `rappi-daily.timer` (todos los días 04:00) → `rappi-ia purge` y `deploy/scripts/backup-nightly.sh`, **independientes** de la descarga. Se instalan con `systemctl enable --now` (paso del runbook). `make schedule` en macOS no cambia.
- `backup-nightly.sh`: `pg_dump -Fc` con `PGPASSFILE` temporal (0600, borrado en un `trap`), nunca la clave en argv; revisa con `pg_restore --list`; deja 3 locales en el volumen `backups`; `restic backup` y `restic forget --keep-daily 7 --keep-weekly 4 --prune`. Sin `RESTIC_REPOSITORY`: respalda local, avisa «Sin copia fuera del equipo: define RESTIC_REPOSITORY (docs/despliegue.md).» y sale 2.
- `restore-check.sh`: restaura el último dump en `rappi_restore_check`, corre `rappi-ia doctor` contra ella y la elimina (es una copia de prueba). Mensual, a mano (runbook).
- **[USUARIO]**: destino y clave de restic (S3, B2 o SFTP); y antes de activar `rappi-refresh.timer` en el servidor, decidir el User-Agent y robots.txt (nota de D-I1) y aceptar el riesgo de que rappi.cl frene una IP de datacenter. Mientras tanto la descarga sigue en el Mac mini y el timer del servidor queda sin activar.

- [ ] **Step 1: Tests que fallan.** `test_weekly_script.py` corre con bash y **sin** `caffeinate` falso: `test_runs_without_caffeinate_exit0`, `test_lock_dir_blocks_second_run`, `test_stale_lock_is_recovered`, `test_exit_codes_3_4_5_noted`, `test_big_launchd_log_rotated`; `test_old_logs_are_pruned`; `test_deploy_scripts.py` con `pg_dump`/`restic` falsos en el `PATH`: `test_backup_uses_passfile_not_argv`, `test_backup_without_restic_warns_and_exits_2`, `test_backup_keeps_three_local`.
- [ ] **Step 2: Implementar hasta verde.** `systemd-analyze verify deploy/systemd/*.service` en Linux (o en el contenedor `jobs`).
- [ ] **Step 3: Verificar** en el stack de Task 6: `docker compose --profile jobs run --rm jobs bash rappi-scraper/scripts/refresh-semanal.sh --resume-only` termina y deja `exit=0` en `ultimo-estado.txt` (sin trabajos pendientes no descarga nada); `backup-nightly.sh` + `restore-check.sh` pasan; después de `rappi-ia purge`, `SELECT count(*) FROM app_events WHERE query IS NOT NULL AND ts < now() - interval '90 days'` da 0; el CI corre `test_weekly_script.py` en Ubuntu.
- [ ] **Step 4: Commit** `feat: tarea semanal portable a Linux, respaldo nocturno fuera del equipo y purga diaria`.

### Task 8: Runbook del despliegue y documentación

Cierra **E-C1, E-I13**.

**Files:**
- Create: `docs/despliegue.md`, `docs/diagramas-fuente/despliegue.json` (y su HTML/PNG con Archify)
- Modify: `docs/instalacion.md` (§7 «Despliegue» de una línea que apunta al runbook; §5 aclara que `make mvp` es la demo local), `docs/README.md` (fila «Desplegar el MVP en un servidor»), `docs/decisiones.md` (fila del día: demo cerrada con puerta; mismo origen; identidad firmada; 1 worker; respaldos con restic; descarga en el Mac mini hasta la decisión del usuario), `CLAUDE.md` (despliegue, `API_ENV`, `deploy-migrate`, roles, `/live` y `/health`), `README.md` (enlace), `rappi-ia/README.md` (tabla de variables y `/session`, `/live`), `dashboard-empresa/README.md`, `prototipo-app/README.md` y la cláusula del panel desde otro equipo en `CLAUDE.md` e `instalacion.md` (E-I13: con el cambio de Task 1 el panel ya usa el host de la página)

**Interfaces (`docs/despliegue.md`):**
- §0 Lo que necesita el usuario (lista **[USUARIO]** con dónde va cada valor). §1 Arquitectura (diagrama). §2 Variables de entorno (tabla: nombre, servicio, defecto, ejemplo, ¿secreto?). §3 Primer despliegue desde un dump (`pg_restore --no-owner` con `PGOPTIONS='-c maintenance_work_mem=1GB'`, `deploy-migrate`, `grants.sql`, `smoke.sh`). §4 Actualizar (`git pull` → `docker compose build` → `run --rm migrate` → `up -d`). §5 Volver atrás (etiqueta de imagen anterior + restaurar el dump de antes de migrar). §6 Operación (registros, `/live` y `/health`, timers, respaldos y prueba mensual de restauración, purga). §7 Seguridad y datos (puerta, identidad firmada, qué se guarda y cuánto tiempo, cabeceras). §8 Tamaño y Postgres. §9 Riesgos (IP de datacenter, User-Agent, por qué no hay lanzamiento abierto).

- [ ] **Step 1:** Escribir el runbook siguiendo lo construido; verificador de enlaces y anclas (0 rotos).
- [ ] **Step 2: Verificar** que una persona que solo lee `docs/despliegue.md` levanta el stack en una VM Linux limpia (Multipass/UTM) con `DOMAIN=localhost` y `smoke.sh` sale 0; todas las suites verdes; `make mvp-check` → «7 de 7 bien».
- [ ] **Step 3: Commit** `docs: runbook del despliegue y documentos al día`.

---

## Fuera de este plan

Ya resueltos en `2026-10-11-revision-integral.md` (no se repiten aquí): A-C1, A-I2 a A-I6, A-I10, A-I11, A-M1, A-M4, A-M6, A-M8, A-M9, B-C1, B-I1 a B-I3, B-I6 a B-I10, varios Menores de B, C-I2 a C-I5, C-I7, Menores de C, D-C1, D-I1 a D-I4, D-I6, D-I8, D-I9, Menores de D salvo D-M8, E salvo E-C1 y E-I13, y F-M2, F-M4, F-M6, F-M7 (los pines del CI y la instalación del scraper con el lock de F-M8 también se hicieron allá, con C-M7).

Postergados o descartados a propósito:
- **Cuentas de usuario, pagos, lanzamiento abierto sin puerta:** fuera del MVP (spec §7); abrirlo exige autorización de Rappi por los datos (F-C2).
- **Kubernetes, base administrada, CDN, WAF:** desproporcionados para una demo cerrada en un host.
- **Rutas `/me/...` de A-C2:** descartadas; se mantienen las rutas actuales con verificación del token (menos cambios en el contrato y el mismo efecto).
- **`slowapi` o el plugin de límites de Caddy:** descartados; el límite en proceso basta con 1 worker y no suma dependencias. Con 2 workers los límites son por worker (anotado en el runbook).
- **Gunicorn y 2 workers:** no hace falta; cada worker carga e5 (~2 GB) y la inferencia ya va en serie. Solo con 16 GB de RAM.
- **Sincronización parcial Mac mini → servidor (catálogo sin datos de personas):** no es trivial (restaurar un dump entero borraría los datos de la app); se decide después de la decisión del usuario sobre descargar desde el servidor.
- **Lock de pip con hashes y pines por SHA de todas las dependencias (resto de F-M8):** se fija la revisión del modelo; los hashes, cuando haya un proceso de imágenes reproducibles.
- **Registros en JSON y envío a un servicio externo, alertas:** texto con hora y request id alcanza para una demo; las alertas sobre `/health` quedan como sugerencia en el runbook.
- **Partición o poda de `price_snapshots`:** el plan anterior sacó el precio vigente a su tabla; podar historial es otra decisión.
