# Revisión integral del MVP: arreglos sin infraestructura — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cerrar los hallazgos Críticos e Importantes de las seis revisiones del 11-10-2026 que no dependen de un servidor (y los Menores baratos que una persona nota): el agente reconoce su nombre, la API no confía en el cliente para precios ni tipos de evento, la búsqueda y el catálogo dejan de recontar particiones, la app dice la verdad sobre privacidad y se usa con teclado, el panel no presenta cifras de test como uso, `make mvp-check` corre en el CI, el scraper no esconde productos por una página fallida y los documentos vuelven a coincidir con el código. Lo que exige un servidor (identidad firmada, pool, proxy, contenedores, tarea semanal en Linux, respaldos fuera del equipo) va en `2026-10-11-calidad-y-despliegue.md`, que empieza cuando este plan esté fusionado.

**Architecture:** sin piezas nuevas. Cada tarea toca un componente (rappi-ia, prototipo-app, dashboard-empresa + scripts + CI, rappi-scraper) y termina con su test que falla primero. Dos migraciones nuevas con número fijo para que las tareas no choquen: `031_order_mode.sql` (Task 1) y `032_latest_prices.sql` (Task 7). Las cachés nuevas son en proceso (la API corre en un solo proceso) y se invalidan con el último `scrape_runs.id` terminado, que se lee por clave primaria.

**Tech Stack:** Python 3.13, FastAPI, psycopg 3, pytest; React + Vite, Vitest, Testing Library; Playwright (`mvp-check`); bash; GitHub Actions; Postgres 17 + pgvector; Archify (diagramas).

**Spec:** revisiones en `scratchpad/revision/{A-backend,B-app,C-panel-scripts-ci,D-scraper,E-docs,F-security-deploy}.md` (los ids de hallazgo de este plan son los suyos: `A-C1` = revisión A, Crítico 1). Diseño de referencia: `docs/superpowers/specs/2026-10-10-mvp-integrado-design.md` (§5 «Pruebas y revisión», §6 «Reglas que no cambian», §8 «Riesgos»: «Segmentos recalculados en cada pedido son lentos», «Endpoints de catálogo lentos»).

## Global Constraints

- Todo lo que ve el usuario (CLI, logs, docs, textos de la app, columnas) en español; código en inglés. Excepción ya existente: los rótulos que imitan la app de Rappi (p. ej. «Go to checkout») siguen en el idioma de su pantalla.
- Nunca escribir «Mochi» ni «chat» en código nuevo: el nombre visible sale de `config.AGENT_NAME` (rappi-ia) y de `prototipo-app/src/agent/name.js` (app). Los tests arman las frases con esas constantes.
- Los datos descargados nunca van a git. Nunca dos descargas a la vez contra rappi.cl (candado `rappi-scraper/data/scraper.lock`); ningún test descarga.
- Datos de usuarios: solo `source = 'synthetic'` o `'prototype'`; nunca presentar métricas simuladas o de test como evidencia de uso.
- Tests de integración solo contra `rappi_test` (scraper) y `rappi_ia_test` (rappi-ia). `make mvp-check` borra `rappi_ia_test`: no correrlo junto con `make test` de rappi-ia (Task 5 agrega el candado que lo impide).
- Antes de dar una tarea por terminada: `make test` y `make lint` en rappi-ia y rappi-scraper; `npm test` y `npm run lint` en prototipo-app y dashboard-empresa; `make contract` sin cambios pendientes si se tocó una respuesta de la API.
- `make mvp-check` sigue en «7 de 7 bien» al final de cada tarea que toque app, panel o API (ningún chequeo nuevo en este plan).
- Migraciones solo en `rappi-scraper/src/rappi_scraper/storage/migrations/`, con `COMMENT` en español en cada columna o vista nueva. No se borra nada de forma permanente fuera de git (Papelera).
- Un hallazgo, un lugar: cada id aparece en una sola tarea de un solo plan. Los que van al plan de despliegue están en «Fuera de este plan».

## Review Focus

1. **Nombre del agente** (Task 1): «hola <nombre>» es saludo, «gracias <nombre>» es gracias, «quiero mochi» (el postre) sigue siendo búsqueda; todo con `AGENT_NAME` cambiado en el test.
2. **El cliente ya no decide precios ni eventos reservados** (Task 1): `unit_price` del cliente se ignora, `entity_id` inexistente → 400, `order_placed` por `/events` → 400; los pedidos de «Rappi hoy» no entran en los perfiles.
3. **Privacidad dicha y cumplida en la app** (Task 3): ningún texto dice «Ningún dato sale del dispositivo»; «Borrar mis datos» borra en el servidor y en el navegador y cambia el id.
4. **Ninguna página fallida esconde productos** (Task 6): un pasillo omitido no saca sus SKU de `search_documents`; 429 con `Retry-After` se respeta y el corte salta por peticiones, no por trabajos.
5. **CI de punta a punta** (Task 5): el job `mvp-check` corre en Ubuntu sin `lsof` y falla si la app cambia el nombre de un evento que el panel cuenta.

---

### Task 1: Backend — el agente y la API dicen la verdad

Cierra **A-C1, A-I4, A-I6, A-I11, A-M1 (+ F-M2), A-M4, A-M6, A-M9, B-I10**.

