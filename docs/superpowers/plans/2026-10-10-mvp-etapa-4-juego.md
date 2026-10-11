# MVP etapa 4: conocimiento y juego en el RAG — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las 108 tarjetas del juego, los desafíos y el progreso de cada persona salen de la base a través de la API, y el agente muestra un «¿Sabías que…?» ligado a lo buscado.

**Architecture:** Las tarjetas pasan a un archivo versionado de rappi-ia (`rappi_ia/game/knowledge.json`) que `rappi-ia knowledge` carga en `knowledge_cards` y liga a conceptos (reglas + revisión a mano registrada en `card_concepts.toml`). Un router `/game` sirve tarjetas, desafíos armados en vivo desde `concept_assortment` y `knowledge_edges`, y el estado del juego por usuario (`game_state`). La app deja de leer `knowledge.json`, `verticales.json` y `localStorage` para el juego: las reglas del juego (XP, niveles, misión, armar la ronda) siguen en la app.

**Tech Stack:** Postgres 17 + pgvector, FastAPI, psycopg 3, pytest; React 19 + Vite, vitest, Testing Library; Playwright (`make mvp-check`).

**Spec:** `docs/superpowers/specs/2026-10-10-mvp-integrado-design.md` (§3 «Juego», §4 «Etapa 4»).

## Global Constraints

- Código en inglés; todo lo que ve el usuario (textos, logs, CLI, comentarios de tablas, docs) en español.
- El agente se llama en el código `rappi_agent` / `RappiAgent` y sus rutas son `/agent/ask`, `/agent/offer`, `/agent/plans`. El nombre visible sale de `config.AGENT_NAME` (backend) y `prototipo-app/src/agent/name.js` (app). Nunca escribir «Mochi» ni «chat» en código nuevo. La especificación dice `/chat` y `did_you_know` en `/chat`: aquí es `/agent/ask`.
- Migraciones solo en `rappi-scraper/src/rappi_scraper/storage/migrations/`; la nueva es `028_game.sql`. Cada tabla y columna nueva lleva `COMMENT` en español.
- Tablas propias para lo derivado (`build_search_documents` borra lo que no regenera).
- Datos de usuarios: solo `source = 'synthetic'` o `'prototype'`. El estado del juego solo se escribe para usuarios `prototype` (`events.ensure_user`).
- Guardias: el agente nunca propone por su cuenta Farmacia, salud, bebé ni alcohol (`offers/guards.py`: `OFFER_BLOCKED_VERTICALS = ("farmacia", "licores")`). Ningún concepto `sensitive` aparece en un desafío ni en una liga de tarjeta.
- La app no tiene respaldo local: si la API falla, la pantalla que lo necesita muestra «Sin conexión» con «Reintentar».
- Las respuestas de ejemplo de `prototipo-app/src/api/fixtures/` las escribe `make contract` (rappi-ia); toda forma nueva de respuesta tiene su `Example` en `tests/integration/test_contract.py`.
- Antes de dar una tarea por terminada: `make test` y `make lint` en rappi-ia (y en rappi-scraper si toca la migración), `npm test` y `npm run lint` en prototipo-app. Los tests de integración usan `rappi_ia_test`.
- Vertical del juego: `GAME_VERTICALS = ("supermercado", "conveniencia", "turbo", "licores", "chocolateria", "restaurantes", "farmacia", "mall", "viajes")` (orden del pasaporte). `viajes` no tiene catálogo.

## Review Focus

1. **Un `user_id` de otra fuente o raro en `PUT /game/state/{user_id}`** (sintético, 65 caracteres, vacío): nunca escribe; responde 409 o 422. Test en Task 2.
2. **Una tarjeta que sale del archivo** después de jugarla: `rappi-ia knowledge` borra su fila y sus ligas, y el estado guardado que la nombra se limpia al leerlo (no rompe el álbum). Tests en Task 1 y Task 2.
3. **La API cae a mitad de juego:** guardar falla sin perder el progreso en pantalla y se reintenta con la acción siguiente; la ronda que no puede pedir su desafío muestra «Sin conexión» con «Reintentar». Tests en Task 5 y Task 6.
4. **Navegador con progreso viejo y servidor con progreso:** gana el servidor y el local se borra; un navegador con progreso local y servidor vacío lo sube una sola vez (la segunda carga no vuelve a subir). Tests en Task 5.
5. **«¿Sabías que…?»** nunca trae una tarjeta de Farmacia o Licores, ni una ligada a un concepto sensible o con restricción de edad, ni una que la persona ya descubrió. Tests en Task 4.

---

### Task 1: Tarjetas en la base (`knowledge_cards`) con sus ligas a conceptos

