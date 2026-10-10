# MVP, etapa 1: base del MVP (plan de implementación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un comando levanta el MVP conectado (base, API, app y panel), y la app ya no funciona sin la API: muestra «Sin conexión con Mochi».

**Architecture:**
- **Backend (rappi-ia):**
  - un catálogo de prueba inventado y el comando `seed-demo`, que lo carga solo en una base `*_test`;
  - un chequeo de la base, `doctor`;
  - respuestas de ejemplo del contrato, que los tests del backend escriben y comparan.
- **App:**
  - un cliente con errores tipados;
  - un usuario compartido;
  - una puerta de conexión en `main.jsx`, que deja a `App` y sus tests intactos.
- **Raíz:** un `Makefile` con `mvp` y `mvp-check`, más los scripts que los corren.

**Tech Stack:** Python 3.13 + FastAPI + psycopg + pytest (rappi-ia); React 19 + Vite + Vitest (prototipo-app); bash; playwright-core con Chrome.

**Spec:** `docs/superpowers/specs/2026-10-10-mvp-integrado-design.md` (sección 4, etapa 1)

## Global Constraints

- **Idioma:** código en inglés; todo lo que ve el usuario (mensajes, CLI, docs) en español.
- **Catálogo de prueba inventado:** cada nombre de tienda y de producto contiene «prueba». Nunca se copia nada del catálogo descargado.
- **Bases de prueba:**
  - `seed-demo` solo escribe en una base cuyo nombre termina en `_test`, y lee la URL de `DATABASE_URL_TEST`, nunca de `DATABASE_URL`;
  - los tests usan `rappi_ia_test`.
- **`make mvp` no descarga nada de rappi.cl** (candado `scraper.lock`: nunca dos descargas a la vez).
- **Sin respaldo local nuevo:** la app no inventa respuestas cuando la API falta.
- **Tests verdes en cada tarea:**
  - en rappi-ia, `make test` y `make lint`;
  - en prototipo-app, `npm test` y `npm run lint`.
- **Puertos del MVP:**
  - el MVP real usa API `:8000`, app `:5174` y panel `:5175`;
  - `mvp-check` usa API `:8010` y app `:5184`; la regla de CORS ya acepta `http://localhost:51\d\d`.

## Review Focus

1. **Una API lenta al arrancar** (primera consulta de más de 1,5 s) no se confunde con «sin conexión». La puerta espera hasta 5 s y muestra «Conectando con Mochi…». Test en la tarea 5.
2. **Una API vieja ya corriendo en :8000** (un `make serve` olvidado) no rompe `make mvp` en silencio: el script dice qué puerto está ocupado. Verificación manual en la tarea 6.
3. **`seed-demo` apuntando a la base real `rappi`** se niega antes de tocar nada. Test en la tarea 1.
4. **Un usuario con progreso guardado conserva su id** (la clave `rappi-proto-user` no cambia), así que su perfil y sus eventos siguen siendo suyos. Test en la tarea 4.
5. **Una respuesta de ejemplo desactualizada** hace fallar el CI con un mensaje que dice qué correr (`make contract`). Test en la tarea 3.

---

### Task 1: Catálogo de prueba inventado y `rappi-ia seed-demo`

**Files:**
- Create: `rappi-ia/src/rappi_ia/demo/__init__.py`, `rappi-ia/src/rappi_ia/demo/seed.py`
- Modify: `rappi-ia/src/rappi_ia/cli.py` (subcomando `seed-demo`), `rappi-ia/tests/conftest.py` (usa `reset_test_database`)
- Test: `rappi-ia/tests/integration/test_demo_seed.py`, `rappi-ia/tests/unit/test_demo_guard.py`

**Interfaces:**
- **Produces:**
  - `reset_test_database(conn) -> None`: borra los esquemas `capa` y `public`, recrea `public` y aplica `migrate(conn)`. Es lo mismo que hace hoy el fixture `db`, que pasa a llamarla.
  - `ensure_test_database(url: str) -> None`: lanza `SystemExit(2)` con «Por seguridad, seed-demo solo siembra una base de prueba (nombre terminado en _test), no {nombre}» si el nombre no termina en `_test`.
  - `seed_demo(conn) -> dict[str, int]`: carga el catálogo inventado. Después corre `build_search_documents(conn)` y `build_concepts(conn)`. Devuelve los ítems por vertical.
  - `DEMO_VERTICALS = ("supermercado", "conveniencia", "turbo", "licores", "farmacia", "mall", "chocolateria", "restaurantes")`.

