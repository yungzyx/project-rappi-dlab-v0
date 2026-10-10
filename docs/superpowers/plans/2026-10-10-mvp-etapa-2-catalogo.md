# MVP, etapa 2: catálogo real en la app (plan de implementación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada tienda, restaurante y producto que la app muestra en sus pantallas sale de Postgres a través de `/catalog`, con imagen y precio reales, y un pedido llega a `app_orders` con ids reales.

**Architecture:**
- **Backend:** un módulo de dominio `rappi_ia/catalog/` (consultas SQL de solo lectura) y un router `/catalog` en la API.
  - Los productos usan la misma forma que ya devuelve el agente (`Product.to_dict` de `agent/tools.py`), con dos campos nuevos.
- **App:**
  - Llama a la API con un hook `useApi`, que en las pantallas que bloquean muestra «Sin conexión» con «Reintentar».
  - Normaliza el producto de la API al formato del prototipo en un solo lugar (`toPrototypeProduct`).
  - La UI que no es catálogo (banners, accesos, textos) se queda.
- **Base:** no hay migraciones nuevas en esta etapa, así que `make mvp` funciona sobre la base real sin la guardia.

**Tech Stack:** Python 3.13 + FastAPI + psycopg (rappi-ia); React 19 + Vite + Vitest (prototipo-app); Playwright para `mvp-check`.

**Spec:** `docs/superpowers/specs/2026-10-10-mvp-integrado-design.md` (sección 3, «Catálogo»; sección 4, etapa 2)

## Global Constraints

- **Idioma:** código en inglés; todo lo que ve el usuario en español.
- **Precio:** sale siempre de SQL, nunca del embedding. Se muestra como texto CLP (`$1.990`, con `clp()` de `agent/tools.py`). Bajo `MIN_PRICE` (10) no hay precio.
- **Ofertas vigentes:** una oferta de un `catalog_item` está vigente si su último `price_snapshots` en esa tienda es de la corrida `format_run_id` de la tienda (`v_store_format_runs`) e `in_stock` no es `false`. Es la regla que ya aplican `_with_prices` (agent/tools.py) y `_OFFER_PRICES` (rappi_scraper/storage/search.py): reutilizarla, no inventar otra.
- **Ciudad fija para la demo:** Santiago. «Cerca de ti» mide la distancia a un punto fijo de Providencia (`MVP_HOME_LAT = -33.4263`, `MVP_HOME_LNG = -70.6106`, en `rappi_ia/config.py`, sobreescribibles por entorno).
- **Sin migraciones nuevas.** Solo lectura sobre lo que ya existe.
- **Datos de prueba inventados:** el catálogo de `seed-demo` crece (pasillos, imágenes, restaurantes con detalle, una baja de precio), y cada nombre sigue conteniendo «prueba».
- **Contrato:** cada endpoint nuevo tiene su respuesta de ejemplo en `prototipo-app/src/api/fixtures/`, escrita por `make contract`, y los tests de pantallas la usan con `stubApi`.
- **Guardias que se mantienen:**
  - La marca +18 de los productos con `age_restricted` se respeta en las tarjetas y en el carrito, como hoy.
  - Farmacia no se empuja desde la Home: no entra en «Cerca de ti» ni en las listas de la Home.
- **Tests verdes en cada tarea:**
  - en rappi-ia, `make test` y `make lint`;
  - en prototipo-app, `npm test` y `npm run lint`;
  - test que falla primero.

### Rulings de entrada (decididos por el controlador)

