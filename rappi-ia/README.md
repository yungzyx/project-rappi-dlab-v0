# rappi-ia

Conecta el catálogo que descarga [`rappi-scraper`](../rappi-scraper/) con el asistente **Bigotes** del [prototipo](../prototipo-app/) y con el [panel de negocio](../dashboard-empresa/). Diseño completo en [docs/diseno-ia.md](../docs/diseno-ia.md).

**Regla:** *buscar dentro del vertical, entender al usuario a través de los verticales*. La búsqueda nunca mezcla verticales. El puente entre ellos son los **conceptos**: una taxonomía propia de 133 conceptos, con 103 complementos curados entre sí. Una recomendación cruzada va del concepto que le interesa al usuario a su complemento, y de ahí a una búsqueda en el otro vertical (p. ej., cerveza en licores → snacks salados de otra tienda).

![Flujo de datos por etapas: Descarga → Postgres → IA offline → Consulta → Apps](../docs/diagramas/rag-datos.png)

Versión interactiva: [rag-datos.html](../docs/diagramas/rag-datos.html). Vista por carriles: [arquitectura-ia.png](../docs/diagramas/arquitectura-ia.png) ([interactiva](../docs/diagramas/arquitectura-ia.html)). Los HTML se descargan y se abren en el navegador.

| Pieza | Qué hace | Dónde |
|---|---|---|
| Conceptos (capa 2) | Cada producto y plato → un concepto, con procedencia: categoría (mapa de 757 categorías revisadas, generado con LLM: dos etiquetadores trabajan por separado y un juez decide cuando no coinciden; 21 ajustes a mano; versionado en `category_map.csv`), reglas por palabra o vecinos cercanos (kNN) | `concepts/` |
| Embeddings | Texto con `intfloat/multilingual-e5-base` (768 dim, caché por contenido, índice HNSW por vertical); imágenes con CLIP; voz con Whisper → texto | `embeddings/`, `agent/audio.py` |
| Búsqueda híbrida | Léxico (sin tildes ni ñ, IDF) + vectorial → RRF → refuerzo por concepto, con filtros dentro de cada lista y regla de "sin resultado" | `retrieval/hybrid.py` |
| Bigotes | Entender → buscar → sugerir un complemento de otro vertical → redactar (plantillas o Claude) → verificar | `agent/` |
| Eventos y analítica | Usuarios y eventos (hoy **simulados**), métricas de frecuencia, abandono, oportunidades y afinidad | `events/`, `analytics/` |

## Instalar

Desde la raíz del repositorio (requiere la base de [`rappi-scraper`](../rappi-scraper/)):

```bash
cd rappi-ia
make install      # .venv + rappi-scraper (esquema) + API + tests
make install-ml   # modelos locales: e5, CLIP, Whisper (y Claude opcional)
make db-test      # base rappi_ia_test (los tests no tocan rappi ni rappi_test)
make migrate
```

Las versiones de las librerías están fijadas en `requirements.lock.txt` (las del equipo que calculó los embeddings de la base): `make install` e `install-ml` no instalan otras. Un job de CI semanal (`.github/workflows/modelos-semanal.yml`) instala los modelos con esas versiones y comprueba que e5 embebe. Los modelos (~2 GB) se descargan de Hugging Face la primera vez que se usan. La API los carga al arrancar: hay que esperar a «Application startup complete» (con los modelos ya en caché, `make serve` arranca sin consultar Hugging Face; `RAPPI_IA_LIGHT=1` arranca sin modelos). Para que Claude redacte las respuestas, agrega `ANTHROPIC_API_KEY` en `.env`; sin clave, Bigotes responde con plantillas y las mismas reglas. Otras variables en `.env.example`.

## Correr

Después de cada `rappi refresh` del scraper:

```bash
make post-refresh                 # migrate + purge + concepts + embed + eval + synth + purge
./scripts/despues-del-refresh.sh  # lo mismo, pero espera a que termine un `rappi refresh` lanzado a mano
```

La tarea semanal del scraper (`make schedule` en `rappi-scraper/`) ya lo hace sola, con una diferencia: evalúa sin guardar τ.