- [ ] **Step 1: Tests que fallan**
  - `test_seed_demo_fills_every_vertical_with_priced_products`:
    - el resultado tiene las 8 claves de `DEMO_VERTICALS`, cada una con 6 o más;
    - `SELECT vertical, count(*) FROM search_documents GROUP BY 1` da 6 o más por vertical;
    - ningún `catalog_item` queda sin precio en `price_snapshots`.
  - `test_demo_catalog_is_invented`: todo `stores.name`, `catalog_items.name` y `menu_items.name` contiene «prueba» (sin importar mayúsculas).
  - `test_seed_demo_assigns_concepts`: cada vertical tiene al menos un ítem en `item_concepts`.
  - `test_seed_demo_command_refuses_a_database_not_ending_in_test` (unitario): con `postgresql://localhost/rappi`, `ensure_test_database` lanza `SystemExit` con código 2 y el mensaje cita `rappi`.
- [ ] **Step 2: Correrlos** con `cd rappi-ia && .venv/bin/python -m pytest tests/integration/test_demo_seed.py tests/unit/test_demo_guard.py -q`.
  - Expected: FAIL (`ModuleNotFoundError: rappi_ia.demo`).
- [ ] **Step 3: Implementar el catálogo.**
  - Por vertical: 2 tiendas (`add_store` del conftest como modelo, sin importar el conftest) y 6 a 8 productos con precio.
  - Usar categorías que ya existen en `category_map.csv` («Cervezas», «Snacks salados», «Analgésicos»…), para que `build_concepts` asigne conceptos.
  - Restaurantes: 2 restaurantes con secciones, platos y cocinas.
  - Nombres genéricos con «(prueba)»: «Cerveza rubia lata 470 cc (prueba)», «Tienda de prueba Centro».
- [ ] **Step 4: Implementar `rappi-ia seed-demo`.**
  - Lee `database_url("DATABASE_URL_TEST")` y llama a `ensure_test_database`, `reset_test_database` y `seed_demo`.
  - Imprime «Catálogo de prueba listo: N ítems en 8 verticales».
- [ ] **Step 5: Correr los tests y la suite.**
  - `make test` y `make lint` en `rappi-ia/`.
  - Expected: PASS, incluidos los tests que usan el fixture `db` refactorizado.
- [ ] **Step 6: Commit:** `feat: catálogo de prueba inventado y rappi-ia seed-demo (solo en bases _test)`

### Task 2: `rappi-ia doctor`, el chequeo de la base del MVP

**Files:**
- Create: `rappi-ia/src/rappi_ia/demo/doctor.py`
- Modify: `rappi-ia/src/rappi_ia/cli.py` (subcomando `doctor`)
- Test: `rappi-ia/tests/integration/test_doctor.py`

**Interfaces:**
- **Produces:** `check_database(url: str) -> tuple[bool, str]`, que devuelve si la base está lista y un mensaje en español. `rappi-ia doctor` imprime el mensaje y sale con 0 si está lista y con 1 si no.

- [ ] **Step 1: Tests que fallan**
  - `test_doctor_explains_unreachable_postgres`: con `postgresql://localhost:1/nada` devuelve `False`, y el mensaje empieza con «No puedo conectar con Postgres» y cita `docs/instalacion.md`.
  - `test_doctor_explains_empty_catalog`: con la base de prueba recién migrada y sin datos devuelve `False`, y el mensaje contiene «La base no tiene catálogo».
  - `test_doctor_accepts_seeded_database`: después de `seed_demo` devuelve `True`, y el mensaje contiene «Base lista» y «8 verticales».
- [ ] **Step 2: Correrlos.** Expected: FAIL (no existe el módulo).
- [ ] **Step 3: Implementar.**
  - Conexión con `connect_timeout=3`.
  - Cuenta los documentos por vertical en `search_documents`.
  - El mensaje de lista es «Base lista: {n} documentos en {v} verticales».
- [ ] **Step 4: Correrlos y la suite.** `make test` y `make lint` dan PASS.
- [ ] **Step 5: Commit:** `feat: rappi-ia doctor revisa la base antes de levantar el MVP`

### Task 3: Respuestas de ejemplo del contrato (lado API)

**Files:**
- Create: `rappi-ia/tests/integration/test_contract.py`, `prototipo-app/src/api/fixtures/health.json`
- Modify: `rappi-ia/Makefile` (objetivo `contract`)

