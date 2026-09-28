# Rappi Chile

Proyecto para entender qué contenido hay en cada vertical de Rappi Chile (supermercados, conveniencia, Turbo, Rappi Mall, farmacias, licores, chocolaterías y restaurantes) y usarlo para análisis, cruce de información y, más adelante, un RAG / búsqueda semántica para un agente LLM.

**El problema:** hoy en Rappi lo que un usuario hace en un vertical no cambia lo que se le recomienda en los otros; cada vertical es un silo.

**Principio de diseño:** *buscar dentro del vertical, entender al usuario a través de los verticales*. Los índices de búsqueda siguen aislados por vertical (precisión), pero los intereses del usuario se guardan como **conceptos** comunes a todos los verticales. Las recomendaciones cruzadas van de concepto a complemento y de ahí a la búsqueda en el otro vertical.

**Por qué existe este proyecto:** ver [docs/contexto-y-problema.md](docs/contexto-y-problema.md). Ecosistema y modelo de datos: [docs/ecosistema-rappi.md](docs/ecosistema-rappi.md). **Diseño del RAG, el agente y el panel:** [docs/diseno-ia.md](docs/diseno-ia.md) (grafo: [docs/diagramas/arquitectura-ia.html](docs/diagramas/arquitectura-ia.html)).

## Componentes

```text
rappi.cl ──► rappi-scraper ──► Postgres + pgvector ◄── rappi-ia (conceptos, embeddings, búsqueda, Bigotes, métricas)
                                                          │  API :8000
                                     prototipo-app ◄──────┤  (chat, voz, foto, eventos)
                                  dashboard-empresa ◄─────┘  (tendencias, oportunidades, frecuencia, abandono)
```

| Carpeta | Qué es | Estado |
|---|---|---|
| [`rappi-scraper/`](rappi-scraper/) | Scraper de páginas públicas de rappi.cl → Postgres + pgvector (catálogo, menús, precios con historial, documentos de búsqueda por vertical) | Listo; primera descarga completa el 27-09-2026 |
| [`rappi-ia/`](rappi-ia/) | Capa 2 de conceptos, embeddings locales (e5, CLIP, Whisper), búsqueda híbrida por vertical, agente **Bigotes**, eventos y métricas, API FastAPI | Listo; se actualiza tras cada descarga (`make post-refresh`) |
| [`prototipo-app/`](prototipo-app/) | Prototipo navegable de la app (Vite + React): réplica de las pantallas, modo demo Rappi hoy / Propuesta, Bigotes con recomendaciones entre verticales. Con la API usa catálogo real, voz y foto; sin ella, reglas locales | Listo para demo |
| [`dashboard-empresa/`](dashboard-empresa/) | Panel para la empresa: oportunidades (demanda no satisfecha), tendencias, frecuencia, abandono, cruce entre verticales y salud del catálogo. Usuarios **simulados** marcados como tales | Listo para demo |

## Correr la demo completa

```bash
cd ~/Documents/LeRepo/Rappi/rappi-ia && make serve                # API en :8000 (la primera vez carga los modelos, ~30 s)
cd ~/Documents/LeRepo/Rappi/prototipo-app && npm run dev          # app en :5174
cd ~/Documents/LeRepo/Rappi/dashboard-empresa && npm run dev      # panel en :5175
```

Actualización semanal: en el Mac que la tenga programada (`make schedule` en `rappi-scraper/`), cada domingo descarga rappi.cl y después actualiza conceptos, embeddings, evaluación y datos simulados. Para una descarga lanzada a mano: `cd rappi-ia && ./scripts/despues-del-refresh.sh` espera a que termine y hace lo mismo.

## Dónde están los datos

- **Base de datos:** Postgres 17 local (Homebrew), base `rappi`. No es un archivo ni vive en esta carpeta (`/opt/homebrew/var/postgresql@17`). Cómo conectarse y consultas de ejemplo: [docs/sql/](docs/sql/).
- **Archivos:** `rappi-scraper/data/` (respaldos de la base, reportes de cada corrida, exportaciones CSV). Fuera de git.

## Instalación y operación

[docs/instalacion.md](docs/instalacion.md): requisitos, código, base de datos desde un respaldo, modelos, apps y la actualización semanal.

## Empezar

```bash
cd ~/Documents/LeRepo/Rappi/rappi-scraper
make status          # o: .venv/bin/rappi status
```

Instalación, comandos y modelo de datos: [rappi-scraper/README.md](rappi-scraper/README.md).