**Files:**
- Create: `rappi-scraper/src/rappi_scraper/storage/migrations/028_game.sql`
- Create: `rappi-ia/src/rappi_ia/game/__init__.py`, `rappi-ia/src/rappi_ia/game/cards.py`
- Create: `rappi-ia/src/rappi_ia/game/knowledge.json` (copia exacta de `prototipo-app/src/game/knowledge.json`; la app la sigue usando hasta la Task 5)
- Create: `rappi-ia/src/rappi_ia/game/card_concepts.toml`
- Modify: `rappi-ia/src/rappi_ia/cli.py` (comando `knowledge`), `rappi-ia/Makefile` (`knowledge` en `post-refresh`, después de `concepts`), `rappi-ia/src/rappi_ia/demo/seed.py` (`seed_demo` corre `build_relations` y `load_knowledge` al final)
- Test: `rappi-ia/tests/unit/test_knowledge_cards.py`, `rappi-ia/tests/integration/test_knowledge_load.py`

**Interfaces:**
- Produces (`rappi_ia/game/__init__.py`): `GAME_VERTICALS` (tupla de Global Constraints).
- Produces (`rappi_ia/game/cards.py`):
  - `CARDS_FILE: Path`, `LINKS_FILE: Path`
  - `read_cards(path: Path = CARDS_FILE) -> list[dict]` — lee y valida; `ValueError` con mensaje en español si algo no cumple.
  - `rule_links(card: dict, matcher) -> set[str]` — conceptos que la regla propone (matcher de `concepts.assign.concept_matcher(taxonomy)`, el de productos, sobre `title`, `text`, `question` y `explanation`; nunca sobre `options`, que traen distractores; sin conceptos `sensitive`).
  - `read_links(path: Path = LINKS_FILE) -> dict[str, CardLinks]` con `CardLinks(concepts: tuple[str, ...], rejected: tuple[str, ...])`.
  - `load_knowledge(conn) -> dict` — idempotente; escribe tarjetas y ligas, borra las que ya no están, hace commit y devuelve `{"tarjetas": n, "ligas": m}`.
  - `list_cards(conn, vertical: str | None = None) -> list[dict]` — en orden del archivo; cada tarjeta con las mismas claves del JSON (solo las de su tipo) más `concepts: list[str]` ordenada.
- Tablas (028): `knowledge_cards`, `knowledge_card_concepts`, `game_state` (esta la usa la Task 2; va en la misma migración).

**Migración `028_game.sql`:**
- `knowledge_cards`:
  - `card_id text PRIMARY KEY`
  - `vertical text NOT NULL CHECK (vertical IN (…los 9 de GAME_VERTICALS…))`
  - `kind text NOT NULL CHECK (kind IN ('dato','pregunta'))`
  - `position integer NOT NULL UNIQUE` (orden del archivo)
  - `title`, `text`, `question`, `explanation` (`text`, nulos según el tipo); `options jsonb`; `answer smallint`
  - `source_title text NOT NULL`, `source_url text NOT NULL CHECK (source_url LIKE 'https://%')`
  - `updated_at timestamptz NOT NULL DEFAULT now()`
  - Un CHECK por tipo: si es `dato`, `title` y `text` no nulos; si es `pregunta`, `question`, `options`, `answer` y `explanation` no nulos.
- `knowledge_card_concepts`:
  - `card_id → knowledge_cards ON DELETE CASCADE`
  - `concept_id → concepts ON DELETE CASCADE`
  - `method text NOT NULL CHECK (method IN ('regla','manual'))`
  - `PRIMARY KEY (card_id, concept_id)`
  - Índice por `concept_id`.
- `game_state`:
  - `user_id text PRIMARY KEY REFERENCES app_users ON DELETE CASCADE`
  - `state jsonb NOT NULL`
  - `updated_at timestamptz NOT NULL DEFAULT now()`
- `COMMENT ON TABLE` y `COMMENT ON COLUMN`, en español, para cada tabla y columna.

**`card_concepts.toml`:**

- Formato:

  ```toml
  version = "2026-10-10"
  revision = "Revisado a mano el 10-10-2026: cada propuesta de la regla quedó aceptada o rechazada."

  [cards.supermercado-01]
  concepts = ["…"]   # ligas aceptadas: de la regla (method 'regla') o agregadas a mano (method 'manual')
  rejected = ["…"]   # propuestas de la regla que no calzan con la tarjeta
  ```

