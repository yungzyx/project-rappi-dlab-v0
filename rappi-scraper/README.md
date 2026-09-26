# rappi-scraper

Extrae el contenido de Rappi Chile (productos, menús, tiendas y precios) de **todos los verticales** y lo guarda en **Postgres + pgvector**, listo para análisis con SQL y, más adelante, para un RAG con embeddings.

Usa solo **páginas públicas** de rappi.cl (el JSON `__NEXT_DATA__` de Next.js), no usa la API interna y respeta `robots.txt`.

## Instalación

Requiere macOS con Homebrew y Python ≥ 3.12.

```bash
cd ~/Documents/LeRepo/Rappi/rappi-scraper
make db        # Postgres 17 + pgvector, bases `rappi` y `rappi_test`
make install   # .venv + proyecto en modo editable + herramientas de desarrollo; crea .env
make migrate   # aplica el esquema
```

Con esto quedan disponibles dos comandos: `rappi` (base de datos por vertical) y `rappi-csv` (scraper original a CSV). También se pueden llamar como `.venv/bin/rappi` o `.venv/bin/python -m rappi_scraper`.

## Uso

**Verticales:** `supermercado`, `conveniencia`, `turbo`, `mall` (subverticales: tecnología, belleza, hogar…), `farmacia`, `licores`, `chocolateria`, `restaurantes`.

```bash
rappi discover                          # 1. qué tiendas hay por vertical (todas las ciudades) y qué restaurantes; crea la cola
rappi scrape-stores --vertical mall     # 2. descarga tiendas (una sucursal por marca/formato); se puede por vertical
rappi scrape-stores                     #    …o todas las pendientes
rappi scrape-restaurants                # 3. una sucursal por cadena + independientes
rappi build-search                      # 4. documentos de búsqueda por vertical
rappi search "pañales" --vertical supermercado
rappi status                            # avance de las corridas y resumen por vertical
rappi report                            # reporte de calidad de la última corrida
rappi retry-failed --kind stores        # reencola los jobs fallidos
rappi import-csv                        # carga los CSV de rappi-csv como corrida histórica
rappi export-csv                        # catálogo por vertical -> data/exports/
```

- **Reanudable:** cada corrida es una cola de jobs en la base. Si se corta (Ctrl+C, error, apagón), vuelve a ejecutar el mismo comando y sigue con lo pendiente. Para una corrida nueva (nueva foto de precios): `rappi discover --new-run`.
- **Historial:** cada corrida agrega un snapshot de precios; el catálogo no se duplica.
- **No correr dos descargas en paralelo:** la carga doble provoca respuestas erróneas de Rappi.
- **Ritmo:** 1,5–3 s entre requests. Se ajusta con `RAPPI_DELAY_MIN` / `RAPPI_DELAY_MAX` en `.env` (ver `.env.example`).

## Correr una descarga larga

```bash
.venv/bin/rappi scrape-stores          # ~1 día; luego: .venv/bin/rappi scrape-restaurants (~4 h)
```

- **Sin supervisión:** el Mac no se duerme mientras corre (`caffeinate` automático) y todo queda en `data/logs/<comando>_<fecha>.log`. Se puede cerrar la ventana de este chat; no cierres la terminal.
- **Progreso:** cada línea muestra `[i/N · transcurrido · faltan ~X]`.
- **Errores transitorios:** los jobs que fallan se reintentan una vez automáticamente al final.
- **Ctrl+C:** detiene sin perder nada; se retoma con el mismo comando.
- **Reporte:** al terminar se imprime y se guarda en `data/reports/run_<id>_<tipo>.md` (y en `scrape_runs.report`): jobs por estado, errores frecuentes, productos por vertical y validaciones de calidad. Un `⚠` indica un posible cambio en el sitio de Rappi o un bloqueo.
- **Reintentar a mano:** `rappi retry-failed --kind stores` (o `restaurants`) y volver a correr el comando.
- **Ver el reporte de nuevo:** `rappi report` (o `rappi report --run N`).

## Estructura

