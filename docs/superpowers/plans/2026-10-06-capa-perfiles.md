# Capa de perfiles — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o
> superpowers:executing-plans para implementar el plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** agregar a la base atributos de ítem, medidas, marcas, producto canónico, un grafo de conocimiento y
segmentos de usuario, recalculables y con procedencia, expuestos en un esquema `capa` estable.

**Arquitectura:** paquete nuevo `rappi_ia/layers/` (un módulo por capa, cada uno con funciones puras probadas en
unitarios y un `build_*(conn)` que escribe en una transacción y anota `layer_runs`). Las reglas viven en TOML junto a
`taxonomy.toml`. Migraciones 022–026 en el historial único de `rappi-scraper`. Comandos `rappi-ia <capa>` y
`make layers` dentro de `post-refresh`.

**Stack:** Python 3.13, psycopg 3, Postgres 16 + pgvector + unaccent, pytest, ruff, `tomllib`.

**Spec:** [docs/superpowers/specs/2026-10-06-capa-perfiles-design.md](../specs/2026-10-06-capa-perfiles-design.md)

## Restricciones globales

- Código (funciones, módulos, variables, tablas, columnas) en inglés; logs, CLI, docs, nombres de vocabulario en español.
- Migraciones en `rappi-scraper/src/rappi_scraper/storage/migrations/` (historial único), numeradas 022–026.
- `make test` y `make lint` en `rappi-scraper/` y `rappi-ia/`; tests de integración contra `rappi_ia_test`.
- Ítem = `(entity_type, entity_id)` con `entity_type` en `{'catalog_item', 'menu_item'}` y `entity_id` texto.
- `source` ∈ `{'rappi', 'regla', 'derivado', 'aprendido', 'curado'}`; confianza: rappi 0,95 · regla 0,8 · derivado 0,9.
- Lo `curado` nunca lo pisa un cálculo. Cada `build_*` es idempotente y anota `layer_runs`.
- Segmentos sensibles: nombre por comportamiento; en `capa`, agregados solo con ≥ 5 usuarios y sin filas por usuario.
- Sin modelos de lenguaje en el cálculo. No cambiar el comportamiento del chat ni de la búsqueda.
- Datos de usuarios: solo `synthetic` o `prototype`, nunca mezclados en un cálculo.
- Cada etapa es un PR: rama desde `main`, CI en verde, fusionar (autorizado por el usuario), correr en la base real.

## Foco de revisión

1. Rappi dice `gluten_free: false` y el nombre dice «sin gluten» → **no** se marca (el `false` de Rappi bloquea). Task 3.
2. «Galletas sin gluten. Puede contener trazas de maní» → `sin-gluten` sí, `sin-mani` **no**; «contiene gluten» anula. Task 3.
3. Medidas que se contradicen o vienen con coma: «Coca-Cola 3 L» con `1 und` → 3000 ml; «1,5 L» → 1500 ml;
   «6 x 350 ml» → pack 6, total 2100 ml. Task 2.
4. Las marcas se unen solo si su escritura normalizada es igual («Coca-Cola» = «COCA COLA»); un prefijo común no
   basta («Soprole» ≠ «Soprole Next») salvo un alias curado. Task 6.
5. Un usuario con una sola compra fuerte pero `min_signals = 3` no entra al segmento; uno con eventos solo de «Rappi
   hoy» (sin concepto ni ítem) no tiene segmentos; `synthetic` y `prototype` no se mezclan. Task 11–12.
6. Las conftest de ambos paquetes borran también el esquema `capa`, o el segundo test falla al migrar. Task 1.

---

## Etapa 1 — atributos y medidas

### Task 1: migración 022, esquema `capa` y linaje