**Files:**
- Modify: `rappi-ia/src/rappi_ia/text.py`, `rappi-ia/src/rappi_ia/agent/understand.py` (vocativo), `rappi-ia/src/rappi_ia/agent/compose.py`, `rappi-ia/src/rappi_ia/api/app.py`, `rappi-ia/src/rappi_ia/api/deps.py`, `rappi-ia/src/rappi_ia/api/catalog.py`, `rappi-ia/src/rappi_ia/api/game.py`, `rappi-ia/src/rappi_ia/api/services.py`, `rappi-ia/src/rappi_ia/events/store.py`, `rappi-ia/src/rappi_ia/offers/personal.py` (y las consultas de perfil que lean `app_orders`), `rappi-ia/src/rappi_ia/eval/frases_usuarios/*.txt` (variantes con el nombre nuevo), `prototipo-app/src/api/orders.js`
- Create: `rappi-scraper/src/rappi_scraper/storage/migrations/031_order_mode.sql`, `rappi-ia/tests/unit/test_api_inputs.py`, `rappi-ia/tests/integration/test_order_integrity.py`
- Test: `rappi-ia/tests/unit/test_rappi_agent_words.py`, `rappi-ia/tests/unit/test_agent_parts.py`, `prototipo-app/src/api/orders.test.js`

**Interfaces:**
- `text.assistant_words() -> frozenset[str]`: `{"bigotes", normalize(config.AGENT_NAME)}`. El nombre se quita **solo como vocativo** (junto a un saludo o un «gracias», o seguido de más palabras); si es todo el pedido («quiero mochi») queda como consulta. No entra a `FILLER_WORDS`.
- `ClaudeComposer`: toma el primer bloque con `type == "text"`, manda `thinking={"type": "disabled"}`, revisa `stop_reason`; el log del respaldo dice el motivo (`max_tokens`, `sin_texto`, `verificador`, `error:<Clase>`). Leer el skill `claude-api` antes de tocar la llamada.
- `record_order`: el precio de cada línea sale del catálogo (misma consulta que `product_detail`), `unit_price` del cliente se ignora; `entity_id` que no existe → `ValueError` → 400 con texto genérico «Producto no disponible». `OrderIn.mode: Literal["propuesta", "actual"] = "propuesta"`.
- `031_order_mode.sql`: `app_orders.mode text NOT NULL DEFAULT 'propuesta' CHECK (mode IN ('propuesta','actual'))` con `COMMENT`. Las consultas de perfil (`_brand_orders`, intereses por líneas de pedido) filtran `mode = 'propuesta'`.
- `/events`: lista blanca `CLIENT_EVENT_TYPES` (sin `order_placed`, que solo nace en `/orders`); `value` con tope (`le=1_000_000`, `allow_inf_nan=False`).
- Errores: handler de `psycopg.errors.QueryCanceled` → 504 «La consulta tardó demasiado» (antes que el de `OperationalError`). Timeout por clase con `SET LOCAL statement_timeout` al abrir la transacción del request (así sirve igual con el pool del plan de despliegue): `API_TIMEOUT_INTERACTIVE_MS=5000`, `API_TIMEOUT_ANALYTICS_MS=30000` en `config.py`; dependencia `get_conn` (interactiva) y `get_analytics_conn`.
- Cotas: `Annotated[str, Path/Query(max_length=64)]` en `user_id`, `concept`, `vertical`, `current`, `cuisine`; `price_max: float | None = Query(None, ge=0, allow_inf_nan=False)`; `AskIn.profile` sin NaN/inf.
- `_log_ask`: `with conn.transaction()` + `except psycopg.Error` con `log.warning` (no tumba la respuesta). `services.load`: atrapa `Exception`, `log.exception` y lo anota en `faltantes`.
- App: `buildOrders(cart, { mode })` manda `mode: 'actual'` y sin `concept_id` en «Rappi hoy».

- [ ] **Step 1: Tests que fallan.**
  - `test_rappi_agent_words.py`: `test_greeting_with_agent_name`, `test_thanks_with_agent_name`, `test_vocative_is_stripped_before_query` («hola <nombre> quiero sushi» → «sushi»), `test_dessert_alone_stays_a_query`, `test_follows_agent_name_env` (monkeypatch `AGENT_NAME="Pelusa"`).
  - `test_agent_parts.py`: `test_claude_thinking_block_then_text_uses_text`, `test_claude_max_tokens_logs_reason`.
  - `test_api_inputs.py` (sin base, `TestClient` con `get_conn` reemplazado): `test_price_max_nan_is_422`, `test_long_user_id_is_422`, `test_profile_nan_is_422`, `test_order_placed_event_is_400`, `test_event_value_cap_is_422`, `test_query_canceled_is_504`, `test_log_ask_db_error_keeps_answer`, `test_startup_runtime_error_goes_to_faltantes`.
  - `test_order_integrity.py`: `test_client_unit_price_is_ignored` (línea con `unit_price=1e8` → total con el precio del catálogo), `test_unknown_entity_is_400`, `test_actual_mode_orders_do_not_feed_interests`.
  - `orders.test.js`: `buildOrders en modo actual lleva mode 'actual' y ningún concept_id`.