- **Forma del producto.** Se mantiene la de `Product.to_dict` (`id`, `entity_type`, `entity_id`, `name`, `vertical`, `concept`, `price`, `price_value`, `before`, `discount`, `store`, `img`, `age_restricted`) y se agregan `store_id` y `presentation`. La especificación pide los mismos datos con otros nombres; dos formas distintas serían peor.
- **La vertical en la app es la del prototipo.** `toPrototypeProduct` convierte el código del backend con `screenForBackend` y guarda el original en `backendVertical`; `orders.js` usa `backendVertical` cuando existe.
- **Una tienda se identifica por `store_id`.** En el listado de una vertical sale una tarjeta por formato (`store_type`): la sucursal descargada (la de `format_run_id`), con su logo `LOGO_BASE_URL + raw->>'image'`. Las sucursales solo descubiertas (sin productos) no se listan.
- **Restaurantes:** la base no guarda sus logos, así que la portada es la foto de un plato popular (como hacía `realMenus.js`).
- **Turbo:** muestra los pasillos de la tienda Turbo con más productos vigentes como pestañas.
- **Mascotas (`pet`)** no tiene vertical en el backend: sale de la navegación (atajo y pantalla).
- **El buscador sigue local hasta la etapa 3.** `/search` exige una vertical, y la búsqueda en todas las verticales con «sin resultado» es parte de la etapa 3 en la especificación. Por eso `data/catalog.js` se queda, con un comentario, solo para el buscador y el cerebro local de Mochi; la etapa 3 lo borra. Las categorías de una vertical abren el buscador con su nombre.
- **Abrir una tienda que no está en la base** (las tiendas locales que todavía usa Mochi hasta la etapa 3) muestra «Esta tienda no está en el catálogo», sin romperse.
- **Lo que no es catálogo pero apunta a una tienda falsa** (banners de restaurantes, «Volver a pedir», «Nuevos en Rappi», «Top pizzas») pierde el enlace o sale. Ninguna tienda ni producto que se pueda tocar puede ser falso.

## Review Focus

1. **Una tienda sin productos vigentes, o cerrada desde la última descarga,** no aparece en los listados. Abrirla por id da 404 y la app muestra «Esta tienda no está en el catálogo», no una pantalla rota. Tests en las tareas 2 y 5.
2. **Un producto sin imagen o sin nombre de tienda** no rompe la tarjeta. Hoy `StoreLogo` de `ProductCard.jsx` hace `item.store.charAt(0)`: usa la imagen de reemplazo y una inicial segura. Test en la tarea 4.
3. **Un pasillo con más de 24 productos:** «Ver más» trae la página siguiente sin repetir ni saltarse productos. Tests en las tareas 2 y 5.
4. **La API se cae con la app abierta y una pantalla de catálogo falla:** se ve «Sin conexión» con «Reintentar» dentro de esa pantalla, y el resto de la app sigue usable. Test en la tarea 4.
5. **Un producto agregado desde la API y otro igual agregado desde otra pantalla** caen en la misma línea del carrito (mismo `lineKey`: id y vertical del prototipo). El pedido manda `entity_id` real y la vertical del backend. Test en la tarea 4.

---

### Task 1: Contrato con cuerpo y estado, y `stubApi` más estricto

**Files:**
- Modify: `rappi-ia/tests/integration/test_contract.py`, `rappi-ia/Makefile` (`contract`)
- Modify: `prototipo-app/src/api/testing.js`, `prototipo-app/src/api/client.js`, `prototipo-app/src/api/client.test.js`

**Interfaces:**
- **Produces (backend):**
  - `@dataclass(frozen=True) class Example: name: str; method: str; path: str; body: dict | None = None; status: int = 200`.
  - `CONTRACT: tuple[Example, ...]`, con `Example("health", "GET", "/health")`.
  - El test compara el estado y el cuerpo. Con 204 no escribe archivo (el ejemplo es solo el estado).
  - Un test nuevo, `test_every_fixture_has_an_example`, falla si `prototipo-app/src/api/fixtures/` tiene un JSON sin su `Example`.
  - `make contract` falla con «Falta DATABASE_URL_TEST: `make contract` no puede escribir los ejemplos» si la variable no está, en vez de salir con 0 y todo saltado.
- **Produces (app):**
  - `stubApi(routes)`:
    - las claves son `'METHOD /ruta'` o `'/ruta'` (la ruta sin query string);
    - una clave que no calza con `^(GET|POST|PUT|DELETE) /|^/` lanza `Error('stubApi: clave inválida …')`;
    - un valor también puede ser `(req) => value` con `req = { method, path, query: URLSearchParams, body }`, o `{ slow: ms, body }`;
    - un estado 204 responde sin cuerpo.
  - `request()` devuelve `null` en un 204.
  - `checkConnection` exige `response.ok === true`; si no, da `{ ok: false, kind: 'offline' }`.