**Interfaces:**
- **Consumes:** `seed_demo` (tarea 1).
- **Produces:**
  - los archivos `prototipo-app/src/api/fixtures/<nombre>.json`, con la respuesta real de la API sobre el catálogo de prueba (JSON con `sort_keys=True`, `indent=2`, `ensure_ascii=False` y salto de línea final);
  - la tabla `CONTRACT: dict[str, tuple[str, str]]` (nombre → método, ruta), que en esta etapa tiene solo `"health": ("GET", "/health")` y crece en las siguientes;
  - `make contract`, que corre `RAPPI_CONTRACT_WRITE=1 $(PY) -m pytest tests/integration/test_contract.py`.

- [ ] **Step 1: Test que falla**
  - `test_contract_examples_are_up_to_date`, parametrizado por `CONTRACT`:
    - siembra con `seed_demo`;
    - pide la ruta con un `TestClient`, con los mismos overrides de servicios que `tests/integration/test_api.py::client` (`HashEmbedder` y `TemplateComposer`);
    - con `RAPPI_CONTRACT_WRITE=1` escribe el archivo;
    - sin esa variable compara con el archivo y, si difieren, falla con «La respuesta de {ruta} cambió: corre `make contract` en rappi-ia y revisa el cambio en la app».
- [ ] **Step 2: Correrlo sin el archivo.** Expected: FAIL con ese mensaje.
- [ ] **Step 3: Agregar `make contract`, correrlo y revisar `health.json`.**
  - Debe tener `ok: true`, `documentos` igual al total sembrado y `capacidades` de las del modo liviano.
- [ ] **Step 4: Correr la suite.** Expected: PASS, y en el CI el job de rappi-ia (que tiene el repo completo) compara contra el archivo versionado.
- [ ] **Step 5: Commit:** `test: respuestas de ejemplo del contrato API-app, escritas por los tests del backend`

### Task 4: Cliente de la app con errores tipados y usuario compartido

**Files:**
- Create: `prototipo-app/src/api/user.js`, `prototipo-app/src/api/testing.js`, `prototipo-app/src/api/client.test.js`
- Modify:
  - `prototipo-app/src/api/client.js`: errores, `checkConnection` y el comentario de cabecera;
  - `prototipo-app/src/state/EventsContext.jsx`: importa `userId` de `api/user.js`;
  - quienes importan `userId`: `CheckoutScreen.jsx`, `AssistantPanel.jsx`, `api/orders.js`, `api/useRemoteForYou.js`.

**Interfaces:**
- **Consumes:** `src/api/fixtures/health.json` (tarea 3).
- **Produces:**
  - `class ApiError extends Error { kind: 'offline' | 'timeout' | 'http'; status?: number }`.
  - `request()` siempre lanza `ApiError`:
    - un `fetch` que falla da `offline`;
    - el abort por tiempo límite da `timeout`;
    - una respuesta no `ok` da `http` con su `status`.
  - `checkConnection({ timeout = 5000 } = {}) -> Promise<{ ok: true, capabilities, documents } | { ok: false, kind }>`.
  - `export const API_URL`.
  - `userId(): string` en `src/api/user.js`, con la misma clave `rappi-proto-user` y la misma lógica que hoy.
  - `stubApi(routes)` en `src/api/testing.js`:
    - reemplaza `fetch` con `vi.stubGlobal`;
    - las claves son `'GET /health'` o `'/health'`;
    - un valor puede ser un objeto (se responde 200 con ese JSON), un número (se responde ese estado), `'offline'` (el fetch falla) o `'slow:<ms>'` (responde la fixture después de esos ms);
    - lo que no está en `routes` responde 404.
  - `fixture(name)` devuelve el JSON de `src/api/fixtures/<name>.json`.

- [ ] **Step 1: Tests que fallan** (`client.test.js`)
  - `'una respuesta 500 es ApiError http con su estado'`
  - `'sin red es ApiError offline'`
  - `'pasado el tiempo límite es ApiError timeout'`
  - `'checkConnection con la API arriba devuelve ok y sus capacidades'` (con `fixture('health')`)
  - `'checkConnection sin API devuelve ok: false y el motivo'`
  - `'el usuario guardado conserva su id'`: con `localStorage['rappi-proto-user']` ya escrito, `userId()` devuelve ese mismo valor. Ojo: puede estar guardado con el formato de `writeStore`; hay que leerlo como lo hace hoy `EventsContext`.