- **Cómo se arma:**
  1. Genera las propuestas con `rule_links` para las 108 tarjetas.
  2. Revisa cada propuesta a mano contra el texto de la tarjeta.
  3. Pon cada propuesta en `concepts` si la tarjeta habla de ese concepto, y en `rejected` si no.
  4. Agrega a `concepts` el concepto evidente que la regla no vio (como máximo 3 por tarjeta).
- **Registro:** deja en el informe una tabla con las propuestas que rechazaste y las que agregaste a mano, con su motivo en una línea.
- **Tarjetas sin concepto:** quedan con `concepts = []`. Todas las tarjetas tienen su sección.

- [ ] **Step 1: Tests unitarios del archivo** (`tests/unit/test_knowledge_cards.py`; mueven a pytest lo que validaba `prototipo-app/src/game/knowledge.test.js`):
  - `test_has_six_facts_and_six_questions_per_vertical`: por cada vertical de `GAME_VERTICALS`, 6 `dato` y 6 `pregunta`; 108 en total.
  - `test_ids_are_unique_and_prefixed_by_vertical`: el formato del id es `^{vertical}-\d\d$`.
  - `test_texts_fit_the_card`: `LIMITS = {"title": 40, "text": 200, "question": 140, "option": 60, "explanation": 200}`.
  - `test_every_source_is_https`.
  - `test_questions_have_three_distinct_options_and_a_valid_answer`: `answer` está en {0, 1, 2}.
  - `test_answers_do_not_all_sit_in_the_same_position_per_vertical`.
  - `test_read_cards_rejects_a_broken_card`: una tarjeta sin `source` hace que `read_cards` lance `ValueError`.
  - `test_every_card_has_a_reviewed_links_entry`.
  - `test_every_rule_proposal_was_reviewed`: `rule_links(card) ⊆ concepts ∪ rejected`.
  - `test_linked_concepts_exist_and_are_not_sensitive`: son conceptos (no grupos) de `taxonomy.toml` con `sensitive = false`.
  - `test_rule_links_ignore_options`: una pregunta cuyo único concepto está en una alternativa no propone nada.
- [ ] **Step 2: Correr y ver que fallan.** Comando: `cd rappi-ia && .venv/bin/pytest tests/unit/test_knowledge_cards.py -q`. Esperado: FAIL, porque no existe `rappi_ia.game.cards`.
- [ ] **Step 3: Implementar** `game/__init__.py`, `cards.py` (`read_cards`, `rule_links`, `read_links`), copiar `knowledge.json` y armar y revisar `card_concepts.toml` como dice arriba. Los unitarios pasan.
- [ ] **Step 4: Tests de integración** (`tests/integration/test_knowledge_load.py`, con el fixture `db` y `build_concepts`):
  - `test_load_knowledge_writes_108_cards_and_reviewed_links`: las ligas de la base son las de `card_concepts.toml`, con `method` `regla` o `manual` según `rule_links`.
  - `test_load_knowledge_twice_does_not_duplicate`.
  - `test_card_removed_from_file_leaves_the_base`: carga un archivo de 2 tarjetas (pasando las rutas como parámetros) y la que falta se borra junto con sus ligas.
  - `test_list_cards_keeps_file_order_and_shape`: un `dato` no trae `question`, una `pregunta` no trae `title`, y ambas traen `concepts`.
  - `test_list_cards_by_vertical`.
  - `test_seed_demo_loads_cards_and_relations`: después de `seed_demo` hay 108 tarjetas y aristas `sustituye` y `conflicto` en `knowledge_edges`.
  - Firma que necesitan los tests: `load_knowledge(conn, cards_path=CARDS_FILE, links_path=LINKS_FILE)`.
- [ ] **Step 5: Implementar** la migración, `load_knowledge` y `list_cards`, el comando `rappi-ia knowledge` (en `COMMANDS` y `build_parser`; imprime las cuentas en español), `post-refresh: … concepts knowledge embed …` en el Makefile, y `seed_demo` con `build_relations(conn)` y `load_knowledge(conn)` después de `build_concepts`.
- [ ] **Step 6: Verificar.** Comando: `cd rappi-ia && make test && make lint`, y `cd rappi-scraper && make lint`. Esperado: todo en verde.
- [ ] **Step 7: Commit.** Mensaje: `feat: tarjetas del juego en la base, ligadas a conceptos`.

### Task 2: API del juego: tarjetas y progreso por usuario

**Files:**
- Create: `rappi-ia/src/rappi_ia/game/state.py`, `rappi-ia/src/rappi_ia/api/game.py`
- Modify: `rappi-ia/src/rappi_ia/api/app.py` (registrar el router; CORS `allow_methods` suma `"PUT"`), `rappi-ia/tests/unit/test_cors.py`, `rappi-ia/tests/integration/test_contract.py`
- Test: `rappi-ia/tests/integration/test_game_api.py`