- [ ] **Step 1: Tests que fallan.**
  - Backend: `test_every_fixture_has_an_example`, con un `orphan.json` temporal en un directorio de prueba (parametrizar el directorio para no tocar el real).
  - App, en `client.test.js`:
    - `'stubApi distingue GET de POST en la misma ruta'`
    - `'stubApi entrega query y cuerpo a una función'`
    - `'una clave mal escrita en stubApi falla en vez de dar 404'`
    - `'un 204 es null, no un error'`
    - `'checkConnection exige ok: true en /health'`
- [ ] **Step 2: Correrlos.** Expected: FAIL.
- [ ] **Step 3: Implementar.** `health` pasa a ser `Example("health", "GET", "/health")`; `health.json` no cambia.
- [ ] **Step 4: Suites y lint en verde, y `make contract` sin cambios en `health.json`.**
- [ ] **Step 5: Commit:** `test: contrato con cuerpo y estado; stubApi distingue método, query y cuerpo`

### Task 2: Catálogo de tiendas y productos en la API

**Files:**
- Create: `rappi-ia/src/rappi_ia/catalog/__init__.py`, `rappi-ia/src/rappi_ia/catalog/stores.py`, `rappi-ia/src/rappi_ia/api/catalog.py` (router, incluido en `app.py`)
- Modify:
  - `rappi-ia/src/rappi_ia/agent/tools.py`: `Product` suma `store_id: int | None = None` y `presentation: str | None = None`, y `to_dict` los incluye;
  - `rappi-ia/src/rappi_ia/demo/seed.py`: pasillos y subpasillos, `raw` con `image`, `eta_value`, `lat`/`lng`, y un pasillo con 30 productos para paginar;
  - `rappi-ia/tests/integration/test_contract.py`: ejemplos nuevos.
- Test: `rappi-ia/tests/integration/test_catalog_stores.py`

**Interfaces:**
- **Produces:**
  - `vertical_stores(conn, vertical: str, limit: int = 30) -> list[dict]`. Cada tarjeta es `{id, name, logo, eta, products, vertical}`:
    - `name` es la marca o, si no hay, el nombre de la tienda;
    - `eta` es texto, por ejemplo «25 min», o `None`;
    - `products` es la cantidad de ofertas vigentes.
    - Ordena por `products` de mayor a menor. Excluye `restaurantes`.
  - `store_page(conn, store_id: int, aisle_id: int | None = None, page: int = 1, page_size: int = 24) -> dict | None`. Devuelve:
    - `store`: la tarjeta;
    - `aisles`: `[{id, name, products}]`, solo los pasillos con ofertas vigentes, en el orden de Rappi;
    - `aisle`: el pasillo elegido (el primero si no viene);
    - `products`: `[Product dict]`, con el precio de esa tienda y ordenados por nombre;
    - `page` y `has_more`.
    
    Devuelve `None` si la tienda no existe o no tiene ofertas vigentes.
  - `product_detail(conn, entity_type: str, entity_id: str) -> dict | None`: un `catalog_item` con su oferta vigente más barata, o un `menu_item` con su último precio.
  - **Endpoints:**
    - `GET /catalog/verticals/{v}/stores?limit=` acepta códigos del backend o del prototipo, con `backend_vertical()`;
    - `GET /catalog/stores/{id}?aisle=&page=`, con 404 y `{"detail": "Esta tienda no está en el catálogo"}`;
    - `GET /catalog/products/{entity_type}/{entity_id}`, con 404 si no existe.
  - **Ejemplos del contrato:** `catalog-vertical-stores` (supermercado), `catalog-store` (primera página), `catalog-store-page-2`, `catalog-product`.

- [ ] **Step 1: Tests que fallan** (contra `seed_demo`):
  - `test_vertical_stores_lists_one_card_per_format_with_current_offers`: una sucursal sin ofertas no aparece.
  - `test_store_page_prices_are_the_stores_own_and_current`: una oferta de otra corrida o con `in_stock = false` no aparece.
  - `test_store_page_paginates_without_repeating_or_skipping`: 30 productos en el pasillo dan 24 más 6, con `has_more` en `True` y después en `False`, y la unión de ambas páginas da los 30.
  - `test_unknown_or_empty_store_is_404_with_spanish_detail`
  - `test_product_detail_for_catalog_item_and_dish`
  - `test_catalog_endpoints_accept_prototype_vertical_ids`: `grocery` equivale a `supermercado`.