- [ ] **Step 2: Implementar hasta verde.** Migración 031; `make contract` si cambian las respuestas de ejemplo.
- [ ] **Step 3: Verificar** `make test && make lint` (rappi-ia y rappi-scraper), `npm test && npm run lint` (prototipo-app), `make mvp-check` → «7 de 7 bien».
- [ ] **Step 4: Commit** `fix: el agente reconoce su nombre y la API no confía en precios ni eventos del cliente`.

### Task 2: Backend — búsqueda, catálogo y pedidos más livianos

Cierra **A-I2, A-I3, A-I5, A-I10, A-M8**.

**Files:**
- Modify: `rappi-ia/src/rappi_ia/retrieval/hybrid.py`, `rappi-ia/src/rappi_ia/agent/grouped_search.py`, `rappi-ia/src/rappi_ia/agent/rappi_agent.py`, `rappi-ia/src/rappi_ia/agent/tools.py`, `rappi-ia/src/rappi_ia/catalog/{home,deals,stores}.py`, `rappi-ia/src/rappi_ia/game/challenges.py`, `rappi-ia/src/rappi_ia/layers/{segments,runs}.py`, `rappi-ia/src/rappi_ia/api/app.py` (tarea de fondo de `/orders`)
- Create: `rappi-ia/src/rappi_ia/catalog/cache.py`, `rappi-ia/tests/unit/test_catalog_cache.py`, `rappi-ia/tests/integration/test_query_budget.py`
- Test: `rappi-ia/tests/unit/test_agent_parts.py`, `rappi-ia/tests/integration/test_layer_segments*.py` (el que exista)

**Interfaces:**
- `catalog/cache.py`: `catalog_version(conn) -> int` (`SELECT max(id) FROM scrape_runs WHERE status = 'done'`, por PK) y `cached(name, conn, fn, ttl_s=600)`: guarda por `(name, catalog_version)`; se usa en `home()`, `deals()`, `vertical_stores()`, `read_challenge_data()` y en los conteos por vertical.
- `hybrid.vertical_doc_count(conn, vertical) -> int` por la caché de arriba: reemplaza el `count(*)` de `docs AS MATERIALIZED` y el de `_concept_in_vertical`. `has_words` se calcula una vez por consulta, antes del bucle de verticales de `grouped_search`. `thresholds()` con caché por mtime (como `load_segment_rules`).
- `RappiAgent.reply`: envuelve el embedder del turno en `MemoizedQueryEmbedder`; `_with_detail` prefiltra con `tsv_unaccent @@ plainto_tsquery(...)` y deja la regex como filtro final.
- `store_page`: una sola consulta con el CTE `_STORE_OFFERS` compartido.
- Segmentos de una persona: `user_metrics(..., user_id)` filtra por `user_id` dentro de cada subconsulta; el corte de `gasto_90d_percentil` se cachea un día; las corridas de una sola persona **no** escriben en `layer_runs`; `rules_version` con caché por mtime.

- [ ] **Step 1: Tests que fallan.**
  - `test_query_budget.py` (envuelve la conexión y cuenta `execute`): `test_grouped_search_query_count_under_budget` (`/search?q=xyz` sin vertical ≤ 40 consultas; hoy ~80), `test_no_partition_count_per_search`.
  - `test_agent_parts.py`: `test_ask_embeds_each_text_once` («helado de lúcuma bajo 5000» con embedder falso que cuenta `embed_queries`).
  - `test_catalog_cache.py`: `test_cache_hits_same_version`, `test_new_run_invalidates`.
  - Segmentos: `test_three_orders_add_no_layer_runs`, `test_user_metrics_filters_inside_subqueries` (mismo resultado que hoy para la persona).
- [ ] **Step 2: Implementar hasta verde.** Medir antes y después en `rappi_staging` con `EXPLAIN (ANALYZE, BUFFERS)` de la búsqueda léxica y el p50 de `/catalog/home` (anotar las dos cifras en el PR, no en docs).
- [ ] **Step 3: Verificar** suites y `make mvp-check` → «7 de 7 bien».
- [ ] **Step 4: Commit** `perf: la búsqueda y el catálogo dejan de recontar y los pedidos recalculan solo a su persona`.

### Task 3: App — privacidad dicha y cumplida, y una caída que no bota todo

Cierra **B-C1, B-I3, B-I6, B-I7, B-I8, B-M4, B-M9** (de B-I8 queda fuera el id en la URL: es A-C2/F-I1 del plan de despliegue).

**Files:**
- Modify: `prototipo-app/src/screens/game/Settings.jsx`, `src/main.jsx`, `src/components/ErrorBoundary.jsx`, `src/state/GameContext.jsx`, `src/components/ConnectionNotice.jsx` (o donde viva el aviso), `src/game/saver.js`, `src/state/EventsContext.jsx`, `src/state/OrdersContext.jsx`, `src/screens/account/AccountScreen.jsx`, `src/components/assistant/AssistantPanel.jsx`, `src/api/user.js`
- Create: `prototipo-app/src/components/PrivacyNotice.jsx`, `prototipo-app/src/state/forgetAll.js`
- Test: `src/screens/game/path.test.jsx`, `src/game/saver.test.js`, `src/state/events.test.jsx`, `src/state/persistence.test.jsx`, `src/App.*.test.jsx`, nuevo `src/screens/account/forget.test.jsx`

