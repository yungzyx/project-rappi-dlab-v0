# CLAUDE.md

Guía breve para asistentes de IA que trabajan en este repositorio.

rappi-dlab es un prototipo independiente (no afiliado a Rappi): baja el catálogo público de Rappi Chile por vertical a Postgres + pgvector, con búsqueda híbrida evaluada, el agente Mochi (recomendaciones entre verticales) y el prototipo final de la app (Mochi en la Home, buscador con Mochi, pasaporte y juego de verticales). El panel de negocio (`dashboard-empresa/`, datos simulados) queda como herramienta para más adelante, fuera de la propuesta. El historial completo (modos anteriores, presentación) está en el repo `rappi-evolucion-proyecto`.

Documentación: índice en [docs/README.md](docs/README.md) · cifras en [README.md#resultados](README.md#resultados) · decisiones en [docs/decisiones.md](docs/decisiones.md) · instalación y operación en [docs/instalacion.md](docs/instalacion.md).

## Convenciones

- La mascota y asistente se llama **Mochi** (antes, Bigotes), pero el código usa nombres neutros (`RappiAgent`, `/agent/ask`, `AgentMessage`, clases `agent-*`) porque el nombre puede cambiar. El nombre visible vive en un solo lugar por lado: en `rappi-ia`, `config.AGENT_NAME` (variable de entorno `AGENT_NAME`, por defecto «Mochi»); en la app, `prototipo-app/src/agent/name.js`. El agente responde por texto y el prototipo lo usa como buscador y con ofertas. Los documentos fechados todavía dicen Bigotes.

- Código (funciones, módulos, variables) en inglés; todo lo que ve el usuario (logs, CLI, docs, columnas) en español.
- `make test` y `make lint` (en rappi-scraper/ y rappi-ia/) y `npm test` y `npm run lint` (en prototipo-app/ y dashboard-empresa/) antes de dar algo por terminado. Tests de integración contra `rappi_test` (scraper) y `rappi_ia_test` (rappi-ia), para que no se pisen.
- Las migraciones de la base (también las de conceptos, embeddings y eventos) viven en `rappi-scraper/src/rappi_scraper/storage/migrations/`: un solo historial. `make mvp`, `make serve` y `make serve-lan` se niegan a migrar la base `rappi` desde una rama sin fusionar (`rappi-ia check-migrations`; `MIGRATE=1` lo fuerza, o se prueba en una copia como `rappi_staging`).
- `rappi-ia` carga su `.env` antes que el de `rappi-scraper` (ver `rappi_ia/__init__.py`); sus tests se niegan a borrar otra base que no sea `rappi_ia_test`.
- Servidores de demo: `make mvp` en la raíz levanta los tres sobre la base `rappi` (`LAN=1` abre la API y la app a la red local, para el iPhone; el panel pide sus datos a `localhost:8000`, así que solo sirve en este equipo): API `:8000` (`make serve` en rappi-ia, solo local; `make serve-lan` la abre a la red y macOS pide permiso de red la primera vez), prototipo `:5174`, panel `:5175`. El prototipo busca la API en su mismo host; el panel usa `localhost:8000`. Ambos apuntan a otra API con `.env.local` (`VITE_API_URL`). El prototipo no abre sin la API («Sin conexión con Mochi»).
- `make mvp-check` (raíz) siembra el catálogo de prueba inventado en `rappi_ia_test` (`rappi-ia seed-demo`, solo bases `_test`), levanta una API liviana en `:8010` y la app en `:5184`, y la recorre con Chrome (la Home, una compra en el Súper de prueba con su pedido en la base y la caída de la API). Borra `rappi_ia_test`: no correrlo junto con `make test` de rappi-ia.
- Contrato API-app: las respuestas de ejemplo de `prototipo-app/src/api/fixtures/` las escribe el backend (`make contract` en rappi-ia); el CI falla si quedan desactualizadas.
- Datos de usuarios: solo `source = 'synthetic'` (generador con semilla) o `'prototype'`. Nunca presentar métricas simuladas como evidencia.
- `build_search_documents` borra de `search_documents` todo lo que no regenera: los datos derivados (conceptos, caché de embeddings, imágenes) van en tablas propias.
- Mover la carpeta del proyecto rompe los `.venv` (rutas absolutas): recrearlos con `make install` en rappi-scraper y `make install install-ml` en rappi-ia. No moverla con un proceso del scraper corriendo.
- Capa de datos para otras herramientas (atributos, medidas, marcas, grafo, segmentos): código en `rappi-ia/src/rappi_ia/layers/`, reglas en TOML junto a `taxonomy.toml`, vistas estables en el esquema `capa` (migraciones 022 a 026); `make layers` la recalcula y [docs/capa-de-datos.md](docs/capa-de-datos.md) la explica. Cada vista y columna de `capa` lleva comentario en español.
- Los datos descargados no se suben a git (`rappi-scraper/data/` está ignorado).
- Diagramas: las fuentes JSON están en `docs/diagramas-fuente/`; el HTML y su PNG se regeneran con la skill Archify.
- `Proyecto/` (ignorada) es un intento antiguo con LangChain: no usarlo ni moverlo al repo.
- Nunca dos descargas a la vez contra rappi.cl: los comandos que descargan comparten el candado `rappi-scraper/data/scraper.lock` (`flock`). La tarea semanal (`make schedule`) se programa en un solo equipo.
- Búsqueda por texto: la columna `tsv` (`to_tsvector('spanish', …)`, la de `rappi search`) ignora tildes normales (café = cafe) y mantiene ñ y ü a propósito (año ≠ ano); la búsqueda léxica de rappi-ia usa `tsv_unaccent`, que también quita la ñ ("panales" encuentra "pañales").