- [ ] **Step 2: Correrlos.** Expected: FAIL (no existe el módulo).
- [ ] **Step 3: Implementar.** Consultas parametrizadas y de solo lectura que reutilizan la regla de ofertas vigentes; `Product.to_dict` con los dos campos nuevos (los tests del agente no deben cambiar de resultado).
- [ ] **Step 4: Correr la suite, `make lint` y `make contract`.** Revisar los JSON nuevos.
- [ ] **Step 5: Medir contra la base real** (solo lectura; un script en el workspace, fuera del repo): tiempo de `vertical_stores('supermercado')` y de `store_page` en la tienda más grande. Meta: menos de 300 ms cada una. Si no se cumple, anotar el plan de consulta en el reporte.
- [ ] **Step 6: Commit:** `feat: /catalog de tiendas y productos con precios vigentes por tienda`

### Task 3: Restaurantes, ofertas y Home en la API

**Files:**
- Create: `rappi-ia/src/rappi_ia/catalog/restaurants.py`, `rappi-ia/src/rappi_ia/catalog/deals.py`, `rappi-ia/src/rappi_ia/catalog/home.py`
- Modify:
  - `rappi-ia/src/rappi_ia/api/catalog.py`;
  - `rappi-ia/src/rappi_ia/config.py` (`MVP_HOME_LAT`, `MVP_HOME_LNG`);
  - `rappi-ia/src/rappi_ia/demo/seed.py`: `restaurant_details` con `rating`, `eta` y `delivery_cost`; platos populares; una segunda corrida con una baja de precio; coordenadas;
  - `test_contract.py`.
- Test: `rappi-ia/tests/integration/test_catalog_restaurants_deals_home.py`

**Interfaces:**
- **Produces:**
  - `restaurants(conn, cuisine: str | None = None, sort: Literal['rating', 'eta', 'fee'] = 'rating', limit: int = 30) -> list[dict]`. Cada tarjeta es `{id, name, area, cover, rating, eta, fee, cuisines}`:
    - `name` y `area` salen de separar «X - Área», como `toRestaurant` de `realMenus.js`;
    - `cover` es la imagen de un plato popular, o de cualquier plato con imagen;
    - `fee` viene en CLP texto.
    - Solo entran restaurantes con al menos un plato con precio.
  - `restaurant_menu(conn, store_id: int) -> dict | None`: `{restaurant: tarjeta, sections: [{name, items: [Product dict]}]}`, en el orden de `menu_sections.position`. Los platos populares vienen primero en una sección «Lo más pedido».
  - `deals(conn, vertical: str | None = None, limit: int = 24) -> list[dict]`:
    - productos con oferta vigente cuyo precio actual es menor que el anterior (`v_price_changes`) o que tienen `discount_pct` mayor que 0;
    - cada uno trae `before` y `discount`;
    - ordena por descuento de mayor a menor;
    - sin vertical, excluye `farmacia`.
  - `home(conn) -> dict`:
    - `nearby_stores`: 6 tarjetas de tienda, las más cercanas al punto fijo, sin farmacia ni restaurantes;
    - `fast_restaurants`: 2 tarjetas, las de menor `eta`;
    - `low_fee_restaurants`: 6 tarjetas, las de menor `fee`.
  - **Endpoints:** `GET /catalog/restaurants?cuisine=&sort=&limit=`, `GET /catalog/restaurants/{id}/menu` (404 en español), `GET /catalog/deals?vertical=&limit=`, `GET /catalog/home`.
  - **Ejemplos del contrato:** `catalog-restaurants`, `catalog-menu`, `catalog-deals`, `catalog-home`.

- [ ] **Step 1: Tests que fallan.**
  - `test_restaurant_cover_is_a_dish_photo_and_name_splits_area`
  - `test_menu_lists_popular_first_then_sections_in_order`
  - `test_deals_only_include_real_price_drops_with_before_and_discount`
  - `test_deals_without_vertical_never_include_pharmacy`
  - `test_home_nearby_is_sorted_by_distance_and_skips_pharmacy`
  - `test_home_restaurant_lists_sort_by_eta_and_fee`
