# Rappi Chile

Proyecto para entender qué contenido hay en cada vertical de Rappi Chile (supermercados, conveniencia, Turbo, Rappi Mall, farmacias, licores, chocolaterías y restaurantes) y usarlo para análisis, cruce de información y, más adelante, un RAG / búsqueda semántica para un agente LLM.

**El problema:** hoy en Rappi lo que un usuario hace en un vertical no cambia lo que se le recomienda en los otros; cada vertical es un silo.

**Principio de diseño:** *buscar dentro del vertical, entender al usuario a través de los verticales*. Los índices de búsqueda siguen aislados por vertical (precisión), pero los intereses del usuario se guardan como **conceptos** comunes a todos los verticales. Las recomendaciones cruzadas van de concepto a complemento y de ahí a la búsqueda en el otro vertical.

**Por qué existe este proyecto:** ver [docs/contexto-y-problema.md](docs/contexto-y-problema.md). Ecosistema y modelo de datos: [docs/ecosistema-rappi.md](docs/ecosistema-rappi.md). **Diseño del RAG, el agente y el panel:** [docs/diseno-ia.md](docs/diseno-ia.md) (grafo: [docs/diagramas/arquitectura-ia.html](docs/diagramas/arquitectura-ia.html)).

## Componentes

| Carpeta | Qué es | Estado |
|---|---|---|
| [`rappi-scraper/`](rappi-scraper/) | Scraper de páginas públicas de rappi.cl → Postgres + pgvector (catálogo, menús, precios con historial, documentos de búsqueda por vertical) | Listo; descarga completa en curso |
| [`prototipo-app/`](prototipo-app/) | Prototipo navegable de la app (Vite + React): réplica de las pantallas, modo demo Rappi hoy / Propuesta, asistente Bigotes con recomendaciones entre verticales, checkout y menús reales del scraper. `npm install && npm run dev` | Listo para demo |

Próximas piezas (carpetas hermanas, por etapas según [docs/diseno-ia.md](docs/diseno-ia.md#7-etapas)): `rappi-ia/` (conceptos, embeddings, búsqueda híbrida, agente Bigotes y analítica) y `dashboard-empresa/` (panel para la empresa).

## Dónde están los datos

- **Base de datos:** Postgres 17 local (Homebrew), base `rappi`. No vive en esta carpeta: `/opt/homebrew/var/postgresql@17`.
- **Archivos:** `rappi-scraper/data/` (CSV del scraper original, exportaciones y muestras).

## Empezar

```bash
cd ~/Documents/LeRepo/Rappi/rappi-scraper
make status          # o: .venv/bin/rappi status
```

Instalación, comandos y modelo de datos: [rappi-scraper/README.md](rappi-scraper/README.md).