**Interfaces:**
- Texto del juego (Settings): «Tu progreso se guarda en el servidor del prototipo con un identificador anónimo de este navegador. «Borrar mis datos», en Cuenta, lo borra.» Se quita «No hay compras ni datos de usuarios reales» (queda «No pedimos tu nombre ni tu correo»). «Reiniciar progreso» dice que borra el progreso, no los eventos.
- `PrivacyNotice`: una vez por navegador (`rappi-proto-privacy-seen`), «Para recomendarte mejor guardamos tus búsquedas y lo que haces en la app con un identificador anónimo. Puedes borrarlo en Cuenta → Borrar mis datos.», con botón «Entendido» y enlace a Cuenta.
- `forgetAll()`: vacía la cola de eventos **antes** de cualquier `await`, llama `DELETE /profile/{id}`, borra las claves `rappi-proto-*` y genera un id nuevo (`user.resetUserId()`). Lo usan «Borrar mis datos» (entrada fija en Cuenta) y «Olvidar» del buscador, que ahora aparece siempre.
- Raíz: `<ErrorBoundary variant="root">` en `main.jsx` con «Algo salió mal» + «Recargar»; `window.addEventListener('vite:preloadError', …)` recarga una vez por sesión (bandera en `sessionStorage` para no entrar en bucle).
- `GameProvider` monta siempre a sus hijos y expone `game.status: 'loading' | 'ready' | 'offline'`; pasaporte y ronda muestran «Sin conexión» + «Reintentar»; `discover`/`visit` no hacen nada fuera de `ready`. El aviso anidado usa `<section role="alert">`, no `<main>`.
- `saver`: reintento a 2 s, 5 s y 15 s mientras `pending()`; reintenta en `online` y `visibilitychange`; en `pagehide` manda el último estado con `fetch(..., { method: 'PUT', keepalive: true })`.
- `EventsContext`: revisa `health()` antes de sacar el lote de la cola. `OrdersContext`: `loadStored(STORAGE_KEY, (v) => Array.isArray(v) && v.every(isOrder), [])`.

- [ ] **Step 1: Tests que fallan.** `el texto de privacidad no promete que nada sale del dispositivo` (falla si aparece «Ningún dato sale del dispositivo»), `la primera visita muestra el aviso y no vuelve`, `Borrar mis datos llama forget, deja solo el id nuevo y userId cambia`, `forgetAll vacía la cola antes de esperar`, `un error de render fuera de una pantalla muestra Recargar`, `preloadError recarga una sola vez`, `con /game/cards en 500 la Home se pinta y el pasaporte ofrece Reintentar`, `un guardado fallido se reintenta sin otra acción` (timers falsos), `pagehide manda el estado con keepalive`, `con health en null el lote espera y sale al segundo intento`, `pedidos guardados con forma rara no tumban la app`.
- [ ] **Step 2: Implementar hasta verde.** `grep -rn "navegador\|dispositivo" src` y revisar cada texto de privacidad que aparezca.
- [ ] **Step 3: Verificar** `npm test && npm run lint && npm run build`; `make mvp-check` → «7 de 7 bien»; revisión a 375 × 812.
- [ ] **Step 4: Commit** `fix: la app dice qué guarda, deja borrarlo y sigue en pie si el juego o un chunk fallan`.

### Task 4: App — teclado, contraste y movimiento

Cierra **B-I1, B-I2, B-I9, B-M1, B-M2, B-M3, B-M7**.

**Files:**
- Modify: `prototipo-app/src/hooks/useDialog.js`, `src/screens/game/Round.jsx`, `src/screens/game/GameSheet.jsx`, `src/components/cart.css`, `src/components/add-button.css`, `src/screens/checkout/checkout.css`, `src/screens/turbo/turbo.css`, `src/screens/home/live/LiveHomeFeed.jsx`, `src/screens/home/live/LiveAgent.jsx`, `src/components/assistant/AgentMessage.jsx`, `src/components/search/SearchSections.jsx`
- Create: `prototipo-app/src/hooks/useReducedMotion.js`, `prototipo-app/src/styles/contrast.test.js`
- Test: `src/components/assistant/*.test.jsx`, `src/screens/game/flow.test.jsx`, `src/screens/home/live/LiveHomeFeed.test.jsx`

**Interfaces:**
- `useDialog`: pila de diálogos a nivel de módulo; el handler de `keydown` sale si `stack.at(-1) !== root`. Solo el diálogo de arriba atrapa Tab y atiende Escape.
- `Round.jsx`: ignora Enter/Espacio si `e.target.closest('button, a, input, textarea, [role=button]')`; Escape abre «¿Salir de la ronda?». `GameSheet` usa `useDialog` (foco atrapado y devuelto a quien lo abrió).
- Contraste (mínimo 4,5 texto, 3 ícono): texto `--ink` sobre `--green-add` en el botón del carro y en el «+»; «Place order» con fondo sólido `--accent-deep` (o el token oscuro que dé ≥ 4,5 con blanco a 17 px); `--fee-ink` oscurecido hasta ≥ 4,5 sobre `--fee-bg`.
- `useReducedMotion()` con `useSyncExternalStore` sobre `matchMedia('(prefers-reduced-motion: reduce)')`; `StreamText` muestra el texto entero si es `true`.
- `LiveHomeFeed`: con `active` en false sube `run.current` y calla el globo; `LiveAgent` recibe `away || !active` para parar su intervalo.
- `RecentSearches` → `SearchIdeas`, título «Search ideas» (rótulo de la réplica, en inglés como su pantalla; no se presenta como historial).

