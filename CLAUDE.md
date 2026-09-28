# CLAUDE.md — Proyecto Rappi

Contexto para retomar el trabajo en cualquier equipo. Última actualización: 27-09-2026.

## Qué es

Base de datos del contenido de Rappi Chile por vertical (supermercado, conveniencia, Turbo, Rappi Mall, farmacia, licores, chocolatería, restaurantes) para análisis y, después, un RAG / búsqueda semántica para un agente LLM. Leer primero:

- [docs/contexto-y-problema.md](docs/contexto-y-problema.md): por qué existe el proyecto (en Rappi el comportamiento de un usuario en un vertical no influye en las recomendaciones de otros).
- [docs/ecosistema-rappi.md](docs/ecosistema-rappi.md): research del ecosistema y modelo de datos propuesto (capas 1–3).
- [docs/diseno-ia.md](docs/diseno-ia.md): diseño del RAG, el agente Bigotes y el panel empresa (qué datos se relacionan, multimodal, conducta del agente, métricas). Grafo: [docs/diagramas/arquitectura-ia.html](docs/diagramas/arquitectura-ia.html).
- [docs/diagramas/rag-flujo.html](docs/diagramas/rag-flujo.html): primer flujo del RAG (26-09-2026), **reemplazado** por `arquitectura-ia.html` y docs/diseno-ia.md (sin reranker, LLM opcional). Las fuentes JSON de los grafos están en `docs/diagramas-fuente/` (se generan con la skill Archify).
- [rappi-scraper/README.md](rappi-scraper/README.md): instalación, comandos y estructura del código.

## Estado