**Interfaces:**
- Consumes: `list_cards`, `GAME_VERTICALS` (Task 1); `events.store.ensure_user(conn, user_id, source)`.
- Produces (`rappi_ia/game/state.py`):
  - `get_state(conn, user_id: str) -> dict | None`: lo guardado, limpio con `clean_state`.
  - `save_state(conn, user_id: str, state: dict) -> dict`: crea el usuario `prototype` si falta y guarda `clean_state(state)`. Si el usuario es de otra fuente, lanza `ValueError` y no escribe.
  - `clean_state(conn, state: dict) -> dict`: quita los ids de tarjeta que no están en `knowledge_cards` (en `discovered`, `cards` y `opened`) y las verticales que no están en `GAME_VERTICALS` (en `visited` y en las claves de `discovered`, `correct` y `answered`).
- Produces (HTTP, router `APIRouter(prefix="/game", tags=["game"])`):
  - `GET /game/cards?vertical=` → `{"cards": [...]}`. Cada tarjeta tiene la forma de `list_cards`. Una vertical desconocida da 422.
  - `GET /game/state/{user_id}` → `{"state": {...}}`, o 204 si no hay nada guardado.
  - `PUT /game/state/{user_id}` con cuerpo `{"state": {...}}` → `{"state": <limpio>}`. Un usuario de otra fuente da 409.
  - `user_id`: de 1 a 64 caracteres; si no, 422.
- Modelo Pydantic del cuerpo (`Clean`, `extra="forbid"`): la forma de `initialState()` de `prototipo-app/src/game/progress.js`.
  - Campos de primer nivel: `version: Literal[1]`, `xp: int ≥ 0`, `discovered: dict[str, list[str]]`, `correct: dict[str, int ≥ 0]`, `answered: dict[str, int ≥ 0]`, `cards: list[str]`, `opened: list[str]`, `seenIntro: bool`, `visited: list[str]`.
  - `daily`: `{date: str | None, discovered: int, correct: int, opened: int, done: bool}`.
  - `streak`: `{count: int ≥ 0, lastDate: str | None}`.
  - Topes contra cuerpos gigantes: cada lista tiene máximo 200 elementos; cada dict, máximo 20 claves.

- [ ] **Step 1: Tests** (`test_game_api.py`, cliente con `seed_demo` como `test_agent_offer.py`):
  - **Tarjetas:**
    - `test_cards_returns_all_108_in_file_order`.
    - `test_cards_filters_by_vertical`: `viajes` devuelve 12.
    - `test_cards_unknown_vertical_is_422`.
  - **Leer y guardar el progreso:**
    - `test_state_is_204_before_saving`.
    - `test_put_then_get_returns_the_same_state`.
    - `test_put_creates_a_prototype_user`.
    - `test_put_drops_unknown_cards_and_verticals`.
    - `test_put_for_a_synthetic_user_is_409_and_writes_nothing`.
    - `test_put_rejects_bad_ids_and_bodies`: `user_id` de 65 caracteres, `xp` negativo, una clave extra y `cards` con 201 elementos dan 422.
  - **Borrado y limpieza:**
    - `test_forgetting_the_user_deletes_the_game_state`: `DELETE /profile/{id}` borra la fila por la cascada.
    - `test_state_naming_a_removed_card_is_cleaned_on_read`.
  - **CORS:** en `test_cors.py`, el preflight `PUT` desde `http://localhost:5174` queda permitido.
- [ ] **Step 2: Correr y ver que fallan.** Comando: `.venv/bin/pytest tests/integration/test_game_api.py tests/unit/test_cors.py -q`. Esperado: FAIL con 404 o 405.
- [ ] **Step 3: Implementar** `state.py`, `api/game.py`, el registro en `app.py` (junto a `catalog_router` y `agent_router`) y el `"PUT"` en CORS.
- [ ] **Step 4: Contrato.** Agregar estos `Example`, en este orden:
  1. `Example("game-cards", "GET", "/game/cards?vertical=supermercado")`
  2. `Example("game-state-put", "PUT", "/game/state/u-contrato", {"state": <estado con 1 tarjeta descubierta en supermercado>})`
  3. `Example("game-state", "GET", "/game/state/u-contrato")`

  Si los `Example` no comparten base dentro de la corrida, `game-state` necesita su propia preparación: revisar cómo corre el contrato y dejar la preparación explícita en el test.

  Correr `make contract`; quedan escritas las respuestas de ejemplo nuevas.
