# rappi-ia

Conecta el catálogo que descarga [`rappi-scraper`](../rappi-scraper/) con el asistente **Mochi** del [prototipo](../prototipo-app/). Diseño completo en [docs/diseno-ia.md](../docs/diseno-ia.md).

**Regla:** *buscar dentro del vertical, entender al usuario a través de los verticales*. La búsqueda nunca mezcla verticales. El puente entre ellos son los **conceptos**: una taxonomía propia de 133 conceptos, con 103 complementos curados entre sí. Una recomendación cruzada va del concepto que le interesa al usuario a su complemento, y de ahí a una búsqueda en el otro vertical (p. ej., cerveza en licores → snacks salados de otra tienda).

![Flujo de datos por etapas: Descarga → Postgres → IA offline → Consulta → Prototipo y panel](../docs/diagramas/rag-datos.png)

Versión interactiva: [rag-datos.html](../docs/diagramas/rag-datos.html). Vista por carriles: [arquitectura-ia.png](../docs/diagramas/arquitectura-ia.png) ([interactiva](../docs/diagramas/arquitectura-ia.html)). Los HTML se descargan y se abren en el navegador.

| Pieza | Qué hace | Dónde |
|---|---|---|
| Conceptos (capa 2) | Cada producto y plato → un concepto, con procedencia: categoría (mapa de categorías revisadas, cuántas en [README.md#resultados](../README.md#resultados), generado con LLM: dos etiquetadores trabajan por separado y un juez decide cuando no coinciden; 21 ajustes a mano; versionado en `category_map.csv`), reglas por palabra o vecinos cercanos (kNN) | `concepts/` |
| Jev (opcional) | Etiqueta categorías nuevas y juzga la búsqueda, solo fuera de línea y solo con clave, adopción y piloto aprobado; sin ellos nada cambia | `jev.py`, `concepts/jev_map.py`, `eval/judge.py`, `eval/jev_pilot.py` |
| Embeddings | Texto con `intfloat/multilingual-e5-base` (768 dim, caché por contenido, índice HNSW por vertical) | `embeddings/` |
| Búsqueda híbrida | Léxico (sin tildes ni ñ, IDF) + vectorial → RRF → refuerzo por concepto, con filtros dentro de cada lista y regla de "sin resultado" | `retrieval/hybrid.py` |
| Mochi | Entender → buscar → sugerir un complemento de otro vertical → redactar (plantillas o Claude) → verificar | `agent/` |
| Eventos y analítica | Usuarios y eventos (**simulados** o del prototipo, nunca mezclados), métricas de frecuencia, abandono, oportunidades y afinidad | `events/`, `analytics/` |
| Juego | 108 tarjetas con fuente, ligadas a conceptos; desafío por ronda y progreso por persona | `game/` |
| Capa de datos | Atributos, medidas, marcas, grafo y segmentos en el esquema `capa` ([docs/capa-de-datos.md](../docs/capa-de-datos.md)) | `layers/` |

## Instalar

Desde la raíz del repositorio (requiere la base de [`rappi-scraper`](../rappi-scraper/)):

```bash
cd rappi-ia
make install      # .venv + rappi-scraper (esquema) + API + tests
make install-ml   # modelo local de texto: e5 (y Claude opcional)
make db-test      # base rappi_ia_test (los tests no tocan rappi ni rappi_test)
make migrate
```

Las versiones de las librerías están fijadas en `requirements.lock.txt` (las del equipo que calculó los embeddings de la base): `make install` e `install-ml` no instalan otras. Un job de CI semanal (`.github/workflows/modelos-semanal.yml`) instala los modelos con esas versiones y comprueba que e5 embebe. El modelo de texto (e5, ~1 GB) se descarga de Hugging Face la primera vez que se usa. La API lo carga al arrancar: hay que esperar a «Application startup complete» (con el modelo ya en caché, `make serve` arranca sin consultar Hugging Face; `RAPPI_IA_LIGHT=1` arranca sin modelos). Para que Claude redacte las respuestas, agrega `ANTHROPIC_API_KEY` en `.env`; sin clave, el agente responde con plantillas y las mismas reglas. El nombre que ve el usuario sale de `AGENT_NAME` (por defecto, Mochi). Otras variables en `.env.example`.

## Correr

Después de cada `rappi refresh` del scraper:

```bash
make post-refresh                 # migrate + purge + jev-categorias + concepts + knowledge + embed + eval + synth + layers + purge
./scripts/despues-del-refresh.sh  # lo mismo, pero espera a que termine un `rappi refresh` lanzado a mano
```

La tarea semanal del scraper (`make schedule` en `rappi-scraper/`) ya lo hace sola, con una diferencia: evalúa sin guardar τ.

| Objetivo | Qué hace |
|---|---|
| `make jev-categorias` | Jev etiqueta las categorías nuevas (`map-categories --jev --solo-nuevas`). Opcional: sin `TYPESAFE_API_KEY` o sin `eval/jev-adopcion.json` no hace nada y termina bien. Va antes de `concepts` en `post-refresh` (guía en [docs/jev.md](../docs/jev.md)) |
| `make concepts` | Capa 2: conceptos por producto y plato (con kNN si está el extra `ml`) |
| `make embed` | Embeddings de texto (incrementales) + índices HNSW por vertical. No corre si hay una descarga del scraper en curso |
| `make eval` | Evalúa la búsqueda (léxico, vectorial, híbrido y ablación sin refuerzo), guarda τ en `src/rappi_ia/eval/thresholds.json` (solo en verticales con negativas que dependen de τ; los demás conservan el suyo; `make eval EVAL_ARGS=` no guarda) y deja el reporte en `data/eval/busqueda.md`. Con `--jev-auto` (lo que usa `make eval`) suma a Jev como tercer juez solo si hay clave y adopción |
| `make synth` | Usuarios y eventos **simulados** para métricas y segmentos (1.500 usuarios × 26 semanas, semilla 7; reemplaza los anteriores) |
| `make purge` | Borra el texto de las consultas con más de 90 días |
| `make knowledge` | Carga las 108 tarjetas del juego y sus ligas a conceptos (idempotente; también al levantar la API con make) |
| `make layers` / `make layer-report` | Capa de datos (medidas, marcas, canónicos, atributos, grafo y segmentos) / su reporte de calidad |
| `make migrate` / `make db-test` | Aplica las migraciones pendientes / crea la base de tests `rappi_ia_test` |
| `make analytics` | Resumen de las métricas de negocio en la terminal |
| `make contract` | Reescribe las respuestas de ejemplo de la API para la app y el panel (el CI falla si quedan desactualizadas) |
| `make warm` | Calienta la API antes de una demo |
| `make probar-agente` | Prueba al agente con frases de usuarios ([docs/pruebas-de-usuario.md](../docs/pruebas-de-usuario.md)) |
| `make serve` / `make serve-lan` | API local / abierta a la red local (ver Seguridad) |
| `make test`, `make lint`, `make format` | Tests, revisión de estilo y formato |

`make help` lista todos los objetivos. Otros comandos:

- `rappi-ia search "algo para el carrete" --vertical licores`
- `rappi-ia concepts --solo-reporte`: cobertura sin recalcular; también lista las categorías sin mapeo revisado (las nuevas de cada semana). Las revisadas sin concepto (filas «ninguno» de `category_map.csv`) no vuelven a aparecer.
- `rappi-ia map-categories`: exporta las categorías sin mapeo revisado a `data/concepts/categorias-sin-mapear.csv`, con el formato de `category_map.csv` y un concepto sugerido cuando al menos la mitad de sus productos ya lo tiene (reglas o kNN). Se revisa cada fila, se cambia el método a «curado» y se copia al mapa versionado.
- `rappi-ia eval-sample`: arma la muestra de 200 pares (consulta, producto) para juzgar a mano (`src/rappi_ia/eval/judgments-sample.json`, con semilla fija): 120 donde el híbrido con y sin refuerzo por concepto difieren en el top 10 y 80 al azar. Se juzga a ciegas en una página privada del autor (sin mostrar el juez automático ni el modo); los juicios se copian a `src/rappi_ia/eval/judgments.json`, que todavía no existe. Desde el 11-10-2026 el camino recomendado es la planilla de `jev-planillas` (CSV, sin página aparte), que `eval-human` lee primero; `judgments.json` queda para la muestra antigua.
- `rappi-ia jev-planillas`: deja en `data/eval/` dos planillas CSV para juzgar a mano (200 pares de búsqueda y 100 categorías) con su `LEEME-planillas.md`; los textos no van a git, solo los ids. `--forzar` pisa planillas ya llenas.
- `rappi-ia jev-piloto`: con `TYPESAFE_API_KEY` y las planillas juzgadas, mide a Jev como etiquetador de categorías y como juez, escribe `data/eval/jev-piloto.md` y, si pasa, la propuesta `eval/jev-adopcion.propuesta.json` (se adopta renombrándola a `jev-adopcion.json` y subiéndola a git).
- `rappi-ia map-categories --jev [--solo-nuevas] [--exportar]`: Jev propone el concepto de las categorías sin mapeo revisado (solo con clave y adopción); `--exportar` lista sus mapeos y su cola de revisión en un CSV para pasarlos a `category_map.csv`.
- `rappi-ia eval-search --juez-jev`: suma a Jev como juez (exige la clave). `--jev-auto` lo suma solo si hay clave y adopción, y si no sigue sin él.
- `rappi-ia knowledge --jev-propuestas`: Jev propone un concepto por tarjeta del juego en `data/eval/tarjetas-jev.csv`, para revisar; no liga nada.
- `rappi-ia eval-human`: con esos juicios, cuánto acierta el juez automático (precisión, recall, acuerdo) y si los ítems que solo trae el refuerzo son relevantes más o menos seguido que los que solo trae sin él.
- `rappi-ia multivertical`: regenera el mapa multivertical (`docs/mapas/mapa-multivertical.html`): productos compartidos entre verticales, conceptos junto a la vertical donde son más típicos (la regla de Mochi) y los productos y cadenas en más verticales. Página autocontenida, sin internet. La imagen `mapa-conceptos.jpg` se captura de esa página con `#figura` al final de la URL.

## API (`make serve` → http://localhost:8000/docs)

| Endpoint | Para qué |
|---|---|
| `GET /health` | Capacidades disponibles (búsqueda semántica, redacción) y documentos indexados |
| `POST /agent/ask` | El agente (Mochi): `{message, vertical?, user_id?, session_id?, profile?, shown_topics?, mode}`. Acepta los ids de vertical del prototipo (`liquor`, `grocery`…) |
| `POST /agent/offer` · `GET /agent/plans` | Lo que el agente propone en cada momento de la app (204 si no hay una buena oferta) · las ocasiones de la Home con su kit |
| `GET /catalog/home` · `/catalog/verticals/{vertical}/stores` · `/catalog/stores/{store_id}` · `/catalog/products/{entity_type}/{entity_id}` · `/catalog/restaurants` · `/catalog/restaurants/{store_id}/menu` · `/catalog/deals` | Las pantallas de catálogo del prototipo (Home, verticales, tienda, producto, restaurantes, menú, ofertas), con el precio vigente |
| `GET /game/cards` · `GET /game/challenge` · `GET`/`PUT /game/state/{user_id}` | Tarjetas del juego, desafío de cada ronda y progreso por persona |
| `GET /search` | Búsqueda híbrida en un vertical, con precios vigentes |
| `GET /recommendations` | "Para ti, de otras tiendas": intereses → complementos → otro vertical |
| `GET /profile/{id}` · `DELETE /profile/{id}` | Lo aprendido (sin sensibles) · "Olvidar" (todo o un concepto) |
| `POST /events` · `POST /orders` | Eventos y pedidos del prototipo (`source = prototype`). Un pedido sin vertical del catálogo es un 400 |
| `POST /events/beacon` | Lo que queda en cola al cerrar la pestaña (`sendBeacon`, text/plain: sin preflight de CORS) |
| `GET /analytics/{kpis, weekly, opportunities, trends, funnel, cohorts, rhythm, at-risk, suggestions, multi-vertical, affinity, assortment, services, catalog, offers, game, unmet}` | Métricas de negocio (las muestra el [panel](../dashboard-empresa/), parte del MVP). `offers`, `game` y `unmet` son las de «Uso del MVP» |
| `GET /concepts` | Taxonomía de conceptos (id, nombre, emoji, grupo y si es sensible) con su versión |

**Seguridad.** Es una demo local y **no tiene autenticación**:
- **Por defecto:** `make serve` escucha solo en el equipo local (`127.0.0.1`).
- **Para el iPhone:** `make serve-lan` abre la API a la red local. Solo en una red de confianza.
- **CORS:** por defecto solo acepta `localhost` y `127.0.0.1` en los puertos 51xx; con `serve-lan`, también 192.168/16, 10/8, 172.16/12 (el hotspot del iPhone) y nombres `.local`.
- **Tiempos:** Claude tiene 6 s (si no, responde la plantilla); la conexión a Postgres, 3 s, y cada consulta, 5 s (30 s en `/analytics/*`; `API_TIMEOUT_INTERACTIVE_MS` y `API_TIMEOUT_ANALYTICS_MS`). Con la base caída, la API responde 503, y con una consulta que pasa su tope, 504.

**Privacidad:**
- **Datos personales en consultas:** se redactan antes de guardarlas (RUT con dígito verificador, teléfonos, correos, direcciones y tarjetas) y el texto se borra a los 90 días (`make purge`).
- **"Olvidar":** borra eventos y pedidos.
- **Sensibles:** los conceptos sensibles no entran al perfil ni a las métricas de negocio.
- **Claude:** si hay clave, recibe solo hechos estructurados, nunca la consulta del usuario.

## Resultados

Las cifras vigentes (catálogo, búsqueda, precisión de conceptos y de la capa de datos, tests) están en [README.md#resultados](../README.md#resultados); cada reporte fechado, en [docs/resultados/](../docs/resultados/). Aquí solo queda cómo leerlas. `make eval` regenera el reporte de la búsqueda.

### Búsqueda

**Set:** 124 consultas positivas en los 8 verticales y 41 negativas (al menos 5 por vertical, verificadas contra el catálogo completo), en [`src/rappi_ia/eval/queries.json`](src/rappi_ia/eval/queries.json). La relevancia se juzga automáticamente por concepto: un resultado es relevante si su concepto es uno de los esperados para la consulta. El reporte trae la comparación pareada completa (léxico, vectorial, híbrido y la ablación sin refuerzo por concepto), por tipo de consulta y por vertical.

**"Sin resultado"** (demanda no satisfecha), sobre las 41 consultas negativas y con los τ de `src/rappi_ia/eval/thresholds.json`. El reporte dice por qué se detecta o no cada una. Las cifras del reporte son de la búsqueda (`retrieve`); Mochi anota la demanda en menos casos, porque cuando el concepto pedido tiene unos pocos productos (surtido testimonial) los muestra y no la anota.

- **Regla:** es un "sin resultado" cuando nada calza todas las palabras y, además, se cumple la condición que corresponda:
  - si la consulta nombra un concepto, ese concepto no tiene surtido real en el vertical;
  - si no nombra ninguno, el coseno queda bajo τ (una consulta sin palabras que buscar, como «té», que es stopword, o «quiero té porfa», no se marca).
- **Coincidencias casuales:** "pizza familiar" encuentra un horno para pizza en Mall y "neumáticos" un renovador de neumáticos en conveniencia. Es un límite real de la regla léxica estricta.
- **Límite conocido:** un iPhone en el súper no cuenta como "sin resultado", porque hay accesorios del mismo concepto (celulares).

**Salvedades:**

- **Refuerzo por concepto:** el híbrido recibe un refuerzo por el mismo concepto con que se juzga la relevancia; sin él, no se distingue del vectorial (la diferencia no es concluyente, con su intervalo en el reporte).
- **Juez automático:** la relevancia depende de la asignación de conceptos, cuya precisión es una estimación con jueces LLM. No hay juicio humano todavía: la planilla de 200 pares está en `jev-planillas` y faltan los juicios.
- **Set chico:** 124 consultas positivas, con pocas por vertical (7 en chocolatería).

### Conceptos (capa 2)

La cobertura por vertical sale de `rappi-ia concepts --solo-reporte`. La precisión de la asignación (por regla de nombre, por mapeo de categoría y por vecinos) es una **estimación** con jueces LLM sobre una muestra versionada del catálogo completo; los reportes están en [docs/resultados/](../docs/resultados/) y las cifras, en el README.

### Calidad

- **Revisión:** 3 rondas de revisión adversarial automatizada (agentes de IA especializados en lógica, seguridad y privacidad, frontend, rendimiento y contratos entre piezas) el 27-09-2026: 66 hallazgos confirmados y corregidos, con tests de regresión. El 28-09 hubo una auditoría, cuyos 4 bloques de mejoras se aplicaron el 29 y 30-09, y el 11-10 una revisión integral del MVP (ver [docs/decisiones.md](../docs/decisiones.md)).
- **Tests:** las cifras vigentes están en [README.md#resultados](../README.md#resultados) (fila «Calidad»); los de integración corren contra la base `rappi_ia_test`. CI en GitHub Actions (`.github/workflows/ci.yml`) con Postgres + pgvector y las versiones de `requirements.lock.txt`; un job semanal (`modelos-semanal.yml`) instala los modelos.
- **Candado de la base de prueba:** `make test`, `make contract` y `make mvp-check` (raíz) toman `rappi-ia/.test-db.lock` para no pisarse en `rappi_ia_test`; correr `pytest` directamente se salta el candado, así que no lo lances mientras corre alguno de ellos.
- **Optimizaciones del 28-09-2026:** textos por embeber ordenados por largo, índices HNSW con `maintenance_work_mem` de 1 GB (`HNSW_MAINTENANCE_WORK_MEM`) y kNN de conceptos que lee los vectores del caché en binario y por bloques.

## Límites

- **Datos simulados:** usuarios, eventos y pedidos son **simulados** (`source = 'synthetic'`), con supuestos explícitos en `events/synth.py`. Las métricas muestran la mecánica, no evidencia.
- **Muestra pública:** el catálogo es la muestra pública (hasta 24 productos por sub-pasillo), así que "no está" no significa "Rappi no lo vende".
- **Contenido de terceros:** fotos, descripciones y marcas pertenecen a Rappi y a los comercios; se usan solo con fines de investigación y demostración. Ver [README.md#qué-es-real-y-qué-es-simulado](../README.md#qué-es-real-y-qué-es-simulado).

## Estructura

```text
rappi-ia/
├── Makefile, pyproject.toml, requirements.lock.txt, .env.example
├── scripts/despues-del-refresh.sh   espera a que termine una descarga y corre make post-refresh
├── src/rappi_ia/
│   ├── cli.py         comandos de `rappi-ia`
│   ├── config.py      modelos, rutas y parámetros (por entorno)
│   ├── db.py          conexión a Postgres y migraciones (las de rappi-scraper)
│   ├── text.py        normalización de texto (sin tildes ni ñ)
│   ├── concepts/      taxonomía (taxonomy.toml), complementos (complements.toml), mapa de categorías (category_map.csv), reglas, kNN
│   ├── embeddings/    e5, caché de texto, índices HNSW
│   ├── retrieval/     búsqueda híbrida por vertical
│   ├── agent/         el agente (`RappiAgent`): entender, herramientas, redactar
│   ├── catalog/       pantallas de catálogo para la API (/catalog)
│   ├── offers/        ofertas del agente por momento (/agent/offer, /agent/plans)
│   ├── game/          tarjetas (knowledge.json, card_concepts.toml), desafíos y progreso (/game)
│   ├── layers/        capa de datos: medidas, marcas, atributos, grafo y segmentos (esquema capa)
│   ├── demo/          catálogo inventado de `seed-demo` (solo bases _test)
│   ├── jev.py         cliente de Jev (opcional, fuera de línea)
│   ├── events/        eventos, perfil con decaimiento, "olvidar", generador simulado
│   ├── analytics/     métricas de negocio y mapa multivertical
│   ├── eval/          set de evaluación (queries.json), τ (thresholds.json) y muestra de juicio a mano (judgments-sample.json)
│   └── api/           FastAPI
├── tests/
│   ├── unit/          sin base de datos
│   └── integration/   contra rappi_ia_test
└── data/              fuera de git: reporte de evaluación, categorías sin mapear, logs
```

**Migraciones.** Viven en [`rappi-scraper/src/rappi_scraper/storage/migrations/`](../rappi-scraper/src/rappi_scraper/storage/migrations/), para que haya un solo historial. Las de esta capa:

| Migración | Qué agrega |
|---|---|
| `009_concepts.sql` | Taxonomía de conceptos, mapeo de categorías, complementos y concepto por ítem (con método, confianza y versión) |
| `010_embeddings.sql` | Caché de embeddings de texto, embeddings de imágenes y búsqueda léxica sin tildes ni ñ |
| `011_app_events.sql` | Usuarios, eventos y pedidos de la app (`synthetic` o `prototype`, nunca mezclados), con ids seudónimos |
| `012_concept_assortment.sql` | Surtido materializado por concepto, índice de eventos por fuente y aristas aprendidas por fuente |
| `013_search_price.sql` | Precio de cada documento como columna indexada: el filtro de precio de la búsqueda vectorial revisa todos los documentos cuando el tope deja pocos |
| `016_concept_prepared_and_stores.sql` | Qué conceptos se piden hechos (restaurantes) y tiendas por concepto, para elegir la vertical del agente |
| `020_service_events.sql` | Eventos de servicios sin catálogo (`service_shown`, `service_opened`) |
| `022`–`026` | Capa de datos: medidas, atributos, marcas, canónicos, grafo, segmentos y vistas `capa` |
| `027_ask_events.sql` | Evento `ask` (antes `chat`, que se sigue aceptando) |
| `028_game.sql` · `029_game_events.sql` | Tarjetas del juego y su progreso; eventos `game_round_finished` y `game_card_discovered` |
| `030_jev.sql` | Caché de juicios de Jev (`eval_judgments`) y método `jev` en el mapa de categorías |
| `031_order_mode.sql` | El modo de la app en que se hizo cada pedido (los de «Rappi hoy» no entran al perfil) |
| `032_latest_prices.sql` | `latest_prices` y `latest_menu_prices` (el último precio, mantenido por triggers) y la vista `v_latest_offers`, la definición única de oferta vigente |

`014`–`015` (limpieza del HTML de los documentos de búsqueda), `017`–`019` y `021` (formatos de tienda, Turbo, vigencia y platos por local) son del scraper.