| Objetivo | Qué hace |
|---|---|
| `make concepts` | Capa 2: conceptos por producto y plato (con kNN si está el extra `ml`) |
| `make embed` | Embeddings de texto (incrementales) + índices HNSW por vertical. No corre si hay una descarga del scraper en curso |
| `make eval` | Evalúa la búsqueda (léxico, vectorial, híbrido y ablación sin refuerzo), guarda τ en `src/rappi_ia/eval/thresholds.json` (solo en verticales con negativas que dependen de τ; los demás conservan el suyo; `make eval EVAL_ARGS=` no guarda) y deja el reporte en `data/eval/busqueda.md` |
| `make synth` | Usuarios y eventos **simulados** para el panel (1.500 usuarios × 20 semanas, semilla 7; reemplaza los anteriores) |
| `make purge` | Borra el texto de las consultas con más de 90 días |
| `make analytics` | Resumen de métricas del panel en la terminal |
| `make images` | Fotos del catálogo con CLIP (miles de descargas). Toma el candado del scraper: no arranca con una descarga en curso |
| `make serve` / `make serve-lan` | API local / abierta a la red local (ver Seguridad) |
| `make test`, `make lint`, `make format` | Tests, revisión de estilo y formato |

`make help` lista todos los objetivos. Otros comandos:

- `rappi-ia search "algo para el carrete" --vertical licores`
- `rappi-ia concepts --solo-reporte`: cobertura sin recalcular; también lista las categorías sin mapeo revisado (las nuevas de cada semana). Las revisadas sin concepto (filas «ninguno» de `category_map.csv`) no vuelven a aparecer.
- `rappi-ia map-categories`: exporta las categorías sin mapeo revisado a `data/concepts/categorias-sin-mapear.csv`, con el formato de `category_map.csv` y un concepto sugerido cuando al menos la mitad de sus productos ya lo tiene (reglas o kNN). Se revisa cada fila, se cambia el método a «curado» y se copia al mapa versionado.
- `rappi-ia eval-sample`: arma la muestra de 200 pares (consulta, producto) para juzgar a mano (`src/rappi_ia/eval/judgments-sample.json`, con semilla fija): 120 donde el híbrido con y sin refuerzo por concepto difieren en el top 10 y 80 al azar. Se juzga a ciegas en una página privada del autor (sin mostrar el juez automático ni el modo); los juicios se copian a `src/rappi_ia/eval/judgments.json`, que todavía no existe.
- `rappi-ia eval-human`: con esos juicios, cuánto acierta el juez automático (precisión, recall, acuerdo) y si los ítems que solo trae el refuerzo son relevantes más o menos seguido que los que solo trae sin él.
- `rappi-ia multivertical`: regenera el mapa de la presentación (`dashboard-empresa/public/presentacion/mapa-multivertical.html`): productos compartidos entre verticales, conceptos junto a la vertical donde son más típicos (la regla de Bigotes) y los productos y cadenas en más verticales. Página autocontenida, sin internet. La imagen `mapa-conceptos.jpg` se captura de esa página con `#figura` al final de la URL.
- `rappi-ia embed-images --limit 50 --forzar`: una tanda chica de imágenes; `--forzar` se salta el candado del scraper y es solo para pruebas.

## API (`make serve` → http://localhost:8000/docs)

| Endpoint | Para qué |
|---|---|
| `GET /health` | Capacidades disponibles (búsqueda semántica, voz, fotos, redacción) y documentos indexados |
| `POST /chat` | Bigotes: `{message, vertical?, user_id?, session_id?, profile?, shown_topics?, mode}`. Acepta los ids de vertical del prototipo (`liquor`, `grocery`…) |
| `POST /chat/voice`, `POST /chat/photo` | Voz (Whisper, audio ≤ 20 s medido al decodificar) y foto (JPEG/PNG/WebP), con `shown_topics` (ids separados por coma). No se guardan |
| `GET /search` | Búsqueda híbrida en un vertical, con precios vigentes |
| `GET /recommendations` | "Para ti, de otras tiendas": intereses → complementos → otro vertical |
| `GET /profile/{id}` · `DELETE /profile/{id}` | Lo aprendido (sin sensibles) · "Olvidar" (todo o un concepto) |
| `POST /events` · `POST /orders` | Eventos y pedidos del prototipo (`source = prototype`). Un pedido sin vertical del catálogo es un 400 |
| `POST /events/beacon` | Lo que queda en cola al cerrar la pestaña (`sendBeacon`, text/plain: sin preflight de CORS) |
| `GET /analytics/{kpis, weekly, opportunities, trends, funnel, cohorts, rhythm, at-risk, suggestions, multi-vertical, affinity, assortment, catalog}` | Métricas del panel |
| `GET /concepts` | Taxonomía de conceptos (id, nombre, emoji, grupo y si es sensible) con su versión |

