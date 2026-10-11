# MVP etapa 7: Jev en el proceso semanal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jev (el modelo «System One» de TypeSafe) queda construido de punta a punta y apagado: planillas para juzgar, cliente fino probado con un falso, caché de juicios, etiquetado de categorías, juez de búsqueda, piloto que mide los criterios y su integración en `post-refresh` —que solo se activa con la clave del usuario y un piloto aprobado—. El usuario solo pone `TYPESAFE_API_KEY`, juzga las dos planillas y corre el piloto.

**Architecture:** `rappi_ia/jev.py` habla con `POST https://api.typesafe.ai/v1/systemone` usando `requests` (ya es dependencia), con hilos en paralelo, reintentos cortos y un tope por corrida; sin clave devuelve `None` y nada cambia. El etiquetado (`concepts/jev_map.py`) y el juez (`eval/judge.py`) son módulos de dominio que reciben un cliente (real o `FakeJev`). La adopción vive en un archivo versionado (`eval/jev-adopcion.json`) que el piloto propone y el usuario confirma; `post-refresh` llama a Jev solo si hay clave y adopción.

**Tech Stack:** Python 3.13, requests, psycopg 3, pytest; Postgres 17; Archify (diagrama).

**Spec:** `docs/superpowers/specs/2026-10-10-mvp-integrado-design.md` (§4 «Etapa 7», §7 «Jev en vivo… fuera de alcance», §8 riesgo «Jev no pasa el piloto»). Diseño de referencia: `~/Documents/Rappi-jev/diseno-jev.md` (borrador del 28-09; las cifras del repo mandan sobre las del borrador).

## Global Constraints

- Jev es **opcional y fuera de línea**: sin `TYPESAFE_API_KEY`, o si la API falla, `post-refresh` y todo lo demás siguen igual y terminan con código 0. Jev **nunca** reordena resultados en vivo ni corre en la API.
- Solo datos públicos van a Jev: nombres, categorías y ejemplos del catálogo y las consultas de `eval/queries.json`; **nunca** búsquedas ni eventos de personas.
- Modelo fijado: `jev-1.13.0` (`JEV_MODEL`, configurable). Cada juicio guardado lleva `model_version`.
- Los datos descargados no van a git: las planillas con textos viven en `rappi-ia/data/eval/` (ignorado); en git solo ids y juicios.
- CI sin red: todos los tests usan `FakeJev`; ningún test llama a la API real.
- Código en inglés; lo que ve el usuario (CLI, planillas, informes, docs) en español. Migraciones solo en `rappi-scraper/.../migrations/`; la nueva es `030_jev.sql`, con `COMMENT` en español.
- Guardias: un concepto `sensitive` o `age_restricted` nunca se asigna solo por Jev a una categoría cuyo resto dice lo contrario (va a revisión humana).

## Review Focus

1. **Sin clave o con la API caída** (401, 429, 529, timeout): `make post-refresh` termina bien, no escribe nada de Jev y lo dice en una línea. Tests en Task 1 y Task 7.
2. **Caché:** la segunda corrida del juez no vuelve a llamar a Jev para los mismos pares y modelo. Test en Task 5.
3. **Tope de gasto:** una corrida nunca hace más de `JEV_MAX_REQUESTS` peticiones (por defecto 3000) y avisa si se queda corta. Test en Task 1.
4. **Planillas mal llenadas** (filas vacías, valores fuera de la lista, ids que ya no existen): el piloto las cuenta y las ignora con aviso, sin romperse. Tests en Task 3.
5. **Adopción sin piloto:** si `jev-adopcion.json` dice que no (o falta), `map-categories --jev` y el juez no corren aunque haya clave. Test en Task 7.

---

### Task 1: Cliente fino de Jev y su falso

**Files:**
- Create: `rappi-ia/src/rappi_ia/jev.py`, `rappi-ia/tests/fakes/jev.py` (o dentro de `tests/` según el patrón del repo), `rappi-ia/tests/unit/test_jev.py`
- Modify: `rappi-ia/src/rappi_ia/config.py` (`TYPESAFE_API_KEY`, `JEV_MODEL = "jev-1.13.0"`, `JEV_MAX_REQUESTS = 3000`, `JEV_PARALLEL = 16`), `rappi-ia/.env.example` (claves comentadas con su explicación)