- [ ] **Step 1: Tests que fallan.** `con el panel y la hoja de producto abiertos Tab llega al segundo control de la hoja`, `Escape cierra solo la hoja`, `Enter sobre la X en un paso de dato abre la confirmación y no suma XP`, `Escape en la ronda pide confirmar`, `GameSheet no roba el foco al re-renderizar y lo devuelve al cerrar`, `contrast.test.js` con cada par (falla hoy con 2,2:1 y 2,85:1), `con reduce la respuesta aparece entera en el primer render`, `una oferta que llega con la Home inactiva no muestra globo`, `el título de sugerencias no dice recientes`.
- [ ] **Step 2: Implementar hasta verde.**
- [ ] **Step 3: Verificar** `npm test && npm run lint`; recorrido con teclado y VoiceOver a 375 × 812 (panel + hoja, ronda); `make mvp-check` → «7 de 7 bien».
- [ ] **Step 4: Commit** `fix: diálogos anidados, ronda con teclado, contraste AA y menos movimiento`.

### Task 5: Panel, scripts de la raíz y CI

Cierra **C-I2, C-I3, C-I4, C-I5, C-I7, C-M1, C-M2 (+ E-M12), C-M3, C-M4, C-M5, C-M6 (+ F-M6), C-M7, C-M9, C-M10, E-M11, F-M7**.

**Files:**
- Modify: `dashboard-empresa/src/lib/api.js`, `dashboard-empresa/src/components/shell/ProvenanceBanner.jsx`, `dashboard-empresa/src/components/shell/Tabs.jsx`, `dashboard-empresa/src/App.jsx` (`aria-controls`), `dashboard-empresa/src/components/States.jsx`, `rappi-ia/tests/integration/test_contract.py`, `dashboard-empresa/scripts/screenshots.mjs` (Chrome por `channel`/`CHROME_PATH`), `scripts/mvp-lib.sh`, `scripts/mvp.sh`, `scripts/mvp-check.sh`, `prototipo-app/scripts/mvp-check.mjs` (`CHROME_PATH`/`PLAYWRIGHT_CHANNEL`), `rappi-ia/Makefile` (candado en `test`), `.github/workflows/ci.yml`, `.github/workflows/modelos-semanal.yml`, `.gitignore`, `prototipo-app/.gitignore`, `dashboard-empresa/.gitignore`, `package-lock.json` de las dos apps (`npm audit fix`)
- Create: `.github/dependabot.yml`
- Test: `dashboard-empresa/src/views/MvpUsageView.test.jsx` (o el de la vista «Uso del MVP»), `dashboard-empresa/src/lib/api.test.js`

**Interfaces:**
- Panel sin conexión con `fuente=prototipo`: no cae a fixtures; cada bloque muestra `ErrorState` «La API no responde: el uso del MVP solo se ve con la base viva.» Con `fuente=simulados` sigue el respaldo, rotulado por bloque con el origen que trae el fixture (`"guardado": {"origen": …, "fecha": …}`, escrito por `make contract` y `npm run fixtures`).
- `api.js`: generación por clave; el `catch` de una petición vieja solo llama `addFallback` si `cache.get(key)` sigue siendo esa promesa.
- `test_contract.py`: `PANEL_METRICS` = las 13 métricas de `/analytics` + `catalog`, con las dos fuentes (siembra `seed_demo` + `generate(…)` con semilla); test de forma (mismas claves y tipos por fila) para los fixtures «bonitos» de 1.500 usuarios que se conservan.
- Accesibilidad del panel: `aria-controls` solo en la pestaña activa; `EmptyState` sin `role="status"`.
- `port_busy` sin `lsof`: `(exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null`; se quita `need_command lsof` y el «viene con macOS». `.venv` que no arranca: `"$IA" --help >/dev/null 2>&1 || fail "El .venv de rappi-ia no funciona (¿se movió la carpeta?): corre \`make install install-ml\` en rappi-ia."` (en `mvp-check.sh`, `make install`); `need_command npm` en `mvp-check.sh`.
- Candado de la base de prueba: `rappi-ia/.test-db.lock` (directorio con `mkdir`, sirve en macOS y Linux) en `mvp-check.sh` y en `make test` de rappi-ia; mensaje «Otra prueba está usando rappi_ia_test; espera a que termine.»
- `mvp-check.sh`: `DATABASE_URL` exportada dentro de un subshell (no en el argv de `env`); el `mktemp` se crea antes de `install_traps` y lo borra `stop_all`.
- `ci.yml`: job nuevo `mvp-check` (`ubuntu-latest`, servicio `pgvector/pgvector:pg17` con `rappi_ia_test`, `pip install -c requirements.lock.txt -e ".[api]"` sin ML, `npm ci` en las dos apps, `DATABASE_URL_TEST=… make mvp-check`, `timeout-minutes: 15`); `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`; `node-version-file: .nvmrc`; job `scripts` con `shellcheck -x scripts/*.sh`; rappi-scraper instalado con `-c ../rappi-ia/requirements.lock.txt`; acciones `checkout@v5`, `setup-node@v5`, `setup-python@v6` fijadas por SHA con la versión en comentario (en los dos workflows).
- `dependabot.yml`: `github-actions`, `npm` (`/prototipo-app`, `/dashboard-empresa`) y `pip` (`/rappi-ia`, `/rappi-scraper`), semanal.
- `.gitignore` raíz: `.env*` con `!.env.example`, `*.dump`, `*.sql.gz`, `*.backup`, `.superpowers/`; `dist*/` en las dos apps.