**Files:**
- Create: `rappi-scraper/src/rappi_scraper/storage/migrations/022_layer_attributes_measures.sql`
- Create: `rappi-ia/src/rappi_ia/layers/__init__.py`, `rappi-ia/src/rappi_ia/layers/runs.py`
- Modify: `rappi-ia/tests/conftest.py`, `rappi-scraper/tests/conftest.py` (antes de `DROP SCHEMA public`)
- Test: `rappi-ia/tests/integration/test_layers.py`

**Interfaces:**
- Produces: `start_layer_run(conn, layer: str, rules_version: str) -> int`;
  `finish_layer_run(conn, run_id: int, counts: dict, status: str = "done") -> None`.
- Tablas: `layer_runs`, `attribute_defs`, `item_attributes`, `item_measures` con las columnas de la spec §3.1–3.3
  (`item_attributes` pk `(entity_type, entity_id, attribute_id)`, índice por `attribute_id`; `item_measures` pk
  `(entity_type, entity_id)`), `CREATE SCHEMA IF NOT EXISTS capa`.

- [ ] **Step 1: test** `test_layer_run_is_recorded(db)`: `run = start_layer_run(db, "measures", "2026-10-06")`,
  `finish_layer_run(db, run, {"items": 3})` → fila con `status = 'done'`, `counts = {"items": 3}`, `finished_at` no nulo;
  y `test_capa_schema_exists(db)`: `SELECT 1 FROM information_schema.schemata WHERE schema_name = 'capa'`.
- [ ] **Step 2:** correr `make -C rappi-ia test` → falla (tabla no existe).
- [ ] **Step 3:** escribir la migración y `runs.py`; en ambas conftest, `DROP SCHEMA IF EXISTS capa CASCADE` antes de
  borrar `public`.
- [ ] **Step 4:** `make -C rappi-ia test` y `make -C rappi-scraper test` → pasan (dos veces seguidas el mismo test).
- [ ] **Step 5:** commit `feat(capas): migración 022, esquema capa y linaje de corridas`.

### Task 2: medidas

**Files:**
- Create: `rappi-ia/src/rappi_ia/layers/measures.py`
- Test: `rappi-ia/tests/unit/test_layer_measures.py`, `rappi-ia/tests/integration/test_layers.py`

**Interfaces:**
- Produces: `@dataclass(frozen=True) Measure(quantity: float | None, unit: str | None, pack: int, total: float | None,
  size_label: str | None, source: str, evidence: str)`;
  `parse_measure(name: str, quantity: float | None, unit_type: str | None, pack_size: str | None) -> Measure`;
  `parse_dish_size(name: str) -> str | None`; `build_measures(conn) -> dict` (claves `productos`, `platos`, `corregidos`).

- [ ] **Step 1: tests unitarios** (parametrizados) de `parse_measure`:
  `("Morcilla Carupanera 400gr", 400, "gr", None)` → `(400, "g", 1, 400)`;
  `("Coco Laminado 1kg", 1, "kg", None)` → `(1000, "g", 1, 1000)`;
  `("Coca-Cola 3 L", 1, "und", None)` → `(3000, "ml", 1, 3000)`, `source = "regla"`, evidence `"3 L"`;
  `("Cerveza Lata 1,5 L", None, None, None)` → `(1500, "ml", 1, 1500)`;
  `("Cerveza Cristal 6 x 350 ml", 350, "ml", None)` → `(350, "ml", 6, 2100)`;
  `("Pack 4 Yogurt", 1, "und", "x4")` → `pack = 4`; `("Soap 1 Und", 1, "und", None)` → `(1, "und", 1, 1)`, `source = "rappi"`;
  `cc` → `ml`; `l` → `ml × 1000`. `parse_dish_size`: «Pizza Familiar» → `"familiar"`, «Promo para 2» → `"para 2"`,
  «Completo XL» → `"xl"`, «Ensalada» → `None`.