- [ ] **Step 5: Verificar.** Comando: `make test && make lint` en rappi-ia. Esperado: en verde, y `git status` muestra las 3 respuestas de ejemplo nuevas.
- [ ] **Step 6: Commit.** Mensaje: `feat: API del juego con tarjetas y progreso por usuario`.

### Task 3: Desafíos armados en vivo desde el RAG

**Files:**
- Create: `rappi-ia/src/rappi_ia/game/challenges.py`
- Modify: `rappi-ia/src/rappi_ia/api/game.py`, `rappi-ia/src/rappi_ia/config.py` (`GAME_MIN_ITEMS`, variable de entorno, por defecto 20), `rappi-ia/tests/integration/test_contract.py`
- Test: `rappi-ia/tests/unit/test_game_challenges.py` (lógica pura sobre un `ChallengeData` armado a mano), `rappi-ia/tests/integration/test_game_challenge_api.py`

**Interfaces:**
- Produces (`rappi_ia/game/challenges.py`):
  - `KINDS = ("tipico", "combo", "sustituto", "imposible")`
  - `ChallengeData` (dataclass), que se lee de la base una vez por llamada:
    - `concepts: dict[str, ConceptInfo]` con `ConceptInfo(id, name, emoji, home: str | None, items: dict[str, int])`, solo conceptos no sensibles;
    - `complements`, `substitutes`, `conflicts`: `dict[str, set[str]]`, simétricos.
  - `read_challenge_data(conn) -> ChallengeData`. De dónde sale cada cosa:
    - `items` sale de `concept_assortment`;
    - `home` sale de `agent.verticals.typical_verticals(conn)`;
    - `complements` sale de `knowledge_edges` con `relation='complementa'`, `method='curado'`, de concepto a concepto;
    - `substitutes` sale de `relation='sustituye'`, de concepto a concepto;
    - `conflicts` sale de `relation='conflicto'`, expandiendo los nodos `group:` a sus conceptos hijos (`concepts.parent_id`).
  - `build_challenge(data: ChallengeData, vertical: str, seed: str, min_items: int) -> dict | None`: pura y determinista con `random.Random(f"{vertical}|{seed}")`. Si la vertical no tiene ningún tipo disponible, devuelve `None`.
  - `make_challenge(conn, vertical, seed, min_items=config.GAME_MIN_ITEMS) -> dict | None`
- Produces (HTTP): `GET /game/challenge?vertical=&seed=`:
  - Devuelve 200 con `{id, kind, vertical, anchor, question, options: [{id, label}] (4), answer, explanation}`.
  - Responde 204 si no hay desafío: `viajes` (no tiene catálogo) o una vertical sin datos suficientes.
  - Una vertical desconocida da 422. `seed` tiene de 1 a 64 caracteres.
- **Reglas de cada tipo:** son las de `prototipo-app/src/game/challenges.js`, que hay que leer y portar, con los textos en español copiados tal cual.
  - El significado de «pertenece» y de «típico» no cambia: `belongs(c, v)` es `items[v] >= min_items`, y típico es `home == v`.
  - Las etiquetas son `"<emoji> <nombre>"`.
  - `puente` y `trivia` se van (ver Ruling 1 en el ledger).

- [ ] **Step 1: Tests unitarios.** Van sobre un `ChallengeData` chico armado en el test, y por cada tipo prueban la pregunta, las 4 alternativas distintas y que la correcta esté entre ellas:
  - `test_tipico_picks_a_typical_concept_and_three_outside_the_vertical`
  - `test_combo_picks_a_complement_and_unrelated_distractors`
  - `test_sustituto_picks_a_substitute`
  - `test_imposible_picks_a_conflict_against_safe_complements`
  - `test_same_seed_same_challenge_other_seed_can_differ`
  - `test_no_kind_available_returns_none`
  - `test_labels_are_emoji_and_name`
- [ ] **Step 2: Tests de integración** (`seed_demo`, con `GAME_MIN_ITEMS` bajo vía `monkeypatch` o parámetro):
  - `test_challenge_for_supermercado_has_four_options_and_answer`
  - `test_challenge_never_uses_a_sensitive_concept`: recorre 30 semillas en las 8 verticales.
  - `test_challenge_viajes_is_204`
  - `test_challenge_unknown_vertical_is_422`
  - `test_read_challenge_data_expands_group_conflicts`
- [ ] **Step 3: Correr y ver que fallan; luego implementar hasta verde.** Comando: `.venv/bin/pytest tests/unit/test_game_challenges.py tests/integration/test_game_challenge_api.py -q`.
- [ ] **Step 4: Contrato.**
  - Agregar `Example("game-challenge", "GET", "/game/challenge?vertical=supermercado&seed=0")`. El contrato corre con `GAME_MIN_ITEMS=1` (el catálogo de prueba es chico), y la respuesta tiene que ser 200 con desafío.
  - Correr `make contract`.