- [ ] **Step 1: Tests que fallan.** Panel: `con la API caída y fuente prototipo no aparecen cifras guardadas`, `el bloque simulado sin conexión muestra su origen`, `una respuesta vieja que falla tarde no deja Modo sin conexión`, `solo la pestaña activa tiene aria-controls`. rappi-ia: `test_contract` falla hoy con las métricas nuevas (fixtures desactualizados) hasta regenerarlos. Scripts: en un contenedor `ubuntu:24.04` sin `lsof`, con `python3 -m http.server 8000 &`, `scripts/mvp.sh` dice «El puerto 8000 ya está en uso»; con `make test` corriendo, `make mvp-check` sale con el mensaje del candado.
- [ ] **Step 2: Implementar hasta verde.** `npm run fixtures` contra la API de prueba y `make contract`.
- [ ] **Step 3: Verificar** `touch rappi.dump rappi-ia/.env.production && git status --short` no los muestra y `git check-ignore -v rappi-ia/.env.example` no devuelve nada; `npm audit` sin «high» en las dos apps; el PR muestra el job `mvp-check` en verde y, en una rama de prueba que cambia `'game_round_finished'` en la app, en rojo; `make mvp-check` local → «7 de 7 bien».
- [ ] **Step 4: Commit** `ci: mvp-check en el CI, panel honesto sin conexión y scripts sin lsof`.

### Task 6: Scraper — una página fallida no esconde productos

Cierra **D-C1, D-I1, D-I2, D-I3, D-I4 (+ F-M4), D-I6, D-I8, D-M1, D-M2, D-M3, D-M4, D-M5, D-M7, D-M9, D-M10**.

**Files:**
- Modify: `rappi-scraper/src/rappi_scraper/pipeline/{stores,restaurants,queue,refresh,discover}.py`, `scraping/{client,next_data,store_parser,restaurant_parser}.py`, `storage/{backup,search,repository}.py`, `reporting.py`, `cli.py`, `keep_awake.py`, `legacy/csv_scraper.py`, `scripts/refresh-semanal.sh` (solo los códigos 4 y 5; el paso a bash es del plan de despliegue)
- Test: `tests/unit/{test_client,test_backup,test_discover,test_listing_restaurant_parsers,test_store_parser,test_legacy_csv,test_weekly_script}.py`, `tests/integration/{test_pipeline,test_refresh,test_reliability}.py`

**Interfaces:**
- Páginas omitidas: el trabajo de tienda guarda en `scrape_jobs.result` `{"pasillos_omitidos": [aisle_id…], "paginas_omitidas": n, "paginas_intentadas": m}`; si `n/m > SKIPPED_PAGES_MAX = 0.05` el trabajo queda `failed` (pasa por el reintento y el run anterior sigue siendo el del formato). `_OFFER_PRICES` mantiene vigentes las ofertas de los pasillos omitidos (`l.run_id = f.format_run_id OR sp.aisle_id = ANY(skipped)`). Reporte: `_check("Páginas omitidas (%)", …)`.
- Cliente: respeta `Retry-After` (tope `RETRY_AFTER_MAX_S = 900`), backoff exponencial, no duerme después del último intento; contador de 403/429/desafío seguidos en el cliente y, pasado `BLOCK_STREAK_REQUESTS = 20`, lanza `PossibleBlock` (que `crawl_store` no atrapa). `response.encoding` a UTF-8 si falta o es ISO-8859-1. Regex de `__NEXT_DATA__` sin orden fijo de atributos: `<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>`. `keep_awake`: `process.wait(timeout=5)`; el timeout por operación queda documentado en el docstring del cliente.
- `extract_next_data` y los parsers convierten `ValueError`/`KeyError`/`TypeError` en `ParseError` (que está en `PAGE_ERRORS`).
- `refresh()`: un error del descubrimiento de restaurantes (no `PossibleBlock`) queda en el reporte como alerta y sigue a `build_search_documents` y al respaldo; código de salida **5** «restaurantes no se actualizaron». `PossibleBlock` sale con **4**. `refresh-semanal.sh`: 4 → `nota="detenida: posible bloqueo"` y sale; 5 → `nota="restaurantes sin actualizar"` y sigue con `post-refresh` (como hoy el 3).
- Respaldo: URL partida con `conninfo_to_dict`; host/puerto/usuario/base como flags y la clave en `env={"PGPASSWORD": …}`; error como `RuntimeError("pg_dump falló con código N")` sin argv. `rappi backup` toma el candado de descargas (`LONG_COMMANDS`).
- `rappi-csv`: el cuerpo de `main()` dentro de `download_lock()`; `DownloadInProgress` → `SystemExit` con el mensaje de siempre.
- Conexión larga: `connect(..., connect_timeout=10, keepalives=1, keepalives_idle=60)`; `conn.commit()` después de `pending_jobs`/`store_types_done`/`brands_done`; `_process` reconecta una vez ante `OperationalError` y reintenta `mark_job`.
- Descubrimiento: un listado con 0 tiendas va a `failed_listings`; `upsert_store` en descubrimiento usa `COALESCE(stores.city, EXCLUDED.city)`; `discover --new-run` cierra el run anterior como `failed`; sitemaps `-0`, `-1`, … hasta `PageNotFound`.