- [ ] **Step 2: Correrlos.** Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr la suite, `make lint`, `make contract` y la medición sobre la base real** (meta: menos de 300 ms; `deals` sin vertical puede llegar a 500 ms, y si pasa de eso, anotarlo).
- [ ] **Step 5: Commit:** `feat: /catalog de restaurantes, ofertas reales y Home`

### Task 4: La app lee el catálogo (cliente, hook y forma del producto)

**Files:**
- Create: `prototipo-app/src/api/catalog.js`, `prototipo-app/src/api/useApi.js`, `prototipo-app/src/components/OfflineNotice.jsx`, `prototipo-app/src/api/catalog.test.js`, `prototipo-app/src/api/useApi.test.jsx`
- Modify:
  - `prototipo-app/src/api/client.js` (`toPrototypeProduct`);
  - `prototipo-app/src/api/orders.js` (usa `backendVertical`);
  - `prototipo-app/src/components/ProductCard.jsx` (`StoreLogo` seguro);
  - sus tests.

**Interfaces:**
- **Consumes:** los ejemplos del contrato de las tareas 2 y 3, y `stubApi` y `fixture` de la tarea 1.
- **Produces:**
  - **`catalog.js`:**
    - `verticalStores(v)`, `store(id, { aisle, page })`, `product(entityType, id)`, `restaurants({ cuisine, sort, limit })`, `menu(id)`, `deals(vertical)` y `home()`;
    - cada una devuelve datos ya convertidos: productos con `toPrototypeProduct` y tiendas con `toPrototypeStore`;
    - `toPrototypeStore(card)` da `{ id, name, img, logo: true, eta, etaIcon: 'clock', vertical, rating?, fee?, deliveryLabel? }`, con `vertical` como id del prototipo.
  - **`toPrototypeProduct(p)`** suma:
    - `vertical: screenForBackend(p.vertical) ?? p.vertical` y `backendVertical: p.vertical`;
    - `storeId: p.store_id` y `size: p.presentation`;
    - `etaIcon: 'clock'`.
  - **`useApi(load, deps)`** devuelve `{ data, error, loading, retry }`. Ignora resultados de llamadas viejas cuando cambian las dependencias, y no hace `setState` después de desmontar.
  - **`<OfflineNotice onRetry />`:** «Sin conexión» con «Reintentar» dentro de una pantalla. Un 404 no es «Sin conexión»: cada pantalla muestra su mensaje.

- [ ] **Step 1: Tests que fallan.**
  - `'verticalStores convierte las tarjetas al formato del prototipo con la vertical del prototipo'`
  - `'un producto de la API cae en la misma línea del carrito que el mismo producto agregado desde otra pantalla'`: dos `toPrototypeProduct` del mismo dict dan el mismo `lineKey`.
  - `'el pedido manda la vertical del backend y el entity_id real'`: `buildOrders` con `backendVertical`.
  - `'useApi muestra el error y reintenta'`
  - `'useApi ignora una respuesta vieja cuando cambian las dependencias'`
  - `'OfflineNotice reintenta al tocar Reintentar'`
  - `'una tarjeta sin imagen ni nombre de tienda no se rompe'`: `ProductCard` con `store` en `undefined` y sin `img`.