- [ ] **Step 5: Verificar.** Comando: `make test && make lint` en rappi-ia.
- [ ] **Step 6: Commit.** Mensaje: `feat: desafíos del juego armados en vivo desde conceptos y relaciones`.

### Task 4: «¿Sabías que…?» en la respuesta del agente

**Files:**
- Modify: `rappi-ia/src/rappi_ia/game/cards.py` (`did_you_know`), `rappi-ia/src/rappi_ia/api/app.py` (ruta `/agent/ask`), `rappi-ia/tests/integration/test_contract.py`
- Test: `rappi-ia/tests/integration/test_did_you_know.py`

**Interfaces:**
- Consumes: `knowledge_card_concepts` y `get_state` (Tasks 1-2); `offers.guards.OFFER_BLOCKED_VERTICALS`.
- Produces: `did_you_know(conn, concept_ids: list[str], user_id: str | None) -> dict | None`.
  - **Devuelve** el primer `dato` (en orden de `concept_ids` y después de `position`) que cumpla todo esto:
    - está ligado a uno de los conceptos;
    - no es de una vertical de `OFFER_BLOCKED_VERTICALS`;
    - no está ligado a ningún concepto `sensitive` ni `age_restricted`;
    - no está en `discovered` ni en `cards` del estado del usuario.
  - **Forma:** `{id, vertical, title, text, source: {title, url}}`.
- Produces (HTTP): `/agent/ask` agrega `"did_you_know"` a la respuesta solo cuando hay tarjeta y `mode == "propuesta"`. Usa los conceptos de `response["intent"]["concepts"]`; si la respuesta no trae `intent`, no agrega nada.

- [ ] **Step 1: Tests:**
  - **Cuándo aparece:**
    - `test_ask_adds_a_fact_linked_to_the_searched_concept`: elige en `card_concepts.toml` un concepto que tenga un `dato` de una vertical permitida y una consulta del catálogo de prueba que lo entienda.
    - `test_fact_already_discovered_is_not_repeated`: con un estado guardado que ya tiene ese dato, viene el siguiente o ninguno.
    - `test_mode_actual_has_no_fact`.
  - **Guardias:**
    - `test_no_fact_from_farmacia_or_licores`: con «cerveza» no viene ningún dato de licores.
    - `test_no_fact_linked_to_a_sensitive_or_age_restricted_concept`: unitario sobre `did_you_know` con ligas insertadas a mano.
  - **Sin dato:** `test_query_without_linked_card_has_no_key`.
- [ ] **Step 2: Correr y ver que fallan; implementar hasta verde.**
- [ ] **Step 3: Contrato.** `Example("agent-ask-dato", "POST", "/agent/ask", {...})` con la consulta del primer test, usuario `u-contrato-dato`. Correr `make contract`.
- [ ] **Step 4: Verificar.** Comando: `make test && make lint` en rappi-ia.
- [ ] **Step 5: Commit.** Mensaje: `feat: el agente muestra un dato ligado a lo buscado`.

### Task 5: La app lee tarjetas y progreso del servidor

**Files:**
- Create: `prototipo-app/src/api/game.js`, `prototipo-app/src/game/saver.js`, `prototipo-app/src/game/saver.test.js`
- Modify:
  - `prototipo-app/src/game/knowledge.js`: registro cargado desde la API, en vez de importar el JSON.
  - `prototipo-app/src/game/storage.js`: solo queda lo necesario para leer el progreso viejo del navegador una vez.
  - `prototipo-app/src/state/GameContext.jsx`
  - `prototipo-app/src/game/testSeed.js`, `prototipo-app/src/api/testing.js`: rutas por defecto del juego en `stubApi`.
  - Tests del juego que hoy siembran `localStorage`.
- Delete: `prototipo-app/src/game/knowledge.json`, `prototipo-app/src/game/knowledge.test.js` (su validación ya está en pytest; las pruebas de `asChallenge` se pasan a un test nuevo `knowledge.test.js` que usa la respuesta de ejemplo `game-cards`).
- Test: `prototipo-app/src/state/GameContext.test.jsx`, `prototipo-app/src/game/storage.test.js`

**Interfaces:**
- Consumes (HTTP): `GET /game/cards`, `GET` y `PUT /game/state/{user_id}` (Task 2).
- Produces (`src/api/game.js`):
  - `cards()` → `Promise<card[]>`
  - `gameState(userId)` → `Promise<state | null>` (null en 204)
  - `saveGameState(userId, state)` → `Promise<state>`
  - `challenge(vertical, seed)` → `Promise<challenge | null>` (null en 204; lo usa la Task 6)
  - Todas pasan por `request` de `client.js`.