- [ ] **Step 1: Tests que fallan** (todos con `FakeClient`, sin red): `test_skipped_aisle_keeps_its_offers_current` (run 2 omite el pasillo A: sus productos siguen en `search_documents`), `test_too_many_skipped_pages_fails_job`, `test_retry_after_is_honoured`, `test_no_sleep_after_last_attempt`, `test_request_block_streak_raises_possible_block`, `test_broken_next_data_is_parse_error`, `test_one_broken_aisle_page_is_skipped_not_fatal`, `test_restaurant_discovery_error_still_builds_search_and_backup` (exit 5), `test_backup_password_not_in_args_nor_error`, `test_backup_takes_download_lock`, `test_rappi_csv_refuses_while_locked`, `test_first_handler_runs_outside_transaction`, `test_empty_listing_is_retried`, `test_city_not_overwritten_by_listing`, `test_new_run_closes_previous`, `test_reads_all_sitemap_shards`, `test_utf8_without_charset`, `test_next_data_any_attribute_order`, `test_weekly_script_exit4_notes_block` y `…exit5_runs_post_refresh`.
- [ ] **Step 2: Implementar hasta verde.**
- [ ] **Step 3: Verificar** `make test && make lint` en rappi-scraper y rappi-ia (lee `_OFFER_PRICES`).
- [ ] **Step 4: Commit** `fix: el scraper no esconde productos por una página fallida y respeta los 429`.

### Task 7: Precios vigentes sin recorrer el historial

Cierra **D-I9, D-M6**.

**Files:**
- Create: `rappi-scraper/src/rappi_scraper/storage/migrations/032_latest_prices.sql`, `rappi-scraper/tests/integration/test_latest_prices.py`
- Modify: `rappi-scraper/src/rappi_scraper/storage/{repository,search}.py` (upsert en `save_products` y en el guardado de platos; `_OFFER_PRICES`), `rappi-scraper/src/rappi_scraper/reporting.py` (cambios de precio), `rappi-ia/src/rappi_ia/catalog/stores.py` (CTEs de precio vigente), `rappi-ia/src/rappi_ia/layers/attributes.py` si lee `v_latest_prices`

**Interfaces:**
- `latest_prices(store_id, sku, price, real_price, in_stock, run_id, scraped_at, PRIMARY KEY (store_id, sku))` y `latest_menu_prices(...)` con la misma idea para platos; se llenan en la migración desde `DISTINCT ON … ORDER BY scraped_at DESC, run_id DESC` y se mantienen con `INSERT … ON CONFLICT DO UPDATE WHERE EXCLUDED.scraped_at >= latest_prices.scraped_at`. `COMMENT` en español.
- `v_latest_prices` se recrea sobre `latest_prices` (con el desempate por `run_id`, D-M6). El conteo de cambios de precio del reporte une las filas del run contra la fila anterior de cada SKU por `price_snapshots_latest_idx`, sin ventana sobre toda la tabla.
- `price_snapshots` no se toca (sin particionar ni podar en este plan).

- [ ] **Step 1: Tests que fallan:** `test_latest_prices_follows_newest_snapshot`, `test_same_scraped_at_prefers_newer_run`, `test_offer_prices_match_old_query` (mismo resultado que la consulta vieja sobre un catálogo de prueba con 3 runs), `test_report_price_changes_match_window_version`.
- [ ] **Step 2: Implementar hasta verde.** En `rappi_staging`: `EXPLAIN (ANALYZE, BUFFERS)` de `_OFFER_PRICES` y del conteo del reporte antes y después (cifras en el PR).
- [ ] **Step 3: Verificar** suites de rappi-scraper y rappi-ia; `make mvp-check` → «7 de 7 bien».
- [ ] **Step 4: Commit** `perf: precio vigente en su propia tabla, sin ordenar todo el historial`.

### Task 8: Documentación coherente (al final)

Cierra **E-C2, E-I1 a E-I12, E-I14 a E-I17, E-M1 a E-M10, E-M13 a E-M19**.

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `docs/README.md`, `docs/instalacion.md`, `docs/decisiones.md`, `docs/diseno-ia.md`, `docs/contexto-y-problema.md`, `docs/ecosistema-rappi.md`, `docs/capa-de-datos.md`, `docs/demo.md`, `docs/sql/README.md`, `rappi-ia/README.md`, `rappi-scraper/README.md`, `prototipo-app/README.md`, `dashboard-empresa/README.md`, `rappi-ia/.env.example`, `rappi-ia/Makefile` (comentario de E-M19), `docs/diagramas-fuente/{rag-datos,arquitectura-ia}.json` y sus HTML/PNG en `docs/diagramas/`
- Remove (git rm): `docs/screenshots/24-home-para-ti.jpg`, `docs/screenshots/01-home-propuesta.jpg` (sin referencias)