- [ ] **Step 2: Correrlos.** Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr `npm test` y `npm run lint`.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: la app lee el catálogo de la API (cliente, useApi y forma del producto)`

### Task 5: Vertical, tienda, menú y detalle con datos reales

**Files:**
- Modify:
  - `prototipo-app/src/screens/vertical/VerticalScreen.jsx` y `data.js`: queda solo la UI; salen los productos, las tiendas y `pet`;
  - `prototipo-app/src/screens/store/StoreScreen.jsx` y `RealMenu.jsx`;
  - `prototipo-app/src/screens/list/*` (si hace falta);
  - `prototipo-app/src/components/ProductSheet.jsx` («Ver tienda» por `storeId`);
  - sus tests: `VerticalScreen.test.jsx`, `StoreScreen.test.jsx` y `branches.test.jsx`, reescritos con `stubApi` y los ejemplos.

**Interfaces:**
- **Consumes:** `verticalStores`, `deals`, `store`, `menu`, `useApi` y `OfflineNotice` (tarea 4).
- **Produces:**
  - **Vertical:** la UI de siempre (título, filas de categorías, banners) más dos secciones de la API: «Tiendas» (`verticalStores`) y «Bajaron de precio» (`deals(v)`), que se oculta si viene vacía.
    - Una categoría abre `push('search', { query: label })`.
    - «Ver más» de tiendas abre `list` con todas.
  - **Tienda:** `params.store.id` numérico. Si `vertical === 'restaurants'` usa `menu(id)`; si no, `store(id)`, con pestañas de pasillos y «Ver más» que suma la página siguiente.
    - Con un id no numérico o un 404, muestra «Esta tienda no está en el catálogo».
  - **Detalle:** «Ver tienda» abre `push('store', { store: { id: product.storeId, name: product.store, vertical: product.vertical } })`, y no aparece si no hay `storeId`.

- [ ] **Step 1: Tests que fallan.**
  - `'la vertical muestra las tiendas y las bajas de precio de la API'`
  - `'tocar una categoría abre el buscador con su nombre'`
  - `'la tienda muestra los pasillos y Ver más trae la página siguiente sin repetir'`
  - `'un restaurante muestra su menú con Lo más pedido primero'`
  - `'una tienda que no está en la base dice «Esta tienda no está en el catálogo»'`
  - `'sin API la tienda muestra Sin conexión y Reintentar la carga'`
  - `'Ver tienda del detalle abre la tienda del producto'`
- [ ] **Step 2: Correrlos.** Expected: FAIL.
- [ ] **Step 3: Implementar.** Reutilizar `StoreMeta`, `ProductCard`, `ProductRow` y `RealMenu`; no crear componentes nuevos si alcanzan los de hoy.
- [ ] **Step 4: Correr `npm test` y `npm run lint`.**
- [ ] **Step 5: Commit:** `feat: vertical, tienda y menú con el catálogo real`

### Task 6: Restaurantes, Turbo, Ofertas, Favoritos y Home con datos reales

**Files:**
- Modify:
  - `prototipo-app/src/screens/restaurants/RestaurantsScreen.jsx` y `data.js`: queda la UI; salen las tiendas inline de los banners y «Volver a pedir»;
  - `prototipo-app/src/screens/turbo/TurboScreen.jsx` y `data.js`;
  - `prototipo-app/src/screens/deals/DealsScreen.jsx` y `data.js`;
  - `prototipo-app/src/screens/favorites/FavoritesScreen.jsx` y `data.js`;
  - `prototipo-app/src/screens/home/HomeSections.jsx` y `prototipo-app/src/data/home.js`: queda la UI; salen `TURBO_RESTAURANTS`, `NEARBY_STORES` y `LOWER_FEES`;
  - el atajo a Mascotas, donde esté;
  - sus tests (`TurboScreen.test.jsx`, `HomeSections`, `DealsScreen` y `FavoritesScreen` si existen).

**Interfaces:**
- **Consumes:** `restaurants`, `menu`, `deals`, `home`, `verticalStores`, `store`, `useApi` y `OfflineNotice`.
- **Produces:**
  - **Restaurantes:** la lista sale de `restaurants({ sort: 'rating' })`, y los filtros de cocina usan `cuisine`.
  - **Turbo:** las pestañas son los pasillos de la tienda Turbo con más productos (la primera de `verticalStores('turbo')`), y «Ofertas» es `deals('turbo')`.
  - **Ofertas:**
    - «Bajaron de precio» por vertical, una sección por vertical con resultados, en el orden supermercado, licores, conveniencia, mall, chocolatería y turbo;
    - «Envío más barato», con `home().low_fee_restaurants`.
  - **Favoritos:** «Tus favoritos» sale de `FavoritesContext` (hoy); «Los mejores», de `restaurants({ sort: 'rating', limit: 4 })` y `verticalStores('supermercado', 2)`.
  - **Home** (ambos modos): «Cerca de ti», «Restaurantes rápidos» y «Envío más barato» salen de `home()`. Si `home()` falla, esas secciones se ocultan: la Home no se bloquea.

- [ ] **Step 1: Tests que fallan.**
  - `'Restaurantes lista los de la API y filtra por cocina'`
  - `'Turbo usa los pasillos de la tienda Turbo como pestañas'`
  - `'Ofertas agrupa las bajas reales por vertical'`
  - `'la Home muestra Cerca de ti de la API y se oculta si falla'`
  - `'no hay atajo a Mascotas'`
  - `'ninguna tienda tocable en Restaurantes, Ofertas ni Home es local'`: cada `push('store')` lleva un `id` numérico.
- [ ] **Step 2: Correrlos.** Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr `npm test` y `npm run lint`.**
- [ ] **Step 5: Commit:** `feat: restaurantes, Turbo, ofertas, favoritos y Home con el catálogo real`

### Task 7: Fuera el catálogo transcrito de las pantallas

**Files:**
- Delete:
  - `prototipo-app/src/data/realMenus.js` y `prototipo-app/scripts/export-menus.sh`;
  - la línea `generated` de `prototipo-app/.gitignore`, si queda sin uso;
  - las partes de catálogo que sigan en `screens/*/data.js` y en `data/home.js`.
- Modify:
  - `prototipo-app/src/data/catalog.js`: un comentario de cabecera que diga que solo queda para el buscador y el cerebro local de Mochi, y que se va en la etapa 3; quitar los imports de módulos borrados;
  - `prototipo-app/src/data/catalog.test.js` y `prototipo-app/src/api/orders.test.js`: dejar de depender de productos de pantallas que ya no existen.

- [ ] **Step 1:**
  - `grep -rn "VERTICAL_PRODUCTS\|VERTICAL_STORES\|CRAZY_DEALS\|GROCERY_SECTIONS\|MOST_ORDERED\|TOP_PIZZAS\|NEW_IN_RAPPI\|FAVORITE_STORES\|BEST_GROCERY\|BEST_RESTAURANTS\|TURBO_PRODUCTS\|TURBO_OFFERS\|TURBO_RESTAURANTS\|NEARBY_STORES\|LOWER_FEES\|REAL_RESTAURANTS\|REAL_DISHES" prototipo-app/src`
  - Expected: solo `data/catalog.js` y consumidores de la etapa 3 (`assistant/*`, `home/live/script.js`, `Nudge`), anotados.
- [ ] **Step 2: Borrar lo que quedó sin uso** (archivos borrados con `git rm`; nada fuera del repo) y ajustar sus tests.
- [ ] **Step 3: Correr `npm test`, `npm run lint` y `npm run build`.** Expected: PASS.
- [ ] **Step 4: Commit:** `refactor: las pantallas ya no tienen catálogo transcrito`

### Task 8: `mvp-check`, documentación y capturas

**Files:**
- Modify:
  - `prototipo-app/scripts/mvp-check.mjs` y `scripts/mvp-check.sh`;
  - `prototipo-app/scripts/screenshots.mjs`, si los selectores cambiaron;
  - `prototipo-app/docs/screenshots/*`, solo las que cambian de verdad;
  - `README.md`, `prototipo-app/README.md`, `docs/demo.md` y `docs/decisiones.md` (fila del 10-10 con los rulings de entrada).

- [ ] **Step 1: El recorrido de `mvp-check` crece** (sobre el catálogo de prueba): Home → vertical Súper → primera tienda → agregar un producto → carrito → pagar.
  - Después del pago, `mvp-check.sh` consulta `rappi_ia_test` y debe haber una fila en `app_orders` con `source = 'prototype'` cuyas líneas tienen `entity_id` de productos sembrados.
  - Se mantiene la revisión sin conexión.
  - Expected: «MVP check: 3 de 3 bien».
- [ ] **Step 2: Verificar en el navegador contra la base real** con `make mvp`, a 375 × 812 y en escritorio:
  - recorrer Súper, Licores (+18), una tienda grande con «Ver más», un restaurante, Turbo, Ofertas y la Home;
  - en la consola no debe haber errores;
  - las imágenes cargan o muestran la de reemplazo.
- [ ] **Step 3: Documentación:**
  - de dónde salen ahora las pantallas;
  - que el buscador sigue local hasta la etapa 3;
  - que Mascotas salió;
  - la fila de decisiones.
- [ ] **Step 4: Capturas:** con `make mvp` corriendo, `npm run screenshots`; quedarse solo con las que cambiaron de verdad.
  - Ojo: las capturas hacen un pedido real en la base. Anotarlo en el reporte.
- [ ] **Step 5: Correr todas las suites y `make mvp-check`.** Commit: `docs: el catálogo real llega a las pantallas`