- [ ] **Step 2:** correr → fallan.
- [ ] **Step 3:** implementar. Orden: medida del nombre si contradice a Rappi (unidad distinta o `und` con medida en el
  nombre) → nombre gana (`regla`); si no, Rappi. Pack: `pack_size` («x6») o nombre (`(\d+)\s*x\s*\d`, «six pack» = 6,
  «pack (de )?(\d+)»).
- [ ] **Step 4: test de integración** `test_build_measures_is_idempotent(db)`: dos productos y un plato (helpers de
  `conftest`), `build_measures` dos veces → mismas filas, dos `layer_runs`.
- [ ] **Step 5:** CLI `rappi-ia measures` (en `cli.py`, mismo estilo que `cmd_concepts`, imprime los conteos).
- [ ] **Step 6:** tests en verde + lint; commit `feat(capas): medidas normalizadas de productos y platos`.

### Task 3: reglas de atributos (puras)

**Files:**
- Create: `rappi-ia/src/rappi_ia/concepts/attributes.toml`, `rappi-ia/src/rappi_ia/layers/attributes.py`
- Test: `rappi-ia/tests/unit/test_layer_attributes.py`

**Interfaces:**
- TOML: `version = "2026-10-06"`; `[[attribute]]` con `id`, `name`, `family`, `applies_to` (`"catalog_item"`,
  `"menu_item"` o `"both"`), `value_type` (`"flag"`·`"text"`), `description`, `rappi = { key = "gluten_free", true = true }`
  o `rappi = { key = "gender", values = { Femenino = "mujer" } }` (opcional), `phrases = [...]`, `negations = [...]`.
  Todos los atributos de la spec §4.1 (≈ 75) salvo `economico` y `con-descuento`, que son derivados (sin frases).
- Produces: `@dataclass(frozen=True) AttributeRule(...)`, `load_attribute_rules(path=None) -> tuple[str, list[AttributeRule]]`
  (versión, reglas); `@dataclass(frozen=True) Detected(attribute_id: str, value: str | None, source: str, confidence:
  float, evidence: str)`; `detect_attributes(entity_type: str, name: str, category: str | None, description: str | None,
  rappi: dict | None, rules: list[AttributeRule]) -> list[Detected]`.

- [ ] **Step 1: tests:**
  - `rappi={"gluten_free": True}` → `sin-gluten` con `source="rappi"`, `confidence=0.95`, evidence `"gluten_free"`.
  - nombre «Pan Sin Gluten» sin Rappi → `sin-gluten` `regla` 0.8, evidence `"sin gluten"`.
  - nombre «Pan Sin Gluten» con `rappi={"gluten_free": False}` → sin `sin-gluten` (Foco 1).
  - «Galletas sin gluten. Puede contener trazas de maní» → `sin-gluten` sí, `sin-mani` no (Foco 2).
  - «Galletas con gluten» y «Contiene gluten» → nada.
  - Descripción con «Advertencias: … sin azúcar» → no cuenta lo que va después de la frontera del prospecto
    (reusar `_LEAFLET_WARNINGS` de `agent/tools.py`, movido a `rappi_ia/text.py` como `LEAFLET_WARNINGS`).
  - `rappi={"gender": "Femenino"}` → `mujer`; `rappi={"life_stage_human": "Adulto Mayor"}` → `adulto-mayor`.
  - plato «Burger vegana picante para 2» (`menu_item`) → `vegano`, `picante`, `para-compartir`; un atributo con
    `applies_to = "catalog_item"` nunca sale en un plato.
  - `test_every_attribute_has_family_and_unique_id`: ids únicos, familias ∈ las 9 de la spec.
- [ ] **Step 2:** correr → fallan.
- [ ] **Step 3:** implementar sobre `KeywordMatcher` (frases normalizadas, palabras enteras); negación = otra frase del
  mismo atributo en `negations` en el mismo texto → descarta ese atributo.
- [ ] **Step 4:** tests en verde; commit `feat(capas): reglas de atributos (Rappi, frases y negaciones)`.

### Task 4: construir atributos, derivados y vistas