- Produces (`src/game/knowledge.js`): `setKnowledge(cards)` reemplaza el registro. `KNOWLEDGE`, `cardsOf`, `datosOf`, `preguntasOf`, `cardById` y `asChallenge` mantienen su firma.
- Produces (`src/game/saver.js`): `createSaver(send) -> { save(state), pending() }`.
  - Una sola petición en vuelo. Si llegan estados mientras tanto, solo se envía el último.
  - Si falla, el estado queda pendiente y se reenvía con el próximo `save`.
- Produces (`GameProvider`): carga `cards()` y después `gameState(userId())`.
  - **Mientras carga:** no pinta los hijos y muestra el mismo aviso de carga de la puerta de conexión.
  - **Si falla:** muestra «Sin conexión» con «Reintentar» (reusar el componente de `ConnectionGate`).
  - **Migración única:**
    - **Servidor sin estado y navegador con progreso** (clave `rappi-proto-juego-v1` o el pasaporte viejo): limpiar con la validación actual de `storage.js`, hacer `PUT` y, si sale bien, borrar las claves locales.
    - **Servidor con estado:** se usa ese y se borran las claves locales.
  - **Guardado:** cada acción guarda con el `saver`. `reset` guarda `initialState()`.
  - **Nunca escribe `localStorage`.**

- [ ] **Step 1: Tests:**
  - **`saver.test.js`:**
    - `sends one request at a time and only the latest state`
    - `a failed save is retried with the next save`
  - **`GameContext.test.jsx`:**
    - `loads cards and state from the API before rendering`
    - `shows Sin conexión with Reintentar when cards fail`
    - `migrates local progress once when the server has none and clears it`
    - `server progress wins over local progress and local is cleared`
    - `each action saves the new state to the server`
    - `reset saves the initial state`
    - `a failed save keeps the progress on screen`
- [ ] **Step 2: Correr y ver que fallan.** Comando: `npx vitest run src/game/saver.test.js src/state/GameContext.test.jsx`.
- [ ] **Step 3: Implementar.** `testSeed.seed(patch)` pasa a fijar el estado que devuelve el servidor simulado, y `stored()` devuelve el cuerpo del último `PUT`. Ajustar los tests del juego a eso, sin cambiar lo que comprueban.
- [ ] **Step 4: Verificar.** Comando: `npm test && npm run lint` en prototipo-app. Esperado: en verde.
- [ ] **Step 5: Commit.** Mensaje: `feat: el juego lee tarjetas y progreso desde la API`.

### Task 6: La ronda pide su desafío a la API; se van los datos locales del juego

**Files:**
- Modify:
  - `prototipo-app/src/game/round.js`: `makeRound(state, vertical, challenge)`; `challenge` puede ser `null`.
  - `prototipo-app/src/screens/game/Round.jsx`: pide el desafío con `useApi`; si falla, muestra «Sin conexión» con «Reintentar»; `KIND_TITLES` queda sin `puente` ni `trivia`.
  - `prototipo-app/src/game/verticals.js`: `PASSPORT_ORDER` y `LABELS` como constantes propias. Los valores son los de hoy: los 8 de `verticales.json` más `viajes: 'Viajes'`.
  - `NEVER_PUSHED`: pasa a `new Set(['farmacia', 'licores'])`.
  - `prototipo-app/src/screens/game/Settings.jsx`: sin `DATA.asOf`.
  - Los que importaban `game/data.js`.
  - `prototipo-app/package.json`: sin el script `datos`.
  - `prototipo-app/README.md`.
- Delete:
  - `prototipo-app/src/game/challenges.js` y `challenges.test.js`
  - `prototipo-app/src/game/data.js` y `data.test.js`
  - `prototipo-app/src/data/verticales.json`
  - `prototipo-app/scripts/extraer-datos.mjs`
  - `rng.js`, si queda sin uso
- Test: `prototipo-app/src/game/round.test.js`, `prototipo-app/src/screens/game/play.test.jsx`, `prototipo-app/src/game/passport.test.js`

**Interfaces:**
- Consumes: `challenge(vertical, seed)` (Task 5) y `GET /game/challenge` (Task 3). La semilla es `String(state.answered[vertical] ?? 0)`, igual que hoy.