```
rappi-scraper/
├── pyproject.toml              dependencias, comandos `rappi`/`rappi-csv`, config de pytest y ruff
├── Makefile                    make install / db / migrate / test / lint / format / status
├── src/rappi_scraper/
│   ├── cli.py                  comandos de `rappi`
│   ├── config.py               URLs, ritmo de requests (configurable por entorno) y rutas
│   ├── pricing.py              cálculo de descuentos
│   ├── scraping/               todo lo que habla con rappi.cl
│   │   ├── client.py             HTTP con pausas, reintentos y ubicación de despacho
│   │   ├── next_data.py          lectura del JSON __NEXT_DATA__
│   │   ├── store_parser.py       tienda, pasillos, sub-pasillos y productos
│   │   ├── listing_parser.py     listados por vertical y cadenas de restaurantes
│   │   ├── restaurant_parser.py  restaurante y menú
│   │   └── store_metadata.py     listado público de tiendas (S3) con coordenadas
│   ├── pipeline/               orquestación de las corridas
│   │   ├── discover.py           qué descargar (crea la cola de jobs)
│   │   ├── stores.py             descarga de tiendas
│   │   └── restaurants.py        descarga de restaurantes
│   ├── storage/                Postgres
│   │   ├── db.py                 conexión y migraciones
│   │   ├── repository.py         escrituras idempotentes y consultas de estado
│   │   ├── search.py             documentos y búsqueda por vertical
│   │   └── migrations/           esquema SQL versionado
│   └── legacy/                 scraper original a CSV
│       ├── csv_scraper.py        comando `rappi-csv`
│       ├── csv_format.py         columnas y escritura de CSV
│       └── csv_io.py             importar CSV a la base / exportar catálogo
├── tests/
│   ├── unit/                   sin red ni base de datos
│   ├── integration/            contra la base `rappi_test`
│   └── fixtures/               páginas reales de rappi.cl guardadas
└── data/
    ├── supermercados_csv/      salida de `rappi-csv`
    ├── exports/                salida de `rappi export-csv`
    └── muestras/               CSV de muestra
```

## Modelo de datos

| Tabla / vista | Qué tiene |
|---|---|
| `catalog_items` | **Contenido único** (un `master_product_id` = un producto en todo Rappi) |
| `store_products` + `price_snapshots` | El producto en cada tienda y su precio en cada corrida |
| `stores`, `brands`, `store_verticals` | Tiendas, marcas y en qué verticales aparece cada una (N:M) |
| `aisles`, `categories` | Pasillos por tienda y categorías globales de Rappi |
| `restaurant_details`, `cuisines`, `menu_sections`, `menu_items`, `menu_price_snapshots` | Restaurantes y menús |
| `search_documents` | Texto para búsqueda, **particionado por vertical**, con columna `embedding` lista para cuando se elija modelo |
| `scrape_runs`, `scrape_jobs` | Corridas y cola de trabajo (permite reanudar) |
| `v_vertical_summary` | Tiendas, productos, marcas, categorías y platos por vertical |
| `v_item_verticals`, `v_cross_vertical_items` | En qué verticales está cada producto / productos en más de un vertical |
| `v_price_compare`, `v_price_changes` | Mismo producto entre cadenas / cambios de precio entre corridas |
| `v_coverage` | Productos declarados vs obtenidos por sub-pasillo |

**Aislamiento por vertical:** las búsquedas siempre llevan `vertical` y cada vertical es su propia partición, así que un índice vectorial nunca mezcla verticales. Los análisis cruzados se hacen sobre las tablas núcleo.

**Embeddings (pendiente):** `search_documents.content` no incluye precios (un cambio de precio no obliga a regenerar el embedding) y `content_hash` invalida el embedding solo si cambia el texto. Al elegir modelo se llena `embedding`/`embedding_model` y se crea un índice HNSW por partición (ver `storage/migrations/003_search.sql`).

## Scraper original a CSV (`rappi-csv`)

Supermercados por cadena y ciudad, sin base de datos. Escribe en `data/supermercados_csv/`.

```bash
rappi-csv --list-chains                                                 # cadenas disponibles
rappi-csv --chains lider --cities santiago --max-stores 1 --max-aisles 2  # prueba rápida (~1 min)
rappi-csv                                                               # Lider y Unimarc, todas las ciudades
```

Columnas: `fecha_scraping, cadena, ciudad, store_id, tienda, direccion, pasillo, sub_pasillo, sku, master_product_id, ean, nombre, marca, descripcion, presentacion, cantidad, unidad, tipo_venta, precio, precio_normal, descuento_pct, tiene_descuento, precio_por_unidad, categoria, en_stock, imagen_url`.

## Desarrollo

```bash
make test         # todos los tests (unitarios + integración contra rappi_test)
make test-unit    # solo unitarios, sin base de datos
make lint         # ruff: errores comunes + formato
make format       # aplica el formato
```

Convención: el código (funciones, variables, módulos) va en inglés; lo que ve el usuario (logs, CLI, columnas de CSV, valores de verticales) en español.

## Limitaciones

- **Cobertura parcial en tiendas:** las páginas públicas muestran como máximo 24 productos por sub-pasillo (el resto lo carga el navegador desde la API interna). En las pruebas: 8–58% de lo que declara cada tienda. Los restaurantes sí traen el menú completo.
- **`ean` casi siempre vacío:** Rappi no lo publica. Para comparar el mismo producto entre cadenas se usa `master_product_id`.
- **Jumbo y Tottus:** en septiembre de 2026 sus sucursales redirigían (inactivas en Rappi).
- **Cambios de Rappi:** si cambia su frontend hay que ajustar `scraping/*_parser.py`. Los tests usan páginas reales guardadas en `tests/fixtures/`: si fallan con páginas nuevas, la estructura cambió.

## Uso responsable

Los términos de uso de Rappi probablemente restringen la extracción automatizada. Úsalo para análisis interno, a bajo ritmo, y no redistribuyas los datos.