**Files:**
- Modify: `rappi-ia/src/rappi_ia/layers/attributes.py`, `rappi-ia/src/rappi_ia/cli.py`
- Modify: migración 022 (vistas `capa.item_attributes`, `capa.item_unit_prices`)
- Test: `rappi-ia/tests/integration/test_layers.py`

**Interfaces:**
- Produces: `build_attributes(conn) -> dict` (claves `definiciones`, `productos`, `platos`, `derivados`); siembra
  `attribute_defs`. Derivados: `economico` = precio vigente ≤ percentil 25 de su `(concept_id, vertical)` con ≥ 8 ítems;
  `con-descuento` = `price < real_price` en el último precio (`v_latest_prices` / `menu_price_snapshots`); `familiar` y
  `pack` también desde `item_measures`; `marca-propia` queda para la Task 6.
- Vistas: `capa.item_attributes` (ítem, `attribute_id`, `name`, `family`, `value`, `source`, `confidence`),
  `capa.item_unit_prices` (ítem, vertical, `price`, `total`, `unit`, `price_per_kg`/`price_per_l`/`price_per_unit`).

- [ ] **Step 1: tests:** `test_build_attributes_from_rappi_text_and_prices(db)` con productos sembrados (uno con
  `attributes = '{"gluten_free": true}'`, uno «Leche sin lactosa», cuatro del mismo concepto con precios 1000/2000/3000/9000
  y el umbral a 8 parcheado a 4 con `monkeypatch`) → filas esperadas y `economico` solo en el de 1000;
  `test_build_attributes_is_idempotent(db)`; `test_curated_rows_survive(db)` (fila `source='curado'` insertada a mano sigue).
- [ ] **Step 2:** correr → fallan.
- [ ] **Step 3:** implementar recalculando todo (≈ 250 mil ítems, del orden de un minuto): leer ítems con nombre,
  categoría, descripción y `attributes`; borrar lo no curado y volver a insertar con `COPY`; derivados por SQL.
- [ ] **Step 4:** CLI `rappi-ia attributes`; tests en verde + lint; commit `feat(capas): atributos de ítem y vistas capa`.

### Task 5: reporte, Makefile y base real (cierra la etapa 1)

**Files:**
- Create: `rappi-ia/src/rappi_ia/layers/report.py`
- Modify: `rappi-ia/Makefile` (`layers`, `layer-report`, `post-refresh`), `rappi-ia/src/rappi_ia/cli.py`,
  `docs/decisiones.md`, `README.md` (fila en Resultados)
- Test: `rappi-ia/tests/integration/test_layers.py`

**Interfaces:**
- Produces: `layer_report(conn, sample: int = 20) -> str` (markdown: cobertura por atributo y vertical, por fuente,
  medidas corregidas, muestra aleatoria con semilla fija de `sample` ítems por atributo); CLI `rappi-ia layer-report`
  escribe `data/eval/capas.md`. Makefile: `layers: measures attributes` (crece en etapas siguientes) y
  `post-refresh` corre `layers` después de `synth`.

- [ ] **Step 1: test** `test_layer_report_lists_coverage(db)`: tras construir, el markdown contiene `"sin-gluten"` y la
  columna `rappi`.
- [ ] **Step 2:** implementar; tests y lint en verde en ambos paquetes.
- [ ] **Step 3: base real** (sin descarga en curso: candado libre): `make -C rappi-scraper migrate`,
  `make -C rappi-ia layers layer-report`; revisar la muestra de `sin-gluten`, `vegano`, `sin-azucar`, `familiar` a ojo
  y corregir frases si hay falsos positivos (volver a la Task 3 con un test por caso).
- [ ] **Step 4:** decisión en `docs/decisiones.md`, cifras en README; PR «Capa de perfiles 1: atributos y medidas»,
  CI, fusionar.

## Etapa 2 — marcas y producto canónico

### Task 6: marcas

