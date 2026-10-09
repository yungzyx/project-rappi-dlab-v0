# CLAUDE.md

Guía breve para asistentes de IA que trabajan en este repositorio.

rappi-dlab es un prototipo independiente (no afiliado a Rappi): baja el catálogo público de Rappi Chile por vertical a Postgres + pgvector, con búsqueda híbrida evaluada, el agente Bigotes (recomendaciones entre verticales) y el prototipo final de la app (Bigotes en la Home, buscador con Bigotes, pasaporte y juego de verticales). El historial completo (panel de negocio, modos anteriores) está en el repo `rappi-evolucion-proyecto`.

Documentación: índice en [docs/README.md](docs/README.md) · cifras en [README.md#resultados](README.md#resultados) · decisiones en [docs/decisiones.md](docs/decisiones.md) · instalación y operación en [docs/instalacion.md](docs/instalacion.md).

## Convenciones

- Código (funciones, módulos, variables) en inglés; todo lo que ve el usuario (logs, CLI, docs, columnas) en español.
- `make test` y `make lint` (en rappi-scraper/ y rappi-ia/) y `npm test` y `npm run lint` (en prototipo-app/) antes de dar algo por terminado. Tests de integración contra `rappi_test` (scraper) y `rappi_ia_test` (rappi-ia), para que no se pisen.
- Las migraciones de la base (también las de conceptos, embeddings y eventos) viven en `rappi-scraper/src/rappi_scraper/storage/migrations/`: un solo historial.
- `rappi-ia` carga su `.env` antes que el de `rappi-scraper` (ver `rappi_ia/__init__.py`); sus tests se niegan a borrar otra base que no sea `rappi_ia_test`.
- Servidores de demo: API `:8000` (`make serve`, solo local; `make serve-lan` la abre a la red y macOS pide permiso de red la primera vez), prototipo `:5174`. El prototipo busca la API en su mismo host; apunta a otra API con `.env.local` (`VITE_API_URL`).
- Datos de usuarios: solo `source = 'synthetic'` (generador con semilla) o `'prototype'`. Nunca presentar métricas simuladas como evidencia.
- `build_search_documents` borra de `search_documents` todo lo que no regenera: los datos derivados (conceptos, caché de embeddings, imágenes) van en tablas propias.
- Mover la carpeta del proyecto rompe los `.venv` (rutas absolutas): recrearlos con `make install` en rappi-scraper y `make install install-ml` en rappi-ia. No moverla con un proceso del scraper corriendo.
- Capa de datos para otras herramientas (atributos, medidas, marcas, grafo, segmentos): código en `rappi-ia/src/rappi_ia/layers/`, reglas en TOML junto a `taxonomy.toml`, vistas estables en el esquema `capa` (migraciones 022 a 026); `make layers` la recalcula y [docs/capa-de-datos.md](docs/capa-de-datos.md) la explica. Cada vista y columna de `capa` lleva comentario en español.
- Los datos descargados no se suben a git (`rappi-scraper/data/` está ignorado).
- Diagramas: las fuentes JSON están en `docs/diagramas-fuente/`; el HTML y su PNG se regeneran con la skill Archify.
- `Proyecto/` (ignorada) es un intento antiguo con LangChain: no usarlo ni moverlo al repo.
- Nunca dos descargas a la vez contra rappi.cl: los comandos que descargan y `make images` comparten el candado `rappi-scraper/data/scraper.lock` (`flock`). La tarea semanal (`make schedule`) se programa en un solo equipo.
- Búsqueda por texto: la columna `tsv` (`to_tsvector('spanish', …)`, la de `rappi search`) ignora tildes normales (café = cafe) y mantiene ñ y ü a propósito (año ≠ ano); la búsqueda léxica de rappi-ia usa `tsv_unaccent`, que también quita la ñ ("panales" encuentra "pañales").
