# CLAUDE.md — Proyecto Rappi

Contexto para retomar el trabajo en cualquier equipo. Última actualización: 26-09-2026.

## Qué es

Base de datos del contenido de Rappi Chile por vertical (supermercado, conveniencia, Turbo, Rappi Mall, farmacia, licores, chocolatería, restaurantes) para análisis y, después, un RAG / búsqueda semántica para un agente LLM. Leer primero:

- [docs/contexto-y-problema.md](docs/contexto-y-problema.md): por qué existe el proyecto (en Rappi el comportamiento de un usuario en un vertical no influye en las recomendaciones de otros).
- [docs/ecosistema-rappi.md](docs/ecosistema-rappi.md): research del ecosistema y modelo de datos propuesto (capas 1–3).
- [docs/diagramas/rag-flujo.html](docs/diagramas/rag-flujo.html): flujo del RAG (fase 2).
- [rappi-scraper/README.md](rappi-scraper/README.md): instalación, comandos y estructura del código.

## Estado

| Fase | Estado |
|---|---|
| 1. Scraper → Postgres | Código listo y probado (63 tests). **Descarga completa pendiente**: 891 grupos de tiendas y 4.855 restaurantes en cola. |
| Paso 1 del scraper: corridas confiables | Listo: reintento automático, `retry-failed`, reporte de calidad, log a archivo, `caffeinate`, progreso con ETA. |
| Paso 2: descarga completa | Siguiente. `rappi scrape-stores` (~10–15 h) y luego `rappi scrape-restaurants` (~4 h). **No correr las dos en paralelo.** |
| Paso 3: corridas periódicas (semanal) | Pendiente. |
| Paso 4: capa 2 del modelo (taxonomía común + mapeo, platos estándar, trazabilidad, H3) | Pendiente; conviene hacerla con los datos completos. |
| 2. RAG | Diseñado (ver diagrama). Pendiente: set de evaluación, modelo de embeddings, LLM. |

El usuario pidió avanzar **paso por paso**: terminar y perfeccionar el scraper antes del RAG.

## Decisiones tomadas

- Solo páginas públicas de rappi.cl; nada de API interna (robots.txt la prohíbe).
- **Solo Rappi**: no scrapear Uber Eats ni PedidosYa (exigen evadir Cloudflare; más riesgo legal).
- Aceptar la cobertura parcial en tiendas (tope de 24 productos por sub-pasillo).
- Una sucursal por marca/formato (modo catálogo); corridas periódicas con historial de precios.
- Postgres 17 + pgvector local (Homebrew). Búsqueda aislada por vertical (una partición por vertical).
- Áreas iniciales del RAG: Marketing / contenido, Producto / growth, Data / BI.
- Entidades internas de Rappi (usuarios, pedidos, Pro, Ads…) solo como diseño, sin tablas.
- Sin datos internos de Rappi: todo se trabaja con supuestos; marcar inferencias como tales.

## Pendiente de decidir (preguntar al usuario)

- Taxonomía de referencia para la capa 2: GS1 GPC, Google Product Taxonomy o propia.
- Modelo de embeddings (OpenAI, local o comparar) y LLM para el RAG.
- Qué hacer con la carpeta vacía `Proyecto/` (no la creó Claude; no está versionada).

## Configurar en otro Mac (p. ej. Mac mini)

```bash
git clone https://github.com/yungzyx/rappi.git ~/Documents/LeRepo/Rappi
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

## Convenciones

- Código (funciones, módulos, variables) en inglés; todo lo que ve el usuario (logs, CLI, docs, columnas) en español.
- `make test` y `make lint` antes de dar algo por terminado. Tests de integración contra `rappi_test`.
- Mover la carpeta del proyecto rompe el `.venv` (rutas absolutas): recrearlo con `make install`.
- No mover la carpeta con un proceso del scraper corriendo.
- Los datos scrapeados no se suben a git (`rappi-scraper/data/` está ignorado).