**Files:**
- Create: migración `023_brands_canonical.sql` (`product_brands`, `brand_aliases`, `item_brands`, `canonical_products`,
  `item_canonical`, spec §3.4–3.5), `rappi-ia/src/rappi_ia/concepts/brands.toml`, `rappi-ia/src/rappi_ia/layers/brands.py`
- Test: `rappi-ia/tests/unit/test_layer_brands.py`, `rappi-ia/tests/integration/test_layers.py`

**Interfaces:**
- TOML: `version`; `store_brands = ["lider", "great value", "nuestra cocina", "cuisine & co", "acuenta", "jumbo",
  "tottus", "unimarc", "precio uno", "selección del experto"…]`; `[[alias]] alias = "...", brand = "slug"`.
- Produces: `brand_key(trademark: str) -> str | None` (normalize, sin «s.a.», «ltda», «spa», signos; espacios y guiones
  colapsados: «Coca-Cola» = «COCA COLA» = «cocacola» → `coca-cola`); `build_brands(conn) -> dict`;
  `marca-propia` se agrega a `item_attributes` (`source='derivado'`) para ítems de marcas propias.

- [ ] **Step 1: tests:** `brand_key` de «Coca-Cola», «COCA COLA», «Coca Cola S.A.» → mismo; «Soprole» ≠ «Soprole Next»;
  «» y «Sin Marca» → `None` (Foco 4). Integración: dos escrituras → una fila en `product_brands`, dos en `brand_aliases`,
  `name` = la más frecuente; platos con `brand_key` de su cadena; `marca-propia` en un ítem «Líder».
- [ ] **Step 2–4:** fallan → implementar → pasan; CLI `rappi-ia brands`; `layers` suma `brands`.
- [ ] **Step 5:** commit `feat(capas): marcas canónicas y marca propia`.

### Task 7: producto canónico (cierra la etapa 2)

**Files:**
- Create: `rappi-ia/src/rappi_ia/layers/canonical.py`
- Modify: `layers/report.py` (sección marcas y canónicos), vista `capa.canonical_products` (canónico, marca, label,
  `verticals text[]`, `items`)
- Test: `rappi-ia/tests/unit/test_layer_canonical.py`, integración

**Interfaces:**
- Produces: `name_key(name: str, brand_key: str | None, measure_text: str | None) -> str` (normalizado, sin la marca,
  sin tamaño ni pack, palabras ordenadas); `build_canonical(conn) -> dict` (clave `(brand_key, name_key, total, unit)`;
  sin marca o sin `total` → no se agrupa: un canónico por ítem, `method='exacto'`).

- [ ] **Step 1: tests:** «Coca-Cola Original 1.5L» y «Coca Cola Original 1,5 L» (misma marca) → un canónico;
  1,5 L vs 3 L → dos; misma frase con marcas distintas → dos; sin marca → no se agrupa.
- [ ] **Step 2–4:** fallan → implementar → pasan; CLI `rappi-ia canonical`; `layers` lo suma.
- [ ] **Step 5:** base real + reporte (top canónicos en ≥ 3 verticales, revisar a ojo 20); decisión; PR
  «Capa de perfiles 2: marcas y producto canónico», CI, fusionar.

## Etapa 3 — grafo

### Task 8: `knowledge_edges` con compatibilidad

**Files:**
- Create: migración `024_knowledge_edges.sql`: tablas `relation_defs`, `knowledge_edges` (spec §3.6), copia de
  `concept_edges` (`from_kind = to_kind = 'concept'`, `relation = 'complementa'`), `DROP TABLE concept_edges`,
  `CREATE VIEW concept_edges` con las columnas de antes.
- Modify: `rappi-ia/src/rappi_ia/concepts/store.py:51` (`seed_curated_edges`), `rappi-ia/src/rappi_ia/analytics/queries.py:523`
  (`learn_edges`) para escribir en `knowledge_edges`.