- [ ] **Step 1: Tests:**
  - **`round.test.js`:**
    - `the middle step is the API challenge`
    - `without a challenge the middle step is a third question` (lo que hoy pasa en Viajes)
  - **`play.test.jsx`:**
    - `the round shows the challenge from the API`
    - `the round shows Sin conexión with Reintentar when the challenge fails, and retries`
  - **`passport.test.js`:** `the waiting round never picks Licores or Farmacia`.
  - **`LiveHomeFeed.test.jsx`:** `Licores is never offered as the vertical to try`.
- [ ] **Step 2: Correr y ver que fallan; implementar hasta verde; borrar los archivos de la lista.** Comprobación: `grep -rn "verticales.json\|game/data\|challenges.js\|extraer-datos" prototipo-app/src prototipo-app/scripts prototipo-app/package.json` → nada.
- [ ] **Step 3: Verificar.** Comando: `npm test && npm run lint` en prototipo-app.
- [ ] **Step 4: Commit.** Mensaje: `feat: la ronda usa el desafío de la API y se van los datos locales del juego`.

### Task 7: «¿Sabías que…?» en la respuesta del agente en la app

**Files:**
- Modify:
  - `prototipo-app/src/api/client.js`: `toMessage` mapea `did_you_know` a `didYouKnow`.
  - `prototipo-app/src/components/assistant/AgentMessage.jsx`
  - El CSS del asistente, junto al resto de estilos de `AgentMessage`.
- Test: `prototipo-app/src/components/assistant/AgentMessage.test.jsx`, `prototipo-app/src/api/client.test.js`

**Interfaces:**
- Consumes: la respuesta de ejemplo `agent-ask-dato` (Task 4) y `useGame().discover(vertical, cardId)`.
- Produces: el bloque «¿Sabías que…?» aparece después del texto revelado.
  - Muestra el título, el texto y la línea «Fuente: <título>», con enlace `target="_blank" rel="noopener noreferrer"`.
  - Al mostrarse llama una sola vez `discover(card.vertical, card.id)`: mostrarla cuenta como descubierta.

- [ ] **Step 1: Tests:**
  - `toMessage maps did_you_know` (con la respuesta de ejemplo `agent-ask-dato`)
  - `shows ¿Sabías que…? with title, text and source link`
  - `showing the fact discovers the card once`
  - `no fact, no block`
- [ ] **Step 2: Correr y ver que fallan; implementar hasta verde.**
- [ ] **Step 3: Verificar.** Comando: `npm test && npm run lint` en prototipo-app.
- [ ] **Step 4: Commit.** Mensaje: `feat: la app muestra el dato del agente y lo suma al álbum`.

### Task 8: Recorrido de punta a punta y documentación

**Files:**
- Modify:
  - `scripts/mvp-check.mjs` (raíz), o donde viva `make mvp-check`: la API liviana arranca con `GAME_MIN_ITEMS=1`, y se suman dos revisiones.
  - Documentación: `README.md`, `docs/demo.md`, `docs/decisiones.md` (una fila con fecha 10-10-2026), `docs/instalacion.md` (`knowledge` en `post-refresh`), `CLAUDE.md` (tablas del juego y `rappi-ia knowledge`), `prototipo-app/README.md`.
  - Diagramas: las fuentes de `docs/diagramas-fuente/` que nombren `verticales.json` o `knowledge.json` de la app. Se actualiza solo el JSON fuente y se anota en el informe que el HTML/PNG se regenera con Archify.

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Revisión «juego».**
  - Abre el juego y empieza una ronda en el Súper.
  - La primera tarjeta tiene el título de la primera tarjeta de Súper de `GET /game/cards?vertical=supermercado`.
  - Avanza un paso y comprueba que existe la fila de `game_state` del usuario de la prueba, con esa tarjeta en `discovered`. La prueba consulta la base como ya lo hace con el pedido.
- [ ] **Step 2: Revisión «dato».** Pregunta al agente la consulta de `agent-ask-dato` y comprueba que aparece «¿Sabías que…?».
- [ ] **Step 3: Correr.** Comando: `make mvp-check`. Esperado: 6 de 6 (las 4 de antes más estas 2). No correrlo junto con `make test` de rappi-ia.
- [ ] **Step 4: Documentación.** Las tarjetas y su revisión viven en `rappi-ia`, se cargan con `rappi-ia knowledge` y corren en `post-refresh`. La ronda pide su desafío a la API, y el progreso del juego vive en el servidor (se migra una vez desde el navegador).
- [ ] **Step 5: Verificar.** Comandos: `make test` y `make lint` (rappi-ia y rappi-scraper), y `npm test` y `npm run lint` (prototipo-app y dashboard-empresa).
- [ ] **Step 6: Commit.** Mensaje: `docs: etapa 4 del MVP, juego y conocimiento en el RAG`.