**Interfaces (textos exactos en la revisión E; aquí, lo que se decide):**
- Cifras en un solo lugar: `README.md#resultados` (fila «Calidad» con los conteos reales al terminar este plan, medidos con `pytest --collect-only -q`, `vitest list`, fechados); los README de componentes y `rappi-ia/README.md` «Resultados» apuntan ahí (E-C2, E-I1, E-I2).
- Descripción de `mvp-check` completa solo en `docs/instalacion.md` §5, como lista numerada de 7 (E-I14, E-M17); los otros cinco lugares, una línea con el enlace. Sumar ahí que el CI la corre (Task 5) y el candado de `rappi_ia_test`.
- Diagramas: nodos «Panel :5175» y «Tarjetas del juego» (E-I4), regenerados con la skill Archify.
- `docs/diseno-ia.md` §7 con la tabla «Etapas del MVP (10–11-10-2026)» enlazando cada plan (E-I11); `## Agente (Mochi)` y sus enlaces (E-M1).
- Migraciones: listas al día hasta **032** (E-I7, con 031 y 032 de este plan); modelo de datos con juego, Jev, `latest_prices` y esquema `capa` (E-I12).
- `docs/decisiones.md`: fila del 11-10 «Revisión integral»: qué se arregló, que el panel sin conexión ya no muestra cifras guardadas del prototipo, códigos de salida 4/5 del refresh, y que el resto va al plan de despliegue.
- `CLAUDE.md`: `mvp-check` corre en el CI y tiene candado; derivados «(conceptos, caché de embeddings, tarjetas del juego)» (E-M4); `latest_prices`; códigos 4/5.
- `rappi-ia/.env.example`: ejemplo real de `API_CORS_ORIGINS`, `GAME_MIN_ITEMS`, `API_TIMEOUT_INTERACTIVE_MS`, `API_TIMEOUT_ANALYTICS_MS` (E-M13).
- Fuera de esta tarea: E-C1 (runbook) y E-I13 (panel desde el iPhone), que cambian con el plan de despliegue.

- [ ] **Step 1:** Revisar enlaces y anclas con el mismo verificador de la revisión E (todas las `.md` fuera de `docs/superpowers/`): 0 rotos.
- [ ] **Step 2:** Aplicar los cambios; regenerar diagramas (o dejar anotado si el PNG no se puede generar).
- [ ] **Step 3: Verificar** `grep -rn "uso-responsable-de-los-datos\|757 categorías\|Tests: 589\|Tests: 104\|Tests: 189" --include=*.md .` sin resultados; todas las suites verdes; `make mvp-check` → «7 de 7 bien».
- [ ] **Step 4: Commit** `docs: revisión integral, cifras en un solo lugar y documentos al día con el código`.

---

## Fuera de este plan

Van al plan de despliegue (`2026-10-11-calidad-y-despliegue.md`):
- **A-C2, F-I1** (identidad firmada; también el id en la URL de B-I8), **A-I1, A-M3, A-M5, A-I7, F-C1** (pool, límites, abuso), **A-I8, A-I9, F-M1, F-M3** (salud y registros), **B-I4, C-I1, F-I3, F-M5** (URL de la API y CORS por entorno), **B-I5** (controles de demo en producción), **C-C1, F-I4** (builds servidos estáticos), **C-I6, D-I7, F-M9** (migraciones al desplegar), **C-M8** (panel bajo `/panel/`), **D-C2, D-M8, F-I7** (tarea semanal en Linux, registros, respaldos y purga), **D-I5, F-I5, F-I6, F-M8, F-C2, F-I2** (contenedores, proxy, roles, puerta de acceso, analíticas con bandera), **E-C1, E-I13** (runbook y panel desde otro equipo).

Postergados o descartados:
- **A-M2** (el juego: gana la última escritura): la fusión en el servidor desharía «Reiniciar progreso» y la versión optimista exige cambios en la app; con un dispositivo por persona el riesgo es bajo.
- **A-M7** (nombres viejos y listas duplicadas): limpieza interna sin efecto visible; renombrar `MODALITIES` toca datos simulados guardados. Las frases de prueba con el nombre nuevo sí entran en Task 1.
- **B-M5** (pila de pantallas sin tope): cambio de navegación con riesgo de regresiones; se mide en un iPhone viejo antes de decidir.
- **B-M6** (código muerto): no visible; se hace en una limpieza aparte.
- **B-M8** (íconos del juego, ~15 kB gzip): ahorro chico frente al riesgo de cambiar 10 archivos del juego ahora.
- **B-M10** (README con 589 tests, «Empty cart» sin deshacer, `querySelector('.cart-bar')`): el conteo lo corrige E-I2 en Task 8; «Deshacer» y `openCart` son mejoras de producto, no arreglos.
- **C-M11** (captura de «Uso del MVP» en el README del panel): requiere generar capturas con la base real; va en la próxima ronda de capturas.
- Opcionales que las revisiones mencionan y no se hacen: correr las verticales en paralelo (A-I2), particionar o podar `price_snapshots` (D-I9), `NOT VALID` en CHECK futuros (D-I7d, queda como guía en el plan de despliegue), la nota de User-Agent y robots.txt de D-I1 (es una decisión del usuario, en el plan de despliegue).