- Test: los existentes (`test_concepts`, `test_analytics`, `test_bigotes`) sin cambios + uno nuevo.

**Interfaces:**
- Produces: tabla `knowledge_edges`; vista `concept_edges(from_concept, to_concept, method, weight, support,
  data_source, updated_at)` con las mismas filas que antes.

- [ ] **Step 1: test** `test_concept_edges_view_matches_curated_complements(db)`: tras `build_concepts`, la vista tiene
  103 filas `curado`; tras `learn_edges`, las `coocurrencia`.
- [ ] **Step 2–4:** migración + escritores → suite completa de rappi-ia en verde sin tocar los tests viejos.
- [ ] **Step 5:** commit `feat(capas): grafo de conocimiento con vista de compatibilidad concept_edges`.

### Task 9: relaciones (cierra la etapa 3)

**Files:**
- Create: `rappi-ia/src/rappi_ia/concepts/relations.toml` (`relation_defs` de la spec §4.3; curadas `sustituye` y
  `conflicto`), `rappi-ia/src/rappi_ia/layers/graph.py`
- Modify: `cli.py`, Makefile (`layers` suma `relations`), vista `capa.knowledge_edges`
- Test: integración

**Interfaces:**
- Produces: `build_relations(conn) -> dict` (una clave por relación). Derivadas: `es_tipo_de`, `de_ocasion` (taxonomía),
  `se_vende_en` (`concept_assortment`, peso = participación), `tiene_atributo` (≥ 5 % de los ítems del concepto),
  `marca_de` (≥ 5 ítems), `equivale` (canónico en ≥ 2 verticales), `sinonimo` (`query_keywords`), `afin_a` (de
  `segments.toml` cuando exista: la Task 12 la vuelve a llamar). Aprendida: `co_busqueda` (dos conceptos en la misma
  sesión, por fuente). Curadas del TOML.
- `conflicto` curado mínimo: `cerveza`/`vino`/`pisco`/… (grupo `alcohol`) ↔ `panales`, `alimentacion-bebe`; grupo
  `tabaco` ↔ `juguetes-infantiles`.

- [ ] **Step 1: tests:** `tiene_atributo` sale con 2 de 10 ítems y no con 0 de 10; `es_tipo_de` cerveza → alcohol;
  `sustituye` curada presente; idempotente; las `curado` no se borran al recalcular.
- [ ] **Step 2–4:** implementar; base real; exportable: `exportar_red.py` (fuera del repo) no se toca.
- [ ] **Step 5:** decisión; PR «Capa de perfiles 3: grafo de conocimiento», CI, fusionar.

## Etapa 4 — segmentos

### Task 10: definición de segmentos (pura)

**Files:**
- Create: migración `025_segments.sql` (`segment_defs`, `user_segments`, `user_segment_history`, spec §3.7; índice
  `user_segments(segment_id, level)`), `rappi-ia/src/rappi_ia/concepts/segments.toml` (los ≈ 110 de la spec §4.2),
  `rappi-ia/src/rappi_ia/layers/segments.py`
- Test: `rappi-ia/tests/unit/test_layer_segments.py`

**Interfaces:**
- Produces: `@dataclass(frozen=True) SegmentRule(id, name, family, sensitive, description, signals: dict, events:
  dict[str, float], window_days: int, half_life_days: float, min_signals: int, levels: dict[str, float], exclude: dict,
  metric: dict | None)`; `load_segment_rules(path=None) -> tuple[str, list[SegmentRule]]`.
  Piezas de `signals` válidas (spec §5): `concepts, groups, attributes, verticals, brands, occasions, services,
  query_words, hours, weekdays, days_of_month, price_percentile, discount, basket_size, modality, from_suggestion`.
  `events` admite los tipos de `app_events` más `order_line`.

