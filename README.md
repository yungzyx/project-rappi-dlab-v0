# Rappi Chile

Proyecto para entender qué contenido hay en cada vertical de Rappi Chile (supermercados, conveniencia, Turbo, Rappi Mall, farmacias, licores, chocolaterías y restaurantes) y usarlo para análisis, cruce de información y, más adelante, un RAG / búsqueda semántica para un agente LLM.

**Principio de diseño:** el comportamiento de un usuario en un vertical no influye en otro, por eso la búsqueda y los índices vectoriales están aislados por vertical; los análisis cruzados se hacen sobre el catálogo compartido.

**Por qué existe este proyecto:** ver [docs/contexto-y-problema.md](docs/contexto-y-problema.md). Ecosistema y modelo de datos: [docs/ecosistema-rappi.md](docs/ecosistema-rappi.md). Flujo del RAG: [docs/diagramas/rag-flujo.html](docs/diagramas/rag-flujo.html).

## Componentes

| Carpeta | Qué es | Estado |
|---|---|---|
| [`rappi-scraper/`](rappi-scraper/) | Scraper de páginas públicas de rappi.cl → Postgres + pgvector (catálogo, menús, precios con historial, documentos de búsqueda por vertical) | Listo; descarga completa pendiente |
| [`prototipo-app/`](prototipo-app/) | Prototipo navegable de la app (Vite + React): réplica de las pantallas, modo demo Rappi hoy / Propuesta, asistente Bigotes con recomendaciones entre verticales, checkout y menús reales del scraper. `npm install && npm run dev` | Listo para demo |

Próximas piezas (cuando se construyan, van como carpetas hermanas): análisis inicial, embeddings / RAG, agente.

## Dónde están los datos

- **Base de datos:** Postgres 17 local (Homebrew), base `rappi`. No vive en esta carpeta: `/opt/homebrew/var/postgresql@17`.
- **Archivos:** `rappi-scraper/data/` (CSV del scraper original, exportaciones y muestras).

## Empezar

```bash
cd ~/Documents/LeRepo/Rappi/rappi-scraper
make status          # o: .venv/bin/rappi status
```

Instalación, comandos y modelo de datos: [rappi-scraper/README.md](rappi-scraper/README.md).