- [ ] **Step 2: Correrlos** con `npx vitest run src/api/client.test.js`. Expected: FAIL.
- [ ] **Step 3: Implementar.**
  - Mover `userId` sin cambiar su comportamiento y actualizar quienes lo importan.
  - Cambiar el comentario de cabecera de `client.js`: «Sin la API la app muestra «Sin conexión con Mochi» (ver ConnectionGate)».
- [ ] **Step 4: Correr `npm test` y `npm run lint`.** Expected: PASS. Los tests que hoy hacen `vi.mock` del cliente siguen funcionando.
- [ ] **Step 5: Commit:** `feat: cliente de la API con errores tipados y usuario compartido`

### Task 5: «Sin conexión con Mochi»: la app no arranca sin la API

**Files:**
- Create: `prototipo-app/src/components/ConnectionGate.jsx`, `prototipo-app/src/components/connection-gate.css`, `prototipo-app/src/components/ConnectionGate.test.jsx`
- Modify: `prototipo-app/src/main.jsx` (envuelve `<App />` en `<ConnectionGate>`)

**Interfaces:**
- **Consumes:** `checkConnection`, `API_URL`, `stubApi` y `fixture` (tarea 4); `Mascot` para la pose de Mochi (mood `think`).
- **Produces:** `<ConnectionGate>{children}</ConnectionGate>`.

Textos exactos:
- Mientras revisa: «Conectando con Mochi…».
- Sin conexión:
  - título «Sin conexión con Mochi»;
  - texto «No pude conectar con la API del MVP ({API_URL}).»;
  - ayuda «Levanta el MVP con `make mvp` en la carpeta del proyecto y vuelve a intentar.»;
  - botón «Reintentar».

- [ ] **Step 1: Tests que fallan**
  - `'con la API arriba muestra la app'`: con `stubApi({ '/health': fixture('health') })`, los hijos aparecen.
  - `'sin API muestra «Sin conexión con Mochi» y no la app'`: con `stubApi({ '/health': 'offline' })` se ve el título y los hijos no se renderizan.
  - `'una API lenta muestra «Conectando con Mochi…» y después entra'`: con `'slow:3000'` y timers falsos, primero se ve el texto de espera y a los 3 s los hijos (no «Sin conexión»).
  - `'Reintentar vuelve a probar y entra cuando la API responde'`: primero `'offline'`; después `stubApi` cambia a la fixture; se hace clic en «Reintentar» y aparecen los hijos.
- [ ] **Step 2: Correrlos.** Expected: FAIL.
- [ ] **Step 3: Implementar.**
  - Revisa una vez al montar y otra con cada clic en «Reintentar».
  - Mientras revisa, no se monta `App`, así que ningún contexto llama a la API.
- [ ] **Step 4: Correr `npm test` y `npm run lint`.** Expected: PASS. `App` y sus tests no cambian.
- [ ] **Step 5: Verificar en el navegador.**
  - Con la API detenida, `npm run dev` muestra «Sin conexión con Mochi».
  - Con `make serve` corriendo, «Reintentar» entra a la Home.
  - Revisar a 375 × 812 y en escritorio, sin errores en la consola.
- [ ] **Step 6: Commit:** `feat: sin la API la app muestra «Sin conexión con Mochi» en vez de reglas locales`

### Task 6: `make mvp` y `make mvp-check`

**Files:**
- Create:
  - `Makefile` (raíz): objetivos `help`, `mvp`, `mvp-check`;
  - `scripts/mvp.sh` y `scripts/mvp-check.sh`: `#!/usr/bin/env bash`, compatibles con el bash 3.2 de macOS, con `set -euo pipefail`;
  - `prototipo-app/scripts/mvp-check.mjs`.
- Modify: `prototipo-app/scripts/screenshots.mjs` (aborta si la API no responde)

**Interfaces:**
- **Consumes:** `rappi-ia doctor` (tarea 2), `rappi-ia seed-demo` (tarea 1), la puerta (tarea 5).
- **Produces:**
  - `make mvp [LAN=1]`;
  - `make mvp-check`;
  - `node prototipo-app/scripts/mvp-check.mjs --app <url> [--expect-offline]`, que sale con 0 si pasa y con 1 si no.