- [ ] **Step 1: tests:** ids únicos; 12 familias de la spec; los 13 sensibles marcados (`compra-sin-gluten`,
  `compra-sin-lactosa`, `compra-sin-azucar`, `bajo-sodio`, `alergia-frutos-secos`, `mama-papa-bebe`, `embarazo`,
  `adulto-mayor`, `salud-sexual`, `farmacia-frecuente`, `cuidado-cronico`, `tabaco`, `vapeo`); toda pieza conocida;
  todo concepto/atributo nombrado existe en la taxonomía o en `attributes.toml`; `levels` crecientes.
- [ ] **Step 2–4:** fallan → implementar cargador con validación (error claro con el id del segmento) → pasan.
- [ ] **Step 5:** commit `feat(capas): definición de segmentos`.

### Task 11: motor de puntaje (puro)

**Files:**
- Modify: `rappi-ia/src/rappi_ia/layers/segments.py`
- Test: `rappi-ia/tests/unit/test_layer_segments.py`

**Interfaces:**
- Consumes: `SegmentRule`.
- Produces: `@dataclass(frozen=True) Signal(ts: datetime, type: str, concept: str | None, group: str | None,
  attributes: frozenset[str], vertical: str | None, brand: str | None, query: str | None, modality: str | None,
  price_percentile: float | None, discounted: bool, basket_items: int | None, basket_total: float | None,
  from_suggestion: bool, event_key: str)`; `@dataclass(frozen=True) Membership(segment_id, score, level, signals,
  evidence: dict, first_seen, last_signal)`; `score_user(signals: list[Signal], metrics: dict[str, float],
  rules: list[SegmentRule], now: datetime) -> list[Membership]`.
  Puntaje = Σ `events[type]` × `0.5 ** (edad_días / half_life_days)` sobre las señales dentro de `window_days` que
  calzan alguna pieza y ninguna de `exclude`; `signals` = `event_key` distintos; sin `min_signals` → sin fila; nivel =
  el mayor umbral alcanzado; con `metric`, el valor de `metrics[...]` en rango decide (nivel `alto`, puntaje = valor).

- [ ] **Step 1: tests:** dos compras sin gluten → nada con `min_signals=3`; tres → `bajo`/`medio` según umbrales (Foco 5);
  decaimiento (señal a `half_life_days` vale la mitad); fuera de ventana no cuenta; `exclude` resta; `hours` 22–4 cruza
  medianoche; `metric = dias_sin_pedido` en `[30, 90)` → `en-riesgo`; evidencia con los 3 que más aportan.
- [ ] **Step 2–4:** fallan → implementar → pasan; commit `feat(capas): motor de puntaje de segmentos`.

### Task 12: segmentos en la base

**Files:**
- Modify: `rappi-ia/src/rappi_ia/layers/segments.py`, `rappi-ia/src/rappi_ia/events/store.py` (`forget`),
  `rappi-ia/src/rappi_ia/cli.py`, Makefile (`layers` suma `segments`), `layers/graph.py` (`afin_a`)
- Test: `rappi-ia/tests/integration/test_layers.py`, `test_forget_and_retention.py`

**Interfaces:**
- Produces: `load_signals(conn, source: str, user_id: str | None = None) -> dict[str, list[Signal]]` (eventos con
  ítem/concepto + líneas de pedido como `order_line`, uniendo `item_attributes`, `item_brands`, percentil de precio por
  concepto; solo esa `source`); `user_metrics(conn, source, user_id=None) -> dict[str, dict[str, float]]`
  (`dias_sin_pedido`, `dias_desde_alta`, `verticales_distintas`, `tasa_abandono`, `aceptacion_sugerencias`,
  `pedidos_90d`, `gasto_90d_percentil`, `reactivado`); `build_segments(conn, source: str = "synthetic",
  user_id: str | None = None, now: datetime | None = None) -> dict`; escribe `user_segments` (reemplaza los de esa
  fuente o ese usuario, nunca `source='curado'`) y la foto de la semana en `user_segment_history` (upsert por semana).
  CLI: `rappi-ia segments [--source prototype] [--user ID]`. `forget(user)` borra sus filas de ambas tablas;
  `forget(user, concept)` llama a `build_segments(conn, "prototype", user_id)`.