| Fase | Estado |
|---|---|
| 1. Scraper → Postgres | Código listo y probado (72 tests, también en CI). Primera descarga completa terminada el 27-09-2026 21:28: 780 grupos de tiendas (69.850 productos, 121.557 ofertas) y 3.080 restaurantes (150.955 platos). Farmacia quedó corta (ParseError en 23 cadenas, pendiente). Reportes en `rappi-scraper/data/reports/`. |
| Paso 1 del scraper: corridas confiables | Listo: reintento automático, `retry-failed`, reporte de calidad, log a archivo, `caffeinate`, progreso con ETA. |
| Paso 2: descarga completa | Hecha (27-09-2026; tiendas ~3 días con pausas, restaurantes ~4 h). Respaldo `rappi-scraper/data/backups/rappi_20260927-231341.dump` (con conceptos y embeddings parciales). **No correr dos descargas en paralelo** (tampoco la descarga masiva de imágenes). |
| Paso 3: corridas periódicas (semanal) | Listo: `make schedule` (launchd, domingos 03:00) corre `rappi refresh` + respaldo rotativo y después la capa de IA (`scripts/refresh-semanal.sh`). **Activar solo en el Mac mini** ([docs/mac-mini.md](docs/mac-mini.md)). |
| CI | GitHub Actions: lint + tests (unitarios e integración con Postgres + pgvector) en cada push. |
| Paso 4: capa 2 del modelo (conceptos, `category_map`, `item_concepts`, `concept_edges`, trazabilidad) | Es la etapa 1 de docs/diseno-ia.md; se vuelve a correr con los datos completos. H3 queda para después. |
| Prototipo (`prototipo-app/`) | Listo para demo: réplica de la app, asistente Bigotes (reglas, sin backend), modo Rappi hoy / Propuesta. |
| 2–4. RAG, agente y panel (`rappi-ia/`, `dashboard-empresa/`) | **Construido (27-09-2026)**, etapas 0–7 de [docs/diseno-ia.md](docs/diseno-ia.md#7-etapas). Resultados y límites en `rappi-ia/README.md`: búsqueda híbrida nDCG@10 0,90; conceptos ≈88% de precisión en productos. Tres pasadas de revisión adversarial corregidas (66 hallazgos). Con los datos completos, conceptos listos (98,8% de productos, 97,9% de platos); embeddings cortados en 104.960/183.025 textos: falta `make embed eval synth purge` (se hará en el Mac mini tras restaurar). `make images` después, a mano. |
| Prototipo conectado | Con la API (`make serve`) Bigotes usa catálogo real, voz (Whisper) y foto (CLIP), y registra eventos seudónimos; sin API, reglas locales. |

El usuario pidió avanzar **paso por paso**, y el 27-09-2026 autorizó ejecutar todas las etapas del diseño con QA y tests en cada una.

## Decisiones tomadas

- Solo páginas públicas de rappi.cl; nada de API interna (robots.txt la prohíbe).
- **Solo Rappi**: no scrapear Uber Eats ni PedidosYa (exigen evadir Cloudflare; más riesgo legal).
- Aceptar la cobertura parcial en tiendas (tope de 24 productos por sub-pasillo).
- Una sucursal por marca/formato (modo catálogo); corridas periódicas con historial de precios.
- Postgres 17 + pgvector local (Homebrew). Búsqueda aislada por vertical (una partición por vertical).
- **Buscar dentro del vertical, entender a través de los verticales** (27-09-2026): el silo es el problema, no un principio. Los intereses del usuario se guardan como conceptos (capa 2) y las recomendaciones cruzadas van concepto → complemento → búsqueda en el otro vertical.
- Taxonomía **propia** para la capa 2 (se puede enlazar a Google Product Taxonomy después).
- Embeddings **locales**: `intfloat/multilingual-e5-base` (texto), CLIP ViT-B/32 + codificador multilingüe (imagen), Whisper (`faster-whisper`, voz → texto). LLM **opcional** (Claude) solo para redactar; sin clave responde con plantillas. Jev (TypeSafe) queda como adaptador futuro para entender consultas.
- Usuarios, eventos y pedidos de la capa 3 son **simulados** (o del prototipo) y llevan `source`; nunca se mezclan con datos reales.
- Áreas iniciales del RAG: Marketing / contenido, Producto / growth, Data / BI.
- Entidades internas de Rappi (Pro, Ads, pagos…) solo como diseño. Usuarios, eventos y pedidos tendrán tablas con datos simulados o del prototipo (etapa 5 de docs/diseno-ia.md).
- Sin datos internos de Rappi: todo se trabaja con supuestos; marcar inferencias como tales.

## Pendiente de decidir (preguntar al usuario)

- Qué hacer con `Proyecto/` (no la creó Claude; está ignorada por git). No está vacía: tiene `agent.py`, un intento con LangChain y `gpt-4.1-mini` que no corre; `rappi-ia/` lo reemplaza.

## Configurar en otro Mac (p. ej. Mac mini)

Guía completa en [docs/mac-mini.md](docs/mac-mini.md): código por GitHub, base por respaldo (`make backup` → AirDrop → `pg_restore`), rappi-ia con modelos, prototipo y panel, y `make schedule` (descarga + capa de IA los domingos, solo en el Mac mini).

## Notas técnicas

- La búsqueda por texto (`to_tsvector('spanish', …)`) ya ignora tildes normales (café = cafe); mantiene ñ y ü a propósito (año ≠ ano).
- Pendientes del scraper que requieren los datos completos: revisar las ~80 cadenas de restaurantes que no traen datos; capa 2 del modelo.
- `rappi-csv` (scraper CSV original) quedó redundante con la base + `export-csv`; el usuario no ha decidido si eliminarlo.

## Convenciones

- Código (funciones, módulos, variables) en inglés; todo lo que ve el usuario (logs, CLI, docs, columnas) en español.
- `make test` y `make lint` antes de dar algo por terminado. Tests de integración contra `rappi_test` (scraper) y `rappi_ia_test` (rappi-ia), para que no se pisen.
- Las migraciones de la base (también las de conceptos, embeddings y eventos) viven en `rappi-scraper/src/rappi_scraper/storage/migrations/`: un solo historial.
- `rappi-ia` carga su `.env` antes que el de `rappi-scraper` (ver `rappi_ia/__init__.py`); sus tests se niegan a borrar otra base que no sea `rappi_ia_test`.
- Servidores de demo: API `:8000` (`make serve`; `0.0.0.0` pide permiso de red a macOS la primera vez), prototipo `:5174`, panel `:5175`. El prototipo apunta a otra API con `.env.local` (`VITE_API_URL`).
- Datos de usuarios: solo `source = 'synthetic'` (generador con semilla) o `'prototype'`. Nunca presentar métricas simuladas como evidencia.
- `build_search_documents` borra de `search_documents` todo lo que no regenera: los datos derivados (conceptos, caché de embeddings, imágenes) van en tablas propias.
- Mover la carpeta del proyecto rompe el `.venv` (rutas absolutas): recrearlo con `make install`.
- No mover la carpeta con un proceso del scraper corriendo.
- Los datos scrapeados no se suben a git (`rappi-scraper/data/` está ignorado).