**Seguridad.** Es una demo local y **no tiene autenticación**:
- **Por defecto:** `make serve` escucha solo en el equipo local (`127.0.0.1`).
- **Para el iPhone:** `make serve-lan` abre la API a la red local. Solo en una red de confianza.
- **CORS:** por defecto solo acepta `localhost` y `127.0.0.1` en los puertos 51xx; con `serve-lan`, también 192.168/16, 10/8, 172.16/12 (el hotspot del iPhone) y nombres `.local`.
- **Tiempos:** Claude tiene 6 s (si no, responde la plantilla); la conexión a Postgres, 3 s, y cada consulta, 20 s. Con la base caída, la API responde 503.

**Privacidad:**
- **Datos personales en consultas:** se redactan antes de guardarlas (RUT con dígito verificador, teléfonos, correos, direcciones y tarjetas) y el texto se borra a los 90 días (`make purge`).
- **"Olvidar":** borra eventos y pedidos.
- **Sensibles:** los conceptos sensibles no entran al perfil ni a las palancas del panel.
- **Claude:** si hay clave, recibe solo hechos estructurados, nunca la consulta del usuario.

## Resultados

Con el catálogo del 30-09-2026 (primera descarga semanal automática). Resumen del proyecto en [README.md#resultados](../README.md#resultados) y reporte completo en [docs/resultados/](../docs/resultados/).

**Catálogo indexado.** 270.607 documentos de búsqueda (93.823 productos, 172.278 platos y 4.506 tiendas), 100 % con embedding.

### Búsqueda

**Set:** 124 consultas positivas en los 8 verticales y 41 negativas (al menos 5 por vertical, verificadas contra el catálogo completo el 29-09), en [`src/rappi_ia/eval/queries.json`](src/rappi_ia/eval/queries.json). La relevancia se juzga automáticamente por concepto: un resultado es relevante si su concepto es uno de los esperados para la consulta. `make eval` regenera el reporte.

| Modo | P@10 | MRR | nDCG@10 |
|---|---|---|---|
| Léxico | 0,769 | 0,868 | 0,778 |
| Vectorial | 0,838 | 0,907 | 0,846 |
| **Híbrido** | **0,905** | **0,939** | **0,910** |
| Híbrido sin refuerzo por concepto | 0,856 | 0,913 | 0,860 |

Sin el refuerzo, el híbrido no se distingue del vectorial: consulta por consulta la diferencia media es 0,014 (IC 95 % por bootstrap: −0,012 a 0,042). Cifras con el catálogo del 30-09. El reporte trae la comparación pareada completa.

| Tipo de consulta | n | nDCG@10 híbrido |
|---|---|---|
| Exactas (marca o producto) | 77 | 0,979 |
| Sin tildes ni ñ | 16 | 0,965 |
| Necesidades en lenguaje natural ("algo para el carrete") | 31 | 0,711 (léxico: 0,570) |

| Vertical | n | nDCG@10 híbrido |
|---|---|---|
| Farmacia | 14 | 0,979 |
| Chocolatería | 7 | 0,956 |
| Restaurantes | 11 | 0,942 |
| Turbo | 14 | 0,915 |
| Mall | 18 | 0,907 |
| Conveniencia | 12 | 0,903 |
| Supermercado | 30 | 0,896 |
| Licores | 18 | 0,847 |

**"Sin resultado"** (demanda no satisfecha), sobre las 41 consultas negativas y con los τ recalibrados el 29-09 (`src/rappi_ia/eval/thresholds.json`): precisión 1,00 (0 falsas alarmas) y recall 0,71 (29 de 41) con el catálogo del 30-09 (31 de 41 con el del 28-09: el catálogo cambia y dos negativas dejaron de serlo). El reporte dice por qué se detecta o no cada una.

- **Regla:** es un "sin resultado" cuando nada calza todas las palabras y, además, se cumple la condición que corresponda:
  - si la consulta nombra un concepto, ese concepto no tiene surtido real en el vertical;
  - si no nombra ninguno, el coseno queda bajo τ (una consulta sin palabras que buscar, como «té», que es stopword, no se marca).
- **Por qué no se detectan 12:** 5 nombran un concepto que el vertical sí tiene, 4 calzan por casualidad con la regla léxica estricta y 3 quedan sobre τ.
- **Set anterior (28-09):** recall 0,33 (5 de 15), porque parte de las negativas quedó desactualizada con el catálogo completo: "kebab mixto" (16 platos) y "comida mexicana con tacos" sí existen. Se reemplazaron el 29-09.
- **Coincidencias casuales:** "pizza familiar" encuentra un horno para pizza en Mall y "neumáticos" un renovador de neumáticos en conveniencia. Es un límite real de la regla léxica estricta.
- **Límite conocido:** un iPhone en el súper no cuenta como "sin resultado", porque hay accesorios del mismo concepto (celulares).

**Salvedades:**

- **Refuerzo por concepto:** el híbrido recibe un refuerzo por el mismo concepto con que se juzga la relevancia; sin él, empata con el vectorial (0,860 frente a 0,846).
- **Juez automático:** la relevancia depende de la asignación de conceptos, cuya precisión es una estimación (ver abajo). No hay juicio humano todavía: la muestra ya está armada (`eval-sample`) y faltan los juicios.
- **Set chico:** 124 consultas positivas, con pocas por vertical (7 en chocolatería).
- **Antes (27-09, datos parciales):** híbrido nDCG@10 0,898; "sin resultado" con precisión 0,91 y recall 0,67.

### Conceptos (capa 2)

Corrida del 30-09-2026: 132 conceptos, 101 complementos curados, 757 categorías con mapeo revisado y 131 nuevas por revisar (`map-categories`).

| Vertical | Con concepto |
|---|---|
| Restaurantes | 97,9 % |
| Mall | 98,1 % |
| Supermercado | 99,1 % |
| Conveniencia | 99,8 % |
| Licores | 100 % |
| Farmacia | 97,1 % |
| Turbo | 100 % |
| Chocolatería | 100 % |

**Precisión de la asignación (estimación).** Se midió con jueces LLM sobre los datos parciales del 27-09; la muestra no está versionada, así que la cifra no se puede reproducir tal cual.

| Tipo de asignación | Precisión estimada |
|---|---|
| Por categoría | ≈ 88 % |
| Platos | ≈ 81 % |
| Reglas por nombre | 55 %: la parte más débil |

- **kNN:** en esa medición corrigió ítems puntuales, pero no subió la precisión global.
- **Siguiente mejora:** etiquetar con un LLM los ítems de baja confianza, revisar a mano los de mayor tráfico y versionar la muestra.

### Calidad

- **Revisión:** 3 rondas de revisión adversarial automatizada (agentes de IA especializados en lógica, seguridad y privacidad, frontend, rendimiento y contratos entre piezas) el 27-09-2026: 66 hallazgos confirmados y corregidos, con tests de regresión. El 28-09 hubo una auditoría, cuyos 4 bloques de mejoras se aplicaron el 29 y 30-09 (ver [docs/decisiones.md](../docs/decisiones.md)).
- **Tests:** 189 (pytest, 30-09-2026), contra la base `rappi_ia_test`. CI en GitHub Actions (`.github/workflows/ci.yml`) con Postgres + pgvector y las versiones de `requirements.lock.txt`; un job semanal (`modelos-semanal.yml`) instala los modelos.
- **Optimizaciones del 28-09-2026:** textos por embeber ordenados por largo, índices HNSW con `maintenance_work_mem` de 1 GB (`HNSW_MAINTENANCE_WORK_MEM`) y kNN de conceptos que lee los vectores del caché en binario y por bloques.

## Límites

- **Datos simulados:** usuarios, eventos y pedidos son **simulados** (`source = 'synthetic'`), con supuestos explícitos en `events/synth.py`. El panel muestra la mecánica, no evidencia.
- **Muestra pública:** el catálogo es la muestra pública (hasta 24 productos por sub-pasillo), así que "no está" no significa "Rappi no lo vende".
- **Contenido de terceros:** fotos, descripciones y marcas pertenecen a Rappi y a los comercios; se usan solo con fines de investigación y demostración. Ver [README.md#uso-responsable-de-los-datos](../README.md#uso-responsable-de-los-datos).

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
│   ├── embeddings/    e5 y CLIP, caché de texto, imágenes, índices HNSW
│   ├── retrieval/     búsqueda híbrida por vertical
│   ├── agent/         Bigotes: entender, herramientas, redactar, voz, foto
│   ├── events/        eventos, perfil con decaimiento, "olvidar", generador simulado
│   ├── analytics/     métricas del panel
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

`014_clean_html.sql` y `015_clean_html_more_entities.sql` (limpieza del HTML de los documentos de búsqueda) son del scraper.