**Interfaces:**
- Produces:
  - `Noul(instructions)`, `Choice(instructions, criteria: dict[str, str|dict])`, `Score(instructions, criteria: list[str])` → dict de pregunta.
  - `JevAnswer`: `noul: float | None`, `choice: str | None`, `score: float | None`, `probabilities: dict[str, float]`, `confidence: float | None`.
  - `JevClient(api_key, model, max_requests, parallel, timeout=30)` con `ask(state, questions) -> dict[str, JevAnswer] | None` y `ask_many(items: list[tuple[state, questions]]) -> list[dict | None]` (en paralelo, respeta el tope; un ítem que falla da `None`, no corta la corrida), y `stats` (`requests`, `input_tokens`, `failures`, `stopped_by_cap`).
  - Reintentos en 408/429/5xx/529 y errores de conexión: 2 reintentos con espera exponencial corta (respeta `Retry-After`); 401/403/422 no se reintentan.
  - `client_or_none() -> JevClient | None`: `None` sin clave.
  - `FakeJev`: misma interfaz, respuestas deterministas configurables por test, cuenta las llamadas.

- [ ] **Step 1: Tests** (con un `requests` simulado vía `monkeypatch`/adaptador, sin red): `test_no_key_means_no_client`, `test_request_shape_and_auth_header`, `test_retries_429_then_succeeds`, `test_401_is_not_retried_and_returns_none`, `test_cap_stops_and_reports`, `test_ask_many_isolates_failures`, `test_parses_noul_choice_score_answers`.
- [ ] **Step 2: Correr y ver que fallan; implementar hasta verde.**
- [ ] **Step 3: Verificar** `make test && make lint`.
- [ ] **Step 4: Commit** `feat: cliente fino de Jev, opcional y probado con un falso`.

### Task 2: Migración 030 (caché de juicios y método `jev`)

**Files:**
- Create: `rappi-scraper/src/rappi_scraper/storage/migrations/030_jev.sql`
- Modify: `rappi-ia/src/rappi_ia/concepts/store.py` (`MANAGED_METHODS` suma `jev`), y los lugares que ramifican por método donde corresponda (`concepts/knn.py` no vota con `jev`, `concepts/report.py` trata `jev` como mapeo revisado por máquina —no curado—: decidir y documentar en el informe)
- Test: `rappi-ia/tests/integration/test_jev_schema.py`

**Interfaces:**
- `eval_judgments(query text, vertical text, entity_type text, entity_id text, judge text CHECK (judge IN ('jev')), model_version text, score real, probabilities jsonb, created_at timestamptz default now(), PRIMARY KEY (query, vertical, entity_type, entity_id, judge, model_version))`.
- `category_map.method` y `item_concepts.method` aceptan `'jev'` (rehacer sus CHECK de `009_concepts.sql`).

- [ ] **Step 1: Tests:** `test_eval_judgments_roundtrip`, `test_category_map_accepts_jev`, `test_load_category_map_keeps_jev_rows`, `test_build_concepts_uses_jev_mapping_like_others`.
- [ ] **Step 2–4:** fallan → implementar → `make test && make lint` y lint de rappi-scraper.
- [ ] **Step 5: Commit** `feat: caché de juicios y mapeos de Jev en la base`.

### Task 3: Planillas para juzgar y κ

**Files:**
- Create: `rappi-ia/src/rappi_ia/eval/sheets.py`, `rappi-ia/tests/unit/test_sheets.py`, `rappi-ia/tests/integration/test_sheets_build.py`
- Modify: `rappi-ia/src/rappi_ia/cli.py` (`rappi-ia jev-planillas`), `rappi-ia/src/rappi_ia/eval/judgments.py` (lee los juicios de la planilla B)

