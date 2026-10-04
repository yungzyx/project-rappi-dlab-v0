# rappi-scraper

Descarga el catálogo público de Rappi Chile de **todos los verticales** (productos, menús, tiendas y precios) y lo guarda en **Postgres + pgvector**. Con esa base arma los documentos de búsqueda por vertical que usa [`rappi-ia`](../rappi-ia/) para la búsqueda híbrida y el asistente Bigotes.

**Fuentes:** solo páginas públicas de rappi.cl (el JSON `__NEXT_DATA__` que trae cada página), los sitemaps públicos de restaurantes y el JSON público de metadatos de tiendas. No usa APIs internas ni login. Ver [Uso responsable](#uso-responsable).

![Flujo del scraper: descubrir, descargar, guardar y armar la búsqueda](../docs/diagramas/scraper-flujo.png)

Versión interactiva: [scraper-flujo.html](../docs/diagramas/scraper-flujo.html) (descargar y abrir en el navegador).

## Instalación

Requiere macOS con Homebrew y Python ≥ 3.12 (el Makefile prefiere `python3.13`). Desde la raíz del repositorio:

```bash
cd rappi-scraper
make db        # Postgres 17 + pgvector (Homebrew), bases `rappi` y `rappi_test`
make install   # .venv + proyecto en modo editable + herramientas de desarrollo; crea .env desde .env.example
make migrate   # aplica el esquema
```

Queda disponible el comando `rappi` con el entorno activado (`source .venv/bin/activate`); sin activarlo, `.venv/bin/rappi` o `.venv/bin/python -m rappi_scraper`. Para instalar en otro equipo o partir desde un respaldo de la base: [docs/instalacion.md](../docs/instalacion.md).

## Uso

**Verticales:** `supermercado`, `conveniencia`, `turbo`, `mall` (subverticales: tecnología, belleza, hogar…), `farmacia`, `licores`, `chocolateria`, `restaurantes`.

```bash
rappi discover                          # 1. qué tiendas hay por vertical (todas las ciudades) y qué restaurantes; crea la cola
rappi scrape-stores --vertical mall     # 2. descarga tiendas (una sucursal por marca/formato), por vertical
rappi scrape-stores                     #    …o todas las pendientes
rappi scrape-restaurants                # 3. una sucursal por cadena + independientes
rappi build-search                      # 4. documentos de búsqueda por vertical
rappi search "pañales" --vertical supermercado
rappi status                            # avance de las corridas y resumen por vertical
rappi report                            # reporte de calidad de la última corrida de tiendas (--kind restaurants)
rappi refresh                           # todo de una vez: tiendas, restaurantes, búsqueda, reportes y respaldo (--no-backup)
rappi backup                            # respaldo de la base en data/backups/ (conserva los últimos 4)
rappi retry-failed --kind stores        # reencola los jobs fallidos (o --kind restaurants)
rappi export-csv                        # catálogo por vertical -> data/exports/
rappi migrate                           # aplica migraciones pendientes (lo mismo que make migrate)
```

- **Reanudable:** cada corrida es una cola de jobs en la base. Si se corta (Ctrl+C, error, corte de luz), basta con volver a ejecutar el mismo comando: sigue con lo pendiente. Para una corrida nueva (nueva foto de precios): `rappi discover --new-run`.
- **Historial:** cada corrida agrega un snapshot de precios; el catálogo no se duplica.
- **Una descarga a la vez:** dos en paralelo duplicarían la carga sobre rappi.cl.
- **Ritmo:** pausa aleatoria de 1,5–3 s entre páginas. Se ajusta con `RAPPI_DELAY_MIN` / `RAPPI_DELAY_MAX` en `.env` (ver `.env.example`).

## Descarga completa

La primera descarga completa (24–27-09-2026) tomó **unos 3 días para las tiendas** (por las pausas entre páginas) y **unas 4 horas para los restaurantes**.

```bash
.venv/bin/rappi scrape-stores          # ~3 días
.venv/bin/rappi scrape-restaurants     # ~4 h
```

- **Sin supervisión:** el Mac no se duerme mientras corre (`caffeinate` automático) y todo queda en `data/logs/<comando>_<fecha>.log`. La terminal debe quedar abierta.
- **Progreso:** cada línea muestra `[i/N · transcurrido · faltan ~X]`.
- **Errores transitorios:** cada job fallido se reintenta una vez, automáticamente, al final de la corrida.
- **Ctrl+C:** detiene sin perder nada; se retoma con el mismo comando.
- **Posible bloqueo:** si 10 jobs seguidos fallan sin respuesta útil de rappi.cl (403, 429, red, página de desafío), la corrida se detiene: el reporte queda con la alerta ⛔ y la corrida abierta, para retomarla más tarde con el mismo comando (o en la próxima actualización semanal). `refresh` no sigue con restaurantes, búsqueda ni respaldo. Los jobs de la racha vuelven a la cola hasta su 4.º intento: si la misma racha se repite cada vez, es un error fijo de esos jobs (hay que revisarlo) y al 4.º intento quedan fallidos y la corrida sigue.
- **Reporte:** al terminar se imprime y se guarda en `data/reports/run_<id>_<tipo>.md` (y en `scrape_runs.report`): jobs por estado, errores frecuentes, productos por vertical, páginas omitidas y validaciones de calidad. Un `⚠` indica un posible cambio en el sitio o una respuesta anómala. Los jobs fallidos se cuentan sobre los intentados (hechos + fallidos), y los totales clave (ofertas; restaurantes y platos) se comparan con la última corrida terminada del mismo tipo: una caída de más del 25 % se marca.
- **Reintentar a mano:** `rappi retry-failed --kind stores` (o `restaurants`) y volver a correr el comando.
- **Ver el reporte de nuevo:** `rappi report` (o `rappi report --run N`).

Resultados de cada descarga y detalle por vertical en [README.md#resultados](../README.md#resultados).

## Páginas ilegibles y sucursales no disponibles

Una tienda se recorre así: portada → pasillos → sub-pasillos. Cuando algo falla a mitad del recorrido:

- **Página ilegible:** una página de pasillo o sub-pasillo que no se puede leer (error de red, página inexistente o página sin datos de catálogo) se omite y se cuenta en `paginas_omitidas` del resultado del job. La tienda queda hecha con el resto y el reporte suma las páginas omitidas.
- **Ningún pasillo legible:** si no se pudo leer ningún pasillo, la tienda falla (`ningún pasillo se pudo leer`) en vez de quedar "hecha" solo con la portada.
- **Sucursal que deja de despachar:** si un pasillo redirige al listado de tiendas, no se guarda un catálogo a medias: se prueba la siguiente sucursal de la misma marca (hasta 3). Lo mismo si redirige la portada de la sucursal.
- **Restaurante dado de baja:** si Rappi redirige a `restaurantNotFound`, el job queda omitido ("ya no existe en Rappi").
- **Mensajes de error útiles:** cuando llega una página sin datos de catálogo, el error dice qué página llegó en su lugar.

## Actualización semanal automática

`rappi refresh` hace la actualización completa: retoma la corrida abierta (o descubre una nueva), descarga tiendas y restaurantes, arma la búsqueda, deja los reportes y respalda la base en `data/backups/` (últimos 4).

- **Retomar:** si una actualización se cortó con las tiendas ya terminadas, retoma en los restaurantes sin volver a bajar tiendas. Con `--resume-only` solo retoma las corridas abiertas (las que reabrió `retry-failed`) y nunca empieza una nueva.
- **Respaldo:** se escribe a un `.part`, se valida con `pg_restore --list` y recién entonces rota. Si falla, se conservan los anteriores y la actualización sigue, pero `rappi refresh` termina con código 3 (la tarea semanal lo anota como «respaldo fallido» y corre igual la capa de IA).
- **Migraciones:** la tarea semanal aplica las pendientes (`rappi migrate`) antes de descargar, para que una migración que trajo un `git pull` no haga fallar la descarga al final.
- **Capa de IA:** la tarea semanal (`scripts/refresh-semanal.sh`) la corre los domingos a las 03:00 y, si la descarga terminó bien (aunque haya fallado el respaldo) y `../rappi-ia` está instalado, sigue con `make -C ../rappi-ia post-refresh` (purga, conceptos, embeddings, evaluación, datos simulados y otra purga).

```bash
make schedule          # instala la tarea en launchd (~/Library/LaunchAgents/cl.rappi.refresh.plist)
make schedule-status   # ¿está activa? ¿cómo terminaron las últimas semanas?
make unschedule        # quitarla
```

- **Mac dormido o apagado:** si está dormido a esa hora, corre al despertar; si está apagado, esa semana se salta.
- **Una sola a la vez:** los comandos que descargan (`discover`, `scrape-stores`, `scrape-restaurants`, `refresh`) y `rappi-ia embed-images` toman el mismo candado de archivo (`data/scraper.lock`, con `flock`: el sistema lo suelta aunque el proceso muera) y se niegan a empezar si otra descarga lo tiene. Además, un candado (`data/refresh-semanal.pid`) impide que corran dos actualizaciones semanales; se borra aunque la tarea se corte con Ctrl+C o una señal. Si hay otra descarga (`discover`, `scrape-*`, `refresh`), un `make post-refresh` o `embed-images` en curso, la tarea se omite y lo anota.
- **Ubicación del proyecto:** debe estar fuera de Documentos, Escritorio y Descargas: macOS no deja que launchd lea esas carpetas (detalle en [docs/instalacion.md](../docs/instalacion.md)).
- **Logs:** cada ejecución deja una línea en `data/logs/ultimo-estado.txt` (`exit=N`, «omitida», «interrumpida» o «respaldo fallido»), que muestra `make schedule-status` junto con el respaldo más nuevo; la salida de launchd queda en `data/logs/launchd.*.log`, y el log detallado y el reporte, como en cualquier corrida.
- Programarla en **un solo** equipo.

## Objetivos del Makefile

`make help` los lista con su descripción.

| Objetivo | Qué hace |
|---|---|
| `make install` | Crea `.venv` e instala el proyecto con dependencias de desarrollo; crea `.env` |
| `make db` | Instala y levanta Postgres 17 + pgvector (Homebrew) y crea `rappi` y `rappi_test` |
| `make migrate` | Aplica migraciones pendientes |
| `make test` | Todos los tests (unitarios + integración contra `rappi_test`) |
| `make test-unit` | Solo unitarios, sin base de datos |
| `make test-integration` | Solo integración, contra `rappi_test` |
| `make lint` | ruff: errores comunes + formato |
| `make format` | Aplica el formato |
| `make status` | Estado de las corridas y resumen por vertical |
| `make report` | Reporte de calidad de la última corrida de tiendas |
| `make refresh` | Actualización completa (`rappi refresh`) |
| `make backup` | Respaldo de la base en `data/backups/` |
| `make schedule` | Programa la tarea semanal (launchd, domingos 03:00) |
| `make schedule-status` | Muestra si la tarea semanal está activa y las últimas ejecuciones |
| `make unschedule` | Quita la tarea semanal |

## Estructura

```text
rappi-scraper/
├── pyproject.toml                dependencias, comandos `rappi`/`rappi-csv`, config de pytest y ruff
├── Makefile                      instalación, tests, operación y tarea semanal
├── .env.example                  conexión a Postgres y ritmo de requests
├── scripts/
│   ├── refresh-semanal.sh          tarea semanal: `rappi refresh` y luego la capa de IA
│   └── launchd/
│       └── cl.rappi.refresh.plist.template   plantilla de launchd (domingos 03:00)
├── src/rappi_scraper/
│   ├── __main__.py               `python -m rappi_scraper`
│   ├── cli.py                    comandos de `rappi`
│   ├── config.py                 URLs, ritmo de peticiones (configurable por entorno) y rutas
│   ├── keep_awake.py             evita que el Mac se duerma durante una corrida (`caffeinate`)
│   ├── lock.py                   candado de «una descarga a la vez» (`flock` sobre `data/scraper.lock`)
│   ├── pricing.py                cálculo de descuentos
│   ├── reporting.py              reporte de cada corrida: conteos, errores frecuentes y validaciones de calidad
│   ├── scraping/                 todo lo que habla con rappi.cl
│   │   ├── client.py               HTTP con pausas, reintentos y ubicación de despacho
│   │   ├── next_data.py            lectura del JSON __NEXT_DATA__
│   │   ├── store_parser.py         tienda, pasillos, sub-pasillos y productos
│   │   ├── listing_parser.py       listados por vertical y cadenas de restaurantes
│   │   ├── restaurant_parser.py    restaurante y menú
│   │   └── store_metadata.py       JSON público de metadatos de tiendas, con coordenadas
│   ├── pipeline/                 orquestación de las corridas
│   │   ├── discover.py             qué descargar (crea la cola de jobs)
│   │   ├── queue.py                procesa la cola: progreso, aislamiento de errores y una pasada de reintento
│   │   ├── progress.py             `[i/N · transcurrido · faltan ~X]`
│   │   ├── stores.py               descarga de tiendas (páginas ilegibles, cambio de sucursal)
│   │   ├── restaurants.py          descarga de restaurantes
│   │   └── refresh.py              actualización completa: tiendas → restaurantes → búsqueda → reportes → respaldo
│   ├── storage/                  Postgres
│   │   ├── db.py                   conexión y migraciones
│   │   ├── repository.py           escrituras idempotentes y consultas de estado
│   │   ├── search.py               documentos y búsqueda por vertical
│   │   ├── backup.py               respaldo con pg_dump, validación y rotación
│   │   └── migrations/             esquema SQL versionado (001–008 y 014–015 del scraper; 009–013 de rappi-ia)
│   └── legacy/                   scraper original a CSV (ver Legado)
│       ├── csv_scraper.py          comando `rappi-csv`
│       ├── csv_format.py           columnas y escritura de CSV
│       └── csv_io.py               importar CSV a la base / exportar catálogo
├── tests/
│   ├── unit/                     sin red ni base de datos
│   ├── integration/              contra la base `rappi_test`
│   └── fixtures/                 páginas reales de rappi.cl guardadas
└── data/                         fuera de git
    ├── exports/                    salida de `rappi export-csv`
    ├── reports/, logs/             reportes y logs de cada corrida
    ├── backups/                    respaldos de la base (`rappi backup` / `refresh`)
    └── supermercados_csv/          salida de `rappi-csv` (legado)
```

## Modelo de datos

| Tabla / vista | Qué tiene |
|---|---|
| `catalog_items` | **Contenido único** (un `master_product_id` = un producto en todo Rappi) |
| `store_products` + `price_snapshots` | El producto en cada tienda y su precio en cada corrida |
| `stores`, `brands`, `store_verticals` | Tiendas, marcas y en qué verticales aparece cada una (N:M) |
| `aisles`, `categories` | Pasillos por tienda y categorías globales de Rappi |
| `restaurant_details`, `cuisines`, `menu_sections`, `menu_items`, `menu_price_snapshots` | Restaurantes y menús |
| `search_documents` | Texto para búsqueda, **particionado por vertical**, con su `embedding` (lo llena `rappi-ia`) |
| `scrape_runs`, `scrape_jobs` | Corridas y cola de trabajo (permite reanudar) |
| `v_vertical_summary` | Tiendas, productos, marcas, categorías y platos por vertical |
| `v_item_verticals`, `v_cross_vertical_items` | En qué verticales está cada producto / productos en más de un vertical |
| `v_price_compare`, `v_price_changes` | Mismo producto entre cadenas / cambios de precio entre corridas |
| `v_coverage` | Productos declarados vs obtenidos por sub-pasillo |
| `v_store_format_runs` | Última corrida que bajó el formato de cada tienda (qué ofertas están vigentes) |

Consultas de ejemplo y cómo conectarse: [docs/sql/](../docs/sql/).

**Aislamiento por vertical:** las búsquedas siempre llevan `vertical` y cada vertical es su propia partición, así que un índice vectorial nunca mezcla verticales. Los análisis cruzados se hacen sobre las tablas núcleo.

**Vigencia:** `search_documents` usa solo lo vigente. Una oferta o un plato cuenta si su último precio es de la última corrida que bajó su formato (`store_type`) o su cadena (`brand_id`); así salen las sucursales viejas y lo que ya no se vende. Un plato también sale si una corrida posterior ya no encontró su local o su cadena. Un formato que la última corrida no pudo bajar conserva su último dato. La corrida de cada formato sale de `v_store_format_runs`, que también usa `rappi-ia` para el precio que muestra Bigotes: el tope de precio y el precio mostrado salen de las mismas sucursales. Las tablas núcleo y las demás vistas `v_*` guardan todo el historial.

**Embeddings:** `search_documents.content` no incluye precios (un cambio de precio no obliga a regenerar el embedding) y `content_hash` invalida el embedding solo si cambia el texto. El modelo es `intfloat/multilingual-e5-base` (768 dimensiones): `rappi-ia` llena `embedding`/`embedding_model` y crea un índice HNSW por partición con `embedding::vector(768)`. El ejemplo con `vector(1536)` de `003_search.sql` es anterior a la elección del modelo. Diseño completo en [docs/diseno-ia.md](../docs/diseno-ia.md).

## Desarrollo

```bash
make test         # todos los tests (unitarios + integración contra rappi_test)
make test-unit    # solo unitarios, sin base de datos
make lint         # ruff: errores comunes + formato
make format       # aplica el formato
```

- **Tests:** 104 (pytest, 30-09-2026). Los de integración usan la base `rappi_test`, nunca `rappi`.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) corre lint y tests contra Postgres + pgvector.
- **Convención:** el código (funciones, variables, módulos) va en inglés; lo que ve el usuario (logs, CLI, columnas de CSV, valores de verticales) en español.

## Limitaciones

- **Cobertura parcial en tiendas:** las páginas públicas muestran como máximo 24 productos por sub-pasillo (el resto lo carga el navegador por otra vía). La cobertura real (obtenidos vs declarados) se ve en `v_coverage` y en la pestaña Catálogo del [panel](../dashboard-empresa/). Los restaurantes sí traen el menú completo.
- **`ean` casi siempre vacío:** Rappi no lo publica. Para comparar el mismo producto entre cadenas se usa `master_product_id`.
- **Jumbo y Tottus:** en septiembre de 2026 sus sucursales redirigían (inactivas en Rappi).
- **Cambios en el sitio:** si cambia el frontend de rappi.cl hay que ajustar `scraping/*_parser.py`. Los tests usan páginas reales guardadas en `tests/fixtures/`: si los tests pasan pero el scraper falla con las páginas actuales, la estructura cambió; guarda una página nueva y los tests muestran qué.

## Uso responsable

- Solo páginas públicas sin barreras técnicas, sitemaps públicos y el JSON público de metadatos de tiendas. Sin APIs internas, sin login y sin evasión de protecciones.
- Una descarga a la vez, con pausas de 1,5–3 s entre páginas, y actualización semanal.
- Sin datos personales: catálogo, precios y datos públicos de tiendas y restaurantes.
- Fines de investigación y demostración. Un uso comercial requeriría autorización de Rappi. Los datos descargados no se suben al repositorio.
- Proyecto independiente: no está afiliado a Rappi ni cuenta con su respaldo. Las marcas y el contenido pertenecen a Rappi y a los comercios.

Detalle en [README.md#uso-responsable-de-los-datos](../README.md#uso-responsable-de-los-datos).

## Legado: scraper original a CSV (`rappi-csv`)

Primera versión del proyecto, anterior a la base de datos: supermercados por cadena y ciudad, escritos en `data/supermercados_csv/`. Se conserva como referencia; el flujo actual es `rappi`.

```bash
rappi-csv --list-chains                                                   # cadenas disponibles
rappi-csv --chains lider --cities santiago --max-stores 1 --max-aisles 2  # prueba rápida (~1 min)
rappi-csv                                                                 # Lider y Unimarc, todas las ciudades
rappi import-csv                                                          # carga esos CSV en la base como corrida histórica
```

Columnas: `fecha_scraping, cadena, ciudad, store_id, tienda, direccion, pasillo, sub_pasillo, sku, master_product_id, ean, nombre, marca, descripcion, presentacion, cantidad, unidad, tipo_venta, precio, precio_normal, descuento_pct, tiene_descuento, precio_por_unidad, categoria, en_stock, imagen_url`.

`rappi import-csv` guarda los precios con su `fecha_scraping` (así no pasan por más nuevos que una descarga posterior) y busca el id de `categoria` entre las categorías que ya vio una descarga; si no la encuentra, el producto queda sin categoría.

Código en `src/rappi_scraper/legacy/`.