- [ ] **Step 1: Escribir `mvp-check.mjs` y `mvp-check.sh`.** Usar el import absoluto de `playwright-core` y `channel: 'chrome'`, como en `screenshots.mjs`.
  - **Sin `--expect-offline`:** abre la app y espera la barra «Busca o pídele ideas a Mochi»; no debe aparecer «Sin conexión con Mochi».
  - **Con `--expect-offline`:** espera «Sin conexión con Mochi».
  - Imprime «MVP check: {n} de {n} bien» o qué falló.
  - **`mvp-check.sh`:**
    1. lee `DATABASE_URL_TEST` de `rappi-ia/.env`;
    2. corre `rappi-ia seed-demo`;
    3. levanta la API en :8010 con `RAPPI_IA_LIGHT=1` y `DATABASE_URL=$DATABASE_URL_TEST`, y la app en :5184 con `VITE_API_URL=http://localhost:8010`;
    4. espera `/health` hasta 60 s;
    5. corre la revisión en línea;
    6. detiene la API y corre `--expect-offline`;
    7. con `trap`, detiene todo al salir.
- [ ] **Step 2: Correr `make mvp-check` antes de que existan los objetivos.** Expected: FAIL (`No rule to make target`).
- [ ] **Step 3: Escribir el `Makefile` y `mvp.sh`.**
  - **Revisar que existan las dependencias** y, si falta algo, decir el comando:
    - `rappi-ia/.venv` → «corre `make install` en rappi-ia»;
    - `prototipo-app/node_modules` y `dashboard-empresa/node_modules` → «`npm ci`».
  - **Revisar los puertos** 8000, 5174 y 5175 con `lsof -iTCP:<p> -sTCP:LISTEN`. Si alguno está ocupado: «El puerto {p} ya está en uso (¿quedó un `make serve` o `npm run dev` abierto?)» y salida con 1.
  - **Preparar la base:** correr `rappi-ia doctor` (si falla, mostrar su mensaje y salir) y después `make -C rappi-scraper migrate`.
  - **Levantar los tres procesos**, con logs prefijados por `[api]`, `[app]` y `[panel]`:
    - sin `LAN=1`: `make -C rappi-ia serve`, `npm --prefix prototipo-app run dev` y `npm --prefix dashboard-empresa run dev`;
    - con `LAN=1`: `serve-lan` y `-- --host`.
  - **Avisar cuando esté listo:** esperar `/health` hasta 90 s e imprimir «MVP listo: app http://localhost:5174 · panel http://localhost:5175 · API http://localhost:8000/docs».
  - **Ctrl-C** detiene los tres (`trap`).
- [ ] **Step 4: Verificar.**
  - `make mvp-check` termina con «MVP check: 2 de 2 bien».
  - `make mvp` levanta todo con la base real; la app abre en la Home conectada y Ctrl-C deja libres los tres puertos.
  - Con un `make serve` ya corriendo, `make mvp` muestra el mensaje del puerto.
- [ ] **Step 5: Guardia en `screenshots.mjs`:** si `http://localhost:8000/health` no responde, sale con «Las capturas necesitan el MVP corriendo: `make mvp`».
- [ ] **Step 6: Commit:** `feat: make mvp levanta base, API, app y panel; make mvp-check lo recorre con Playwright`

### Task 7: Documentación de la etapa

**Files:**
- Modify: `README.md` («Probarlo»), `docs/instalacion.md`, `docs/demo.md` (cómo empezar), `docs/decisiones.md` (fila del 10-10), `CLAUDE.md` (servidores de demo), `prototipo-app/README.md` (cómo se levanta)

- [ ] **Step 1: README, «Probarlo».**
  - Reemplazar «Sin base de datos (unos 2 minutos)» por «El MVP (`make mvp`)»: requisitos (Postgres con la base cargada, `make install` en rappi-ia y rappi-scraper, `npm ci` en la app y el panel) y el comando.
  - Mantener «Con el catálogo real» como cómo cargar la base.
- [ ] **Step 2: `docs/instalacion.md` y `docs/demo.md`.** `make mvp`, `make mvp LAN=1` (iPhone), `make mvp-check`, y qué hacer si aparece «Sin conexión con Mochi».
- [ ] **Step 3: `docs/decisiones.md`.** Fila del 10-10-2026: el MVP exige la API; las reglas locales salen por etapas (catálogo en la 2, Mochi en la 3, juego en la 4); el HTML suelto del escritorio deja de ser la demo. Con su motivo y un enlace a la especificación.
- [ ] **Step 4: `CLAUDE.md`.** En «Servidores de demo», agregar `make mvp` (raíz) y `make mvp-check`.
- [ ] **Step 5: Correr las suites y `make mvp-check` una última vez.** Expected: todo en verde.
- [ ] **Step 6: Commit:** `docs: el MVP se levanta con make mvp`