**Interfaces:**
- `rappi-ia jev-planillas` escribe en `rappi-ia/data/eval/`:
  - `planilla-busqueda.csv`: 200 pares (consulta, vertical, posición, nombre, categoría, tienda, `juicio` vacío con valores `sirve` / `a medias` / `no sirve`), estratificados por vertical, tipo de consulta y posición (top-3 / 4-10), con sobremuestreo donde el juez por concepto y la posición discrepan; semilla fija. En git, `eval/planilla-busqueda-ids.json` (solo ids y estrato).
  - `planilla-categorias.csv`: 100 filas (vertical, categoría, 8 ejemplos, concepto propuesto hoy, `concepto_correcto` vacío): 40 sin mapear, 30 decididas por juez, 30 de acuerdo (control). En git, `eval/planilla-categorias-ids.json`.
  - Un `LEEME-planillas.md` en `data/eval/` con cómo llenarlas (abrir en Numbers/Excel, una columna, guardar como CSV).
- `read_search_sheet(path) -> dict[pair_id, int]` (2/1/0) y `read_category_sheet(path) -> dict[key, concept_id|'ninguno']`: ignoran y cuentan filas vacías o inválidas.
- `cohen_kappa(a: list[int], b: list[int]) -> float` y `weighted_kappa(a, b, levels=3) -> float` (lineal). **κ binario** = «sirve» contra el resto (comparable con el juez por concepto, que es binario); el informe da también el ponderado.

- [ ] **Step 1: Tests:** κ con casos de libro (acuerdo total = 1, azar ≈ 0, ejemplo publicado), lectura de planillas con filas malas (Review Focus 4), estratificación y semilla estable, que los textos no quedan en archivos versionados.
- [ ] **Step 2–4:** fallan → implementar → `make test && make lint`.
- [ ] **Step 5: Commit** `feat: planillas para juzgar a mano y κ contra las personas`.

### Task 4: Rol A — Jev etiqueta categorías

**Files:**
- Create: `rappi-ia/src/rappi_ia/concepts/jev_map.py`, `rappi-ia/tests/integration/test_jev_map.py`
- Modify: `rappi-ia/src/rappi_ia/cli.py` (`map-categories --jev [--solo-nuevas] [--exportar]`), `rappi-ia/src/rappi_ia/concepts/report.py` (línea de cobertura con Jev)

**Interfaces:**
- `build_questions(taxonomy) -> dict` (Choice `concepto` sobre las hojas + `ninguno`, Noul `mezcla`, `salud_sensible`, `solo_adultos`); `category_state(conn, category) -> dict` (`vertical`, `categoria`, `ejemplos`: 8 nombres más frecuentes).
- `decide(answer, taxonomy, t_auto) -> Decision(kind: 'mapear'|'revisar'|'nada', concept_id, confidence, reason)` con la tabla de decisión del diseño: `ninguno` o `mezcla ≥ 0,5` → nada; guardia en conflicto → revisar; `confianza ≥ T_auto` (0,85, sale de `jev-adopcion.json` si existe) → mapear; `0,6 ≤ c < T_auto` → revisar; `< 0,6` → nada.
- `map-categories --jev`: con cliente y adopción, escribe `category_map` con `method='jev'` y `model_version`, y `data/concepts/revision-jev.csv`; `--solo-nuevas` solo categorías sin mapeo; `--exportar` agrega lo aceptado a un CSV para commit manual. Sin cliente o sin adopción: no hace nada y lo dice.

- [ ] **Step 1: Tests** con `FakeJev`: cada fila de la tabla de decisión, guardias sensibles/+18, `--solo-nuevas`, idempotencia, «sin clave no escribe».
- [ ] **Step 2–4:** fallan → implementar → `make test && make lint`.
- [ ] **Step 5: Commit** `feat: Jev puede etiquetar categorías, con guardias y revisión humana`.

### Task 5: Rol B — Jev como juez de búsqueda, con caché

**Files:**
- Create: `rappi-ia/src/rappi_ia/eval/judge.py`, `rappi-ia/tests/integration/test_jev_judge.py`
- Modify: `rappi-ia/src/rappi_ia/eval/search_eval.py` / `render_markdown` (columna Jev cuando hay juicios), `rappi-ia/src/rappi_ia/cli.py` (`eval-search --juez-jev`)

**Interfaces:**
- `judge_pairs(conn, client, pairs) -> dict[pair_id, JevJudgment]`: lee primero `eval_judgments` (mismo modelo) y solo pide lo que falta; guarda lo nuevo.
- Pregunta: `Score` con los 3 niveles del diseño («No sirve…», «Sirve a medias…», «Sirve…»); ganancia esperada = Σ p(nivel)·{0, ½, 1}.
- `eval-search --juez-jev` agrega nDCG/P@10/MRR con juez Jev junto al juez por concepto (y el humano en la muestra, si hay planilla juzgada).

