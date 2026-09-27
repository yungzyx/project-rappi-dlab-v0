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
| 1. Scraper → Postgres | Código listo y probado (70 tests, también en CI). **Descarga completa en curso** (`rappi refresh` lanzado el 26-09 19:16 por el usuario en su Terminal): 887 grupos de tiendas y luego 4.855 restaurantes. |
| Paso 1 del scraper: corridas confiables | Listo: reintento automático, `retry-failed`, reporte de calidad, log a archivo, `caffeinate`, progreso con ETA. |
| Paso 2: descarga completa | En curso con `rappi refresh` (tiendas ~14 h, restaurantes ~4 h). **No correr dos descargas en paralelo** (tampoco la descarga masiva de imágenes). |
| Paso 3: corridas periódicas (semanal) | Listo: `rappi refresh` + respaldo rotativo + `make schedule` (launchd, domingos 03:00). **Activar solo en el Mac mini** con `make schedule`. |
| CI | GitHub Actions: lint + tests (unitarios e integración con Postgres + pgvector) en cada push. |
| Paso 4: capa 2 del modelo (conceptos, `category_map`, `item_concepts`, `concept_edges`, trazabilidad) | Es la etapa 1 de docs/diseno-ia.md; se vuelve a correr con los datos completos. H3 queda para después. |
| Prototipo (`prototipo-app/`) | Listo para demo: réplica de la app, asistente Bigotes (reglas, sin backend), modo Rappi hoy / Propuesta. |
| 2–4. RAG, agente y panel (`rappi-ia/`, `dashboard-empresa/`) | Diseñado (etapa 0). Se construye por etapas según [docs/diseno-ia.md](docs/diseno-ia.md#7-etapas); ver la sección de estado de cada carpeta. |

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

```bash
git clone https://github.com/yungzyx/rappi-dlab.git ~/Documents/LeRepo/Rappi
cd ~/Documents/LeRepo/Rappi/rappi-scraper
make db        # Homebrew: Postgres 17 + pgvector, bases rappi y rappi_test
make install   # .venv + dependencias + .env desde .env.example
```

Restaurar la base desde el respaldo `rappi.dump` (copiado por AirDrop o iCloud Drive, no está en GitHub):

```bash
export PATH="$(brew --prefix)/opt/postgresql@17/bin:$PATH"   # postgresql@17 no queda en el PATH
dropdb --if-exists rappi && createdb rappi
pg_restore --no-owner -d rappi ~/Downloads/rappi.dump   # ajustar la ruta del archivo
.venv/bin/rappi migrate                                  # aplica migraciones nuevas, si las hay
.venv/bin/rappi status                                   # debe mostrar las corridas y la cola
make test
```

Si no hay respaldo: `make migrate` y `rappi discover` (~1 h) recrean la cola desde cero.

## Notas técnicas

- La búsqueda por texto (`to_tsvector('spanish', …)`) ya ignora tildes normales (café = cafe); mantiene ñ y ü a propósito (año ≠ ano).
- Pendientes del scraper que requieren los datos completos: revisar las ~80 cadenas de restaurantes que no traen datos; capa 2 del modelo.
- `rappi-csv` (scraper CSV original) quedó redundante con la base + `export-csv`; el usuario no ha decidido si eliminarlo.

## Convenciones

- Código (funciones, módulos, variables) en inglés; todo lo que ve el usuario (logs, CLI, docs, columnas) en español.
- `make test` y `make lint` antes de dar algo por terminado. Tests de integración contra `rappi_test` (scraper) y `rappi_ia_test` (rappi-ia), para que no se pisen.
- Las migraciones de la base (también las de conceptos, embeddings y eventos) viven en `rappi-scraper/src/rappi_scraper/storage/migrations/`: un solo historial.
- `build_search_documents` borra de `search_documents` todo lo que no regenera: los datos derivados (conceptos, caché de embeddings, imágenes) van en tablas propias.
- Mover la carpeta del proyecto rompe el `.venv` (rutas absolutas): recrearlo con `make install`.
- No mover la carpeta con un proceso del scraper corriendo.
- Los datos scrapeados no se suben a git (`rappi-scraper/data/` está ignorado).