- [ ] **Step 1: tests:** usuario sintético con 3 compras de un producto con atributo `sin-gluten` → `compra-sin-gluten`;
  usuario `prototype` con eventos no se toca al correr `synthetic` (Foco 5); usuario sin concepto ni ítem en sus
  eventos → sin segmentos de gusto; idempotente (misma semana no duplica historia); `forget` en cascada.
- [ ] **Step 2–4:** fallan → implementar (SQL en lote, no por usuario, salvo `--user`) → pasan.
- [ ] **Step 5:** commit `feat(capas): segmentos de usuario con historia y olvido`.

### Task 13: personas del simulador (cierra la etapa 4)

**Files:**
- Modify: `rappi-ia/src/rappi_ia/events/synth.py` (`PERSONAS`)
- Test: `rappi-ia/tests/integration/test_layers.py`

**Interfaces:**
- Suma personas (cada una con `share` pequeño, la suma sigue en 1): `sin-gluten`, `vegana`, `mama-bebe`, `perro`,
  `gato`, `fitness`, `oficinista`, `nocturno`, `cazaofertas`, `gamer`, `cafetera`, `chocolatera`, `parrillero`. Sus
  `interests` usan conceptos de la taxonomía; la de sin gluten elige ítems con `sin-gluten` cuando existan.

- [ ] **Step 1: test** `test_synthetic_population_fills_most_families(db)`: catálogo de prueba + `synth.generate`
  chico + `build_attributes` + `build_segments` → al menos un usuario en ≥ 8 de las 12 familias.
- [ ] **Step 2–4:** implementar; base real (`make synth layers layer-report`); revisar distribución en el reporte
  (ningún segmento con 0 % ni con > 80 % de los usuarios sin motivo).
- [ ] **Step 5:** decisión; PR «Capa de perfiles 4: segmentos», CI, fusionar.

## Etapa 5 — contrato y documentación

### Task 14: vistas `capa` y documentación

**Files:**
- Create: migración `026_capa_views.sql`, `docs/capa-de-datos.md`
- Modify: `docs/README.md` (índice), `CLAUDE.md` (una línea: la capa vive en `rappi_ia/layers`, reglas en TOML)
- Test: `rappi-ia/tests/integration/test_layers.py`

**Interfaces:**
- Vistas (con `COMMENT ON VIEW` y `COMMENT ON COLUMN` en español): `capa.items` (ítem, nombre, vertical(es), concepto,
  marca, canónico, medidas, precio vigente), `capa.item_attributes`, `capa.item_unit_prices`, `capa.canonical_products`,
  `capa.knowledge_edges`, `capa.segment_defs`, `capa.user_segments` (**sin** segmentos sensibles),
  `capa.segment_sizes` (por fuente, semana y nivel; sensibles solo con ≥ 5 usuarios), `capa.layer_runs`.

- [ ] **Step 1: tests:** `capa.user_segments` no devuelve filas de segmentos sensibles; `capa.segment_sizes` oculta un
  segmento sensible con 4 usuarios y muestra uno con 5; toda vista y columna de `capa` tiene comentario
  (`obj_description`/`col_description` no nulos).
- [ ] **Step 2–4:** fallan → migración → pasan.
- [ ] **Step 5:** `docs/capa-de-datos.md`: qué hay en cada vista, ejemplos SQL (precio por litro, usuarios por
  segmento, «sin gluten» por vertical), cómo agregar un atributo/segmento/relación (editar el TOML y `make layers`),
  privacidad. Base real completa (`make layers layer-report`), cifras en README, PR «Capa de perfiles 5: contrato y
  documentación», CI, fusionar.
