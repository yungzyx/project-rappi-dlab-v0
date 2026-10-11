# MVP etapa 6: panel conectado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El panel de negocio muestra el uso real del MVP —ofertas del agente por momento, juego (rondas y tarjetas) y búsquedas sin resultado— separado de lo simulado y rotulado «uso del MVP, pocas personas: no es evidencia», y el recorrido de `make mvp-check` se ve en él con la fuente «prototipo».

**Architecture:** La app registra dos eventos nuevos del juego (`game_round_finished`, `game_card_discovered`; migración 029). rappi-ia suma tres métricas al router `/analytics/{name}` (`offers`, `game`, `unmet`), con el mismo sobre `{source, data}` y sin mezclar fuentes. El panel suma una vista «Uso del MVP» con tres secciones. Las respuestas de ejemplo del panel para esas métricas las escribe el backend (como las de la app), y `mvp-check` comprueba que el recorrido aparece en el panel.

**Tech Stack:** Postgres 17, FastAPI, psycopg 3, pytest; React 19 + Vite (app y panel), vitest; Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-mvp-integrado-design.md` (§1 criterio 3.6, §2, §4 «Etapa 6», §6).

## Global Constraints

- Código en inglés; todo lo que ve el usuario (panel, docs, logs, comentarios de tablas) en español. Nunca «Mochi» ni «chat» en código nuevo; el nombre visible sale de las constantes de siempre.
- Datos de usuarios: solo `source = 'synthetic'` o `'prototype'`, **nunca mezclados**: cada consulta filtra por una fuente y la respuesta la declara (`dataFrom` del panel lo exige). Las métricas simuladas nunca se presentan como evidencia.
- Con la fuente `prototype`, cada sección de la vista nueva muestra el rótulo exacto **«uso del MVP, pocas personas: no es evidencia»**.
- Privacidad: el panel no muestra textos de búsqueda de personas ni ids de usuario; las búsquedas sin resultado se muestran por vertical y concepto (nunca conceptos `sensitive`).
- Migraciones solo en `rappi-scraper/src/rappi_scraper/storage/migrations/`; la nueva es `029_game_events.sql`.
- Antes de dar una tarea por terminada: `make test`/`make lint` (rappi-ia; rappi-scraper si toca la migración), `npm test`/`npm run lint` (prototipo-app y dashboard-empresa). Tests contra `rappi_ia_test`, en serie.

## Review Focus

1. **Fuente mezclada:** una métrica nueva pedida con `source=prototype` no cuenta ni un evento simulado, y viceversa. Test por métrica en Task 3.
2. **Momentos con nombres viejos:** `mochi-plan`, `chat` y `agent-plan` caen en el mismo momento; un `origen` desconocido o ausente va a «sin momento», no se pierde ni rompe. Test en Task 3.
3. **Pocas personas:** con 1 persona y 2 eventos, la vista no calcula tasas que no se sostienen (muestra cuentas) y siempre lleva el rótulo. Tests en Task 3 y Task 4.
4. **Eventos del juego duplicados:** terminar una ronda envía un solo `game_round_finished` (también con StrictMode); una tarjeta vista por segunda vez no envía otro `game_card_discovered`. Test en Task 2.
5. **Panel sin API:** la vista nueva usa las respuestas guardadas como las demás y lo dice. Test en Task 4.

---

### Task 1: Eventos del juego en la base

**Files:**
- Create: `rappi-scraper/src/rappi_scraper/storage/migrations/029_game_events.sql`
- Modify: `rappi-ia/src/rappi_ia/events/store.py` (`EVENT_TYPES`; `WEIGHTS` no suma estos tipos)
- Test: `rappi-ia/tests/integration/test_game_events.py`

**Interfaces:**
- Produces: tipos `game_round_finished` (payload: `vertical_juego`, `estrellas` 0-3, `aciertos`, `preguntas`) y `game_card_discovered` (payload: `vertical_juego`, `tarjeta` = id de la tarjeta). El CHECK de `entity_type` (`catalog_item`, `menu_item`, `store`) no se toca: la tarjeta va en el payload.
- La migración rehace `app_events_type_check` con los 16 tipos actuales más los 2 nuevos, con su `COMMENT` en español.

- [ ] **Step 1: Tests:** `test_game_round_finished_is_recorded`, `test_game_card_discovered_is_recorded`, `test_unknown_type_still_rejected`, `test_game_events_do_not_add_profile_interest` (perfil sin cambios).
- [ ] **Step 2: Correr y ver que fallan; implementar hasta verde.**
- [ ] **Step 3: Verificar** `make test && make lint` (rappi-ia) y lint de rappi-scraper.
- [ ] **Step 4: Commit** `feat: eventos del juego (ronda terminada y tarjeta descubierta)`.

### Task 2: La app registra las rondas y las tarjetas

**Files:**
- Modify: `prototipo-app/src/screens/game/Round.jsx` (fin de ronda), `prototipo-app/src/state/GameContext.jsx` (tarjeta descubierta por primera vez, en `discover`/`answer` cuando la tarjeta es nueva)
- Test: `prototipo-app/src/screens/game/play.test.jsx`, `prototipo-app/src/state/GameContext.test.jsx`

**Interfaces:**
- Consumes: `useEvents().track(type, fields)` (`EventsProvider` envuelve a `GameProvider`).
- Produces: al mostrarse el fin de ronda, una sola vez, `track('game_round_finished', {payload: {vertical_juego, estrellas, aciertos, preguntas}})`; al descubrir una tarjeta nueva (no estaba en `discovered[v]` ni en `cards`), `track('game_card_discovered', {payload: {vertical_juego, tarjeta}})`. El dato del agente que se descubre (`DidYouKnow`) también cuenta, porque pasa por `discover`.

- [ ] **Step 1: Tests:** `a finished round sends one game_round_finished` (StrictMode), `a new card sends game_card_discovered once`, `seeing a known card again sends nothing`, `leaving a round before the end sends no round event`.
- [ ] **Step 2: Correr y ver que fallan; implementar hasta verde.**
- [ ] **Step 3: Verificar** `npm test && npm run lint` (prototipo-app).
- [ ] **Step 4: Commit** `feat: la app registra las rondas terminadas y las tarjetas descubiertas`.

### Task 3: Métricas nuevas del panel (`offers`, `game`, `unmet`)

**Files:**
- Modify: `rappi-ia/src/rappi_ia/analytics/queries.py`, `rappi-ia/src/rappi_ia/api/app.py` (`ANALYTICS`), `rappi-ia/tests/integration/test_contract.py` (respuestas de ejemplo del panel)
- Test: `rappi-ia/tests/integration/test_analytics_mvp.py`

**Interfaces:**
- Produces (todas `GET /analytics/<name>?source=` → `{source, data}`):
  - `offers` → `{"personas": int, "momentos": [{"momento", "mostradas", "aceptadas", "aceptacion_pct": float | null}]}`. `momento` sale de `payload->>'origen'`: `agent-<m>` y `mochi-<m>` → `<m>`; `agent-ask` y `chat` → `pregunta`; `para-ti` → `para_ti`; los servicios (`rappitravel`, `rappifavor`) y `aviso` no entran (tienen su propia vista); ausente u otro → `sin_momento`. `aceptacion_pct` solo con `mostradas >= 10` (la constante de `suggestions`). Orden fijo: `plan, carrito, checkout, proximo_pedido, sin_resultado, vertical_por_probar, pregunta, para_ti, sin_momento`, y solo los que tienen algo.
  - `game` → `{"personas": int, "rondas": int, "estrellas_promedio": float | null, "tarjetas": int, "por_vertical": [{"vertical_juego", "rondas", "tarjetas"}]}` (promedio solo con `rondas >= 5`).
  - `unmet` → `{"personas": int, "busquedas": int, "sin_resultado": int, "por_vertical": [{"vertical", "concepto", "sin_resultado"}]}` desde `search`, `ask` y `chat` con `unmet` no nulo; `concepto` es el nombre del concepto o `null` (nunca el texto buscado); sin conceptos `sensitive`; máximo 20 filas.
- Respuestas de ejemplo del panel: `test_contract.py` suma un destino `dashboard-empresa/src/fixtures/<name>.<source>.json` para estas tres métricas, escritas por `make contract`: la de `prototype` desde un recorrido preparado en el test (un plan aceptado, una oferta de carro mostrada, una ronda terminada, dos tarjetas, una búsqueda sin resultado) y la de `synthetic` desde `events.synth.generate` chico con semilla fija. El CI falla si quedan desactualizadas (igual que las de la app).

- [ ] **Step 1: Tests:** por métrica, forma y reglas: `test_offers_group_old_and_new_origins_by_moment`, `test_offers_unknown_origin_is_sin_momento`, `test_offers_rate_only_from_ten_shown`, `test_game_counts_rounds_cards_and_people`, `test_unmet_never_returns_query_text_or_sensitive_concepts`, `test_every_new_metric_never_mixes_sources` (Review Focus 1), `test_unknown_metric_is_404`.
- [ ] **Step 2: Correr y ver que fallan; implementar hasta verde.**
- [ ] **Step 3: Contrato:** `make contract` escribe las 6 respuestas de ejemplo del panel.
- [ ] **Step 4: Verificar** `make test && make lint`.
- [ ] **Step 5: Commit** `feat: el panel recibe ofertas por momento, juego y búsquedas sin resultado`.

### Task 4: Vista «Uso del MVP» en el panel

**Files:**
- Create: `dashboard-empresa/src/views/mvp/MvpUsageView.jsx` (+ un componente por sección, `mvp.css`, tests)
- Modify: `dashboard-empresa/src/App.jsx` (`VIEWS` suma al final `{id: 'mvp', label: 'Uso del MVP'}`, siempre visible), `dashboard-empresa/src/lib/labels.js` (`ENDPOINTS` suma las 3 y `services`, que faltaba), `dashboard-empresa/scripts/update-fixtures.mjs` (suma las 3)

**Interfaces:**
- Consumes: `useAnalytics('offers'|'game'|'unmet', source)` y los componentes de siempre (`Async`, `States`, `Headline`, `DataTable`, `HBar`, `ProvenanceBadge`).
- Produces: tres secciones con el patrón de `CrossVerticalView`:
  - «Ofertas del agente por momento»: tabla `momento` (etiqueta en español: «Plan», «Carro», «Antes de pagar», «Próximo pedido», «Sin resultado», «Vertical por probar», «Pregunta», «Para ti», «Sin momento»), mostradas, aceptadas, tasa (o «—»).
  - «Juego»: rondas, tarjetas, personas, estrellas promedio (o «—»), y la tabla por vertical.
  - «Búsquedas sin resultado»: cuántas de cuántas y la tabla por vertical y concepto.
  - Con `source === 'prototype'`, cada sección muestra el rótulo exacto «uso del MVP, pocas personas: no es evidencia» y `personas` («N personas»). Con `synthetic`, cada sección dice que son datos simulados (como las demás vistas); `offers` simulado sin momentos muestra el estado vacío «Los datos simulados no registran el momento de la oferta».

- [ ] **Step 1: Tests** (con las respuestas de ejemplo del backend): `the MVP view shows the three sections`, `prototype sections carry the not-evidence label and the people count`, `rates show a dash under the minimum`, `synthetic offers without moments show the empty state`, `offline uses saved data and says so` (Review Focus 5), `switching source refetches and never mixes` (`dataFrom`).
- [ ] **Step 2: Correr y ver que fallan; implementar hasta verde.**
- [ ] **Step 3: Verificar** `npm test && npm run lint && npm run build` (dashboard-empresa).
- [ ] **Step 4: Commit** `feat: el panel muestra el uso del MVP, separado de lo simulado`.

### Task 5: El recorrido de `mvp-check` se ve en el panel, y documentación

**Files:**
- Modify: `scripts/mvp-check.sh`, `prototipo-app/scripts/mvp-check.mjs` (o un script del panel), `CLAUDE.md`, `README.md`, `dashboard-empresa/README.md`, `docs/README.md`, `docs/instalacion.md`, `docs/demo.md`, `docs/decisiones.md`, `docs/diseno-ia.md` (definiciones de las 3 métricas)

- [ ] **Step 1:** `mvp-check` levanta además el panel en `:5185` (`VITE_API_URL=http://localhost:8010`) y suma la revisión «panel»: después de las otras, abre `?vista=mvp&fuente=prototipo` y comprueba que «Ofertas del agente por momento» muestra «Plan» con al menos 1 aceptada (el kit de la revisión 3), que «Juego» muestra al menos 1 tarjeta (la revisión 4) y que se ve el rótulo «uso del MVP, pocas personas: no es evidencia». Esperado: **7 de 7**. Puertos libres requeridos: 8010, 5184 y 5185.
- [ ] **Step 2: Documentación:** el panel deja de ser «para más adelante»: es parte del MVP, conectado a la API, con su vista «Uso del MVP»; los eventos del juego; las 3 métricas y su privacidad; `mvp-check` 7 de 7.
- [ ] **Step 3: Verificar** todas las suites y `make mvp-check` → 7 de 7.
- [ ] **Step 4: Commit** `docs: etapa 6 del MVP, el panel conectado`.