- [ ] **Step 1: Tests:** `test_second_run_uses_cache` (Review Focus 2), `test_new_model_version_asks_again`, `test_expected_gain_from_probabilities`, `test_report_shows_three_judges_side_by_side`.
- [ ] **Step 2–4:** fallan → implementar → `make test && make lint`.
- [ ] **Step 5: Commit** `feat: Jev como juez de búsqueda, con juicios en caché`.

### Task 6: Piloto y propuestas de tarjetas

**Files:**
- Create: `rappi-ia/src/rappi_ia/eval/jev_pilot.py`, `rappi-ia/tests/integration/test_jev_pilot.py`
- Modify: `rappi-ia/src/rappi_ia/cli.py` (`rappi-ia jev-piloto`, `rappi-ia knowledge --jev-propuestas`)

**Interfaces:**
- `rappi-ia jev-piloto`: verifica requisitos (clave, planillas juzgadas) y dice exactamente qué falta; corre el rol A sobre las categorías de la planilla A (2 variantes de instrucciones: español e inglés) y el rol B sobre los 200 pares; calcula:
  - A: precisión con `confianza ≥ T` en la planilla A (≥ 90 %), cobertura de las sin mapear (≥ 50 %), acuerdo con el control (≥ 90 %) y **0** sensibles/+18 mapeados solos a un concepto no sensible; elige `T_auto` (el menor T que cumple precisión ≥ 90 %).
  - B: κ binario Jev-vs-humano ≥ 0,6 **y** mayor que κ juez-por-concepto-vs-humano.
  - Escribe `data/eval/jev-piloto.md` (cifras, costo en tokens y US$ con el precio vigente que se pasa por config) y `eval/jev-adopcion.propuesta.json` (`{"categorias": bool, "juez": bool, "t_auto": float, "model_version", "fecha"}`); el usuario lo renombra a `jev-adopcion.json` y lo sube para adoptar.
- `knowledge --jev-propuestas`: pide a Jev conceptos para cada tarjeta y escribe `data/eval/tarjetas-jev.csv` (propuestas para revisar contra `card_concepts.toml`; nunca escribe ligas solo).

- [ ] **Step 1: Tests** con `FakeJev` y planillas de prueba: requisitos faltantes listados, cada criterio pasa y falla, `T_auto` elegido, archivo de propuesta, costo calculado, propuestas de tarjetas sin escribir ligas.
- [ ] **Step 2–4:** fallan → implementar → `make test && make lint`.
- [ ] **Step 5: Commit** `feat: piloto de Jev con los criterios de adopción`.

### Task 7: Jev en `post-refresh`, documentación y diagrama

**Files:**
- Modify: `rappi-ia/Makefile` (`post-refresh: … migrate purge` → `jev-categorias concepts knowledge embed eval …`, donde `jev-categorias` = `map-categories --jev --solo-nuevas`; `eval` suma `--juez-jev` cuando hay adopción del juez), `docs/decisiones.md`, `docs/diseno-ia.md`, `README.md`, `rappi-ia/README.md`, `docs/instalacion.md`, `CLAUDE.md`, `docs/diagramas-fuente/rag-datos.json` (nodo Jev opcional fuera de línea con sus flujos; regenerar HTML y PNG con la skill Archify, o dejar anotado si el PNG no se puede generar), y una guía `docs/jev.md` para el usuario (qué es, qué datos salen, costo, pasos: clave → planillas → piloto → adopción).

- [ ] **Step 1: Tests:** `test_post_refresh_steps_without_key_exit_zero` (corre los comandos de Jev sin clave y sin adopción: código 0, sin escrituras), `test_no_adoption_no_jev_even_with_key` (Review Focus 5).
- [ ] **Step 2:** Documentación y diagrama.
- [ ] **Step 3: Verificar** todas las suites (rappi-ia, scraper lint, app, panel) y `make mvp-check` sin regresiones.
- [ ] **Step 4: Commit** `docs: etapa 7 del MVP, Jev listo y apagado hasta el piloto`.
