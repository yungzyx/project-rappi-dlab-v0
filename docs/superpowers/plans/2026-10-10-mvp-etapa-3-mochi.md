# MVP, etapa 3: buscador y Mochi sobre el RAG (plan de implementación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El buscador busca en todas las verticales con la búsqueda híbrida. Cada cosa que Mochi ofrece sale de la API: `/chat`, `/mochi/offer` y `/recommendations`. Se van de la app el cerebro local, los temas, el catálogo transcrito y el código muerto.

**Architecture:**
- **Backend:**
  - un módulo `rappi_ia/offers/` con las guardias de ofertas y el motor de momentos, detrás de `POST /mochi/offer` y `GET /mochi/plans`;
  - `/search` con `vertical` opcional devuelve grupos por vertical;
  - el agente (`suggest_complement`, que usan `/chat` y `/recommendations`) aplica las mismas guardias.
- **App:**
  - `api/search.js` y `api/mochi.js`;
  - un hook de búsqueda con espera de 250 ms tras la última tecla, que mantiene los datos anteriores mientras carga;
  - los momentos de Mochi llaman a la API;
  - las sugerencias se registran con los eventos que ya existen.

**Tech Stack:** Python 3.13 + FastAPI + psycopg (rappi-ia); React 19 + Vite + Vitest (prototipo-app); Playwright para `mvp-check`.

**Spec:** `docs/superpowers/specs/2026-10-10-mvp-integrado-design.md` (sección 3: «Búsqueda» y «Ofertas de Mochi»; sección 4: etapa 3)

## Global Constraints

- **Idioma:** código en inglés; todo lo que ve el usuario en español.
- **Guardias (especificación §1.4 y §3):** Mochi nunca propone por su cuenta Farmacia, salud, bebé ni alcohol (ni Licores). Tampoco conceptos sensibles, sex shops ni tabaquerías.
  - Viven en el servidor (`rappi_ia/offers/guards.py`), en un solo lugar, con tests.
  - Valen para todos los momentos de `/mochi/offer`, para la sugerencia cruzada de `/chat` (`suggest_complement`) y para `/recommendations`.
- **Única excepción:** el kit de una ocasión que la persona eligió (`plan` con `occasion`) puede traer los conceptos de esa ocasión aunque sean alcohol, con su marca +18.
  - Nunca se ofrecen como kit las ocasiones `guagua` ni `enfermo`.
  - Nunca aparecen conceptos sensibles.
- **Sin respaldo local.**
  - Si `/chat` falla, el chat muestra «Sin conexión» con «Reintentar», no «Respuesta local».
  - Si falla una oferta (o vuelve un 204), Mochi no dice nada.
- **Eventos:** las sugerencias se registran con los tipos que ya existen.
  - Mostrada: `suggestion_shown`, una vez por momento, concepto, vertical y generación (`firstShowing`).
  - Aceptada: `suggestion_accepted`.
  - El origen va en `payload.origen = 'mochi-<momento>'` (por ejemplo `mochi-carrito`); el chat sigue con `chat` y los servicios con `rappitravel` o `rappifavor`.
  - No se crean tipos nuevos.
- **La búsqueda no se personaliza.** Su orden no depende del perfil.
- **Nada local en el carrito.** Todo producto que llega al carrito trae `entityType` y `entityId` reales. Ningún pedido lleva ids `proto:`.
- **Datos de prueba inventados.** `seed-demo` crece con lo que haga falta (aristas «complementa» entre conceptos sembrados, una ocasión con productos), y cada nombre de tienda o producto contiene «prueba».
- **Contrato:** cada respuesta nueva (`/search` agrupado, `/chat`, `/mochi/offer` por momento incluido el 204, `/mochi/plans`, `/recommendations`) tiene su ejemplo en `prototipo-app/src/api/fixtures/`, escrito por `make contract`.
- **Tests verdes en cada tarea:**
  - en rappi-ia, `make test` y `make lint`;
  - en prototipo-app, `npm test` y `npm run lint`;
  - test que falla primero.
- **Medir en la base real** (solo lectura): `/search` agrupado, menos de 800 ms en caliente; `/mochi/offer`, menos de 500 ms en caliente.

### Rulings de entrada (decididos por el controlador)

- **Alcohol.** Se aplica la especificación (que el usuario aprobó) por sobre `docs/diseno-ia.md` regla 6b: el agente deja de sugerir alcohol, farmacia, bebé y salud como complemento en `/chat`. Se anota en `docs/decisiones.md`.
- **Eventos.** Se reutilizan `suggestion_shown` y `suggestion_accepted` con `origen = 'mochi-<momento>'`, en vez de los `mochi_offer_*` de la especificación. Así las métricas del panel, el embudo y el perfil los cuentan sin cambios, y un tipo nuevo sin registrar no hace que el servidor rechace el lote entero.
- **Búsqueda en todas las verticales:**
  - Si se detecta un concepto, busca en sus verticales típicas (`ranked_verticals`, hasta 3) más la vertical de la pantalla actual.
  - Si no, busca en las 8.
  - Calcula un solo embedding por consulta.
  - No devuelve tiendas como resultados: «Tiendas populares» sale de `/catalog/home`.
- **Perfil.** Solo el del servidor (`/profile`, construido con eventos). Sale el perfil local por temas (`ProfileContext` con `tagsOf`); queda solo su «generación» (el contador que sube con «Olvidar»), que usa `firstShowing`.
- **«Para ti» y «Descubre con Mochi»** salen de `/recommendations` (complementos de los intereses del perfil, con guardias).
- **La vertical por probar.** Mientras el juego guarde su progreso en el navegador (hasta la etapa 4), la app manda en el contexto las verticales que ya tienen sello, y el servidor elige la primera sin sello y no protegida.
- **Arrastrar un producto a Mochi o «¿Con qué acompaño…?»** usan el momento `carrito` con ese producto. «¿Qué puedo probar?» del Mochi flotante usa `vertical_por_probar`.
- **Categorías de una vertical:** cada fila lleva una consulta en español y su vertical (por ejemplo «Beers and ciders» → «cerveza» en Licores). Abren el buscador de la app en esa vertical.
- **Sale el código muerto:** `Nudge` y `NudgeContext` (nunca se llamaba `offer`), el hook `useRemoteForYou` (se queda `firstShowing`, movido a `api/suggestions.js`), `session.vertical` y `explored.js`, si nada más lo usa.

## Review Focus

1. **Ninguna oferta que Mochi hace por su cuenta trae alcohol, farmacia, bebé, salud, conceptos sensibles, sex shops ni tabaquerías,** aunque el carrito tenga cerveza o pañales. En `plan`, solo la ocasión elegida trae sus conceptos. Tests en las tareas 1 y 3.
2. **Escribir rápido en el buscador:** una respuesta vieja nunca reemplaza a una más nueva. Mientras carga se ven los resultados anteriores, sin parpadeo. Se consulta a los 250 ms de la última tecla. Tests en las tareas 4 y 5.
3. **La API se cae a mitad de una conversación:** el chat muestra «Sin conexión» con «Reintentar», que reenvía la misma pregunta. Las ofertas no muestran nada. Tests en las tareas 6 y 7.
4. **La misma sugerencia se cuenta una sola vez:** mostrada, una vez por momento, concepto, vertical y generación; aceptada, una vez. Agregar el kit completo registra una aceptación por producto, no por clic. Tests en las tareas 4 y 7.
5. **Todo producto que Mochi ofrece llega al pedido con su `entity_id` real.** Después de esta etapa no queda ningún camino que produzca `proto:`. Tests en las tareas 7 y 8.

---

### Task 1: Guardias de ofertas en el servidor (y en el agente)

**Files:**
- Create: `rappi-ia/src/rappi_ia/offers/__init__.py`, `rappi-ia/src/rappi_ia/offers/guards.py`
- Modify: `rappi-ia/src/rappi_ia/agent/tools.py` (`suggest_complement`) y donde se elijan sugerencias en `agent/bigotes.py` (servicios), `rappi-ia/src/rappi_ia/demo/seed.py`
- Test: `rappi-ia/tests/unit/test_offer_guards.py`, `rappi-ia/tests/integration/test_offer_guards_agent.py`

**Interfaces:**
- **Produces:**
  - `is_offerable(concept: Concept) -> bool`: `False` si el concepto es sensible, tiene `age_restricted` (alcohol) o está en los grupos bebé o salud de la taxonomía (revisar los `group`/`parent` reales en `taxonomy.toml`).
  - `OFFER_BLOCKED_VERTICALS = ("farmacia",)` y `offerable_vertical(vertical) -> bool`. La exclusión por subvertical (sex shop, tabaquería, farmacia en súper) se reutiliza de `catalog/stores.py`, sin copiarla.
  - `suggest_complement(...)` no devuelve conceptos ni verticales no ofrecibles. El resto de su contrato no cambia.

- [ ] **Step 1: Tests que fallan.**
  - `test_alcohol_baby_health_and_sensitive_concepts_are_not_offerable`, con conceptos reales de la taxonomía: cerveza, vino, pañales, medicamentos, bienestar-sexual.
  - `test_complement_never_offers_alcohol`: con la arista sembrada pizza → cerveza, `suggest_complement` desde pizza no sugiere cerveza.
  - `test_complement_never_lands_in_pharmacy`
  - `test_chat_cross_sell_respects_the_guards`: un `/chat` sobre pizza no trae una `suggestion` de alcohol.
- [ ] **Step 2: Correrlos.** Expected: FAIL.
- [ ] **Step 3: Implementar.** Ajustar los tests existentes del agente que esperaban pizza → cerveza o un complemento de farmacia, anotando cada cambio en el reporte.
- [ ] **Step 4: Correr `make test` y `make lint`.**
- [ ] **Step 5: Commit:** `feat: Mochi nunca ofrece por su cuenta alcohol, farmacia, bebé ni salud (guardias en el servidor)`

### Task 2: `/search` en todas las verticales, agrupado

**Files:**
- Modify: `rappi-ia/src/rappi_ia/agent/tools.py` (o un `rappi_ia/retrieval/grouped.py` nuevo), `rappi-ia/src/rappi_ia/api/app.py` (`/search`), `rappi-ia/tests/integration/test_contract.py`
- Test: `rappi-ia/tests/integration/test_search_grouped.py`

**Interfaces:**
- **Produces:**
  - `GET /search?q=&vertical=&limit=`:
    - con `vertical`, la respuesta de hoy;
    - sin `vertical`, `{ query, groups: [{ vertical, prototype_vertical, products }], unmet, unmet_reason }`.
    - Los grupos van ordenados por relevancia (el del concepto típico primero) y solo aparecen los que traen productos.
    - `limit` es por grupo (por defecto 6).
    - `unmet` vale `true` solo si ningún grupo trae productos.
  - `search_grouped(conn, q, embedder, current: str | None, limit: int) -> GroupedResult`, con un solo embedding por consulta (envolver el embedder en uno con memoria).
  - **Ejemplos del contrato:** `search-grouped` (una consulta del seed con resultados en 2 verticales) y `search-grouped-unmet`.

- [ ] **Step 1: Tests que fallan.**
  - `test_grouped_search_puts_the_typical_vertical_first`
  - `test_grouped_search_embeds_the_query_once`: un embedder contador sobre las 8 verticales da 1 llamada.
  - `test_grouped_search_unmet_only_when_no_group_has_products`
  - `test_vertical_search_is_unchanged`
- [ ] **Step 2: Correrlos.** Expected: FAIL.
- [ ] **Step 3: Implementar y correr `make contract`.**
- [ ] **Step 4: Medir en la base real** (solo lectura; script fuera del repo). Meta: menos de 800 ms en caliente para «cerveza», «pañales», «algo para el carrete» y «xyzzy». Si no se cumple, anotarlo con el plan de consulta.
- [ ] **Step 5: Correr `make test` y `make lint`. Commit:** `feat: /search busca en todas las verticales y agrupa los resultados`

### Task 3: El motor de ofertas: `POST /mochi/offer` y `GET /mochi/plans`

**Files:**
- Create: `rappi-ia/src/rappi_ia/offers/engine.py`, `rappi-ia/src/rappi_ia/api/mochi.py` (router incluido en `app.py`, con dependencias de `api/deps.py`)
- Modify: `rappi-ia/src/rappi_ia/demo/seed.py`, `rappi-ia/tests/integration/test_contract.py`
- Test: `rappi-ia/tests/integration/test_mochi_offer.py`

**Interfaces:**
- **Consumes:** las guardias (tarea 1), `suggest_complement`, `available_elsewhere`/`ranked_verticals`, las ocasiones de la taxonomía y `catalog` (`deals`, `vertical_stores`).
- **Produces:**
  - `POST /mochi/offer` recibe `{ moment, user_id?, context }`. Los momentos y su contexto:

    | `moment` | `context` | Decide |
    |---|---|---|
    | `plan` | `{ occasion }` | El kit: un producto por concepto de la ocasión (hasta 4), de la vertical donde es típico, repartido entre verticales. Ocasión `guagua`, `enfermo` o desconocida da 422 |
    | `carrito` | `{ product: { entity_type, entity_id } }` | Un complemento ofrecible de otra vertical (arista «complementa»), o 204 |
    | `checkout` | `{ cart: [{ entity_type, entity_id }] }` | Lo mismo sobre el carrito: el mejor complemento que no esté ya en el carrito, o 204 |
    | `sin_resultado` | `{ query }` | La vertical ofrecible que sí tiene el concepto de la consulta, con hasta 3 productos, o 204 |
    | `proximo_pedido` | `{ items: [{ entity_type, entity_id }] }` | Un complemento de lo pedido, o 204 |
    | `vertical_por_probar` | `{ stamped: [vertical, ...] }` | La primera vertical del pasaporte sin sello, ofrecible (nunca farmacia), con hasta 3 productos (sus ofertas, o los más pedidos), o 204 |

  - **Respuesta 200:** `{ moment, text, products: [Product dict], vertical, prototype_vertical, reason: { concept?, from_concept?, occasion? }, actions: [{ label, route? , query? }] }`.
    - Los textos salen de plantillas en español en `engine.py`, por ejemplo «Con {producto} combina {concepto}, en {vertical}».
  - **`GET /mochi/plans`:** `[{ id, name, emoji }]`, las ocasiones ofrecibles para la Home.
    - En el orden de hoy: once, carrete, asado, panorama («Película»), regalo; después las demás ofrecibles.
    - Sin guagua ni enfermo.
  - **Ejemplos del contrato:** uno por momento (`mochi-plan`, `mochi-carrito`, `mochi-checkout`, `mochi-sin-resultado`, `mochi-proximo-pedido`, `mochi-vertical-por-probar`), un 204 (`mochi-carrito-nada`) y `mochi-plans`.

- [ ] **Step 1: Tests que fallan** (contra el seed, ampliado con aristas «complementa» y productos para una ocasión):
  - `test_plan_kit_spreads_across_verticals_and_includes_chosen_alcohol_with_age_mark`
  - `test_plan_rejects_baby_and_sick_occasions`
  - `test_cart_offer_never_returns_alcohol_or_pharmacy_even_if_cart_has_them`
  - `test_checkout_offer_skips_items_already_in_cart`
  - `test_no_good_offer_is_204`
  - `test_vertical_to_try_skips_stamped_and_pharmacy`
  - `test_plans_lists_offerable_occasions_in_home_order`
- [ ] **Step 2: Correrlos.** Expected: FAIL.
- [ ] **Step 3: Implementar y correr `make contract`.**
- [ ] **Step 4: Medir en la base real** (solo lectura). Meta: menos de 500 ms en caliente por momento.
- [ ] **Step 5: Correr `make test` y `make lint`. Commit:** `feat: /mochi/offer y /mochi/plans, las ofertas de Mochi desde el RAG`

### Task 4: La app habla con la búsqueda y con Mochi (cliente, hooks y eventos)

**Files:**
- Create: `prototipo-app/src/api/search.js`, `prototipo-app/src/api/mochi.js`, `prototipo-app/src/api/suggestions.js`, `prototipo-app/src/api/useSearchApi.js`, más sus tests
- Modify: `prototipo-app/src/api/useApi.js` (opción `keepPrevious`), `prototipo-app/src/api/client.js` (`recommendations` con productos convertidos)

**Interfaces:**
- **Produces:**
  - **`searchAll(q, { vertical, limit })`:**
    - devuelve `{ groups: [{ vertical (del prototipo), backendVertical, products }], unmet, unmetReason }`, con productos convertidos por `toPrototypeProduct`;
    - con `vertical`, devuelve un solo grupo.
  - **`offer(moment, context)`:**
    - devuelve `{ moment, text, products, vertical, reason, actions }` o `null` en un 204;
    - cada producto lleva `fromSuggestion: true` y `suggestionOrigin: 'mochi-' + moment`.
  - **`plans()`.**
  - **`useSearchApi(query, { vertical })`:** espera 250 ms tras la última tecla y no consulta con menos de 2 caracteres. Devuelve `{ data, loading, error, retry }` y mantiene los datos anteriores mientras carga.
  - **`useApi(load, deps, { keepPrevious })`:** con `keepPrevious`, `data` es la del último resultado mientras carga la nueva. Sin la opción, la conducta de hoy no cambia.
  - **`firstShowing(row)`:** se mueve a `api/suggestions.js` (misma clave y conducta).
  - **`noteShown(track, products, { origin, concept, vertical })`** y **`noteAccepted(...)`:** los helpers de eventos que usan las pantallas.

- [ ] **Step 1: Tests que fallan.**
  - `'la búsqueda espera 250 ms tras la última tecla'`
  - `'una respuesta vieja no reemplaza a una nueva'`
  - `'mientras carga se ven los resultados anteriores'`
  - `'offer devuelve null en un 204 y marca los productos como sugerencia de Mochi'`
  - `'useApi sin keepPrevious no cambia'` (el test de hoy sigue pasando)
- [ ] **Step 2: Correrlos.** Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr `npm test` y `npm run lint`. Commit:** `feat: la app consulta la búsqueda agrupada y las ofertas de Mochi`

### Task 5: El buscador sobre la API

**Files:**
- Modify:
  - `prototipo-app/src/components/search/useSearch.js` (o reemplazarlo por `useSearchApi`), `SearchSections.jsx` y `SearchResults*`;
  - `prototipo-app/src/screens/search/SearchScreen.jsx`;
  - `prototipo-app/src/screens/vertical/data.js` y `VerticalScreen.jsx` (consultas en español de las categorías);
  - sus tests.

**Interfaces:**
- **Consumes:** `useSearchApi`, `offer('sin_resultado', { query })` y `home()` (para «Tiendas populares»).
- **Produces:**
  - Los resultados se agrupan por vertical, con el nombre de cada una, y cada producto se abre en su tienda (por `storeId`).
  - **«Sin resultados»:** se muestra la oferta `sin_resultado` («Ver en {vertical}»). Si vuelve un 204, solo «Probar otra búsqueda».
  - **El evento `search`:** se registra con la cantidad real de resultados y el `unmet` de la API.
  - **Las categorías:** cada fila de `VERTICALS` lleva `query` en español y abre `push('search', { query, vertical })`. En el modo final, el buscador con Mochi recibe esa vertical.

- [ ] **Step 1: Tests que fallan.**
  - `'escribir «cerveza» muestra los grupos de la API con Licores primero'`
  - `'sin resultados muestra Ver en la vertical que sí lo tiene'`
  - `'el evento search lleva los resultados y unmet de la API'`
  - `'la categoría Beers and ciders busca «cerveza» en Licores'`
  - `'sin API el buscador muestra Sin conexión y Reintentar'`
- [ ] **Step 2: Correrlos.** Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr `npm test` y `npm run lint`. Commit:** `feat: el buscador busca en el catálogo real, agrupado por vertical`

### Task 6: El buscador con Mochi (panel) sin cerebro local

**Files:**
- Modify: `prototipo-app/src/components/assistant/AssistantPanel.jsx`, `ChatMessage.jsx`, `DiscoverSection.jsx` y sus tests (`AssistantPanel.test.jsx`, `AssistantPanel.keys.test.jsx`, `localSuggestions.test.jsx` y `DiscoverSection.test.jsx`, reescritos o borrados si probaban solo el cerebro local)

**Interfaces:**
- **Consumes:** `chat` (client), `recommendations`, `offer('carrito', …)`, `useSearchApi` y `noteShown`/`noteAccepted`.
- **Produces:**
  - **Al abrir:** un saludo fijo, «Para ti» con `/recommendations` (oculto si viene vacío o falla) y los chips de ideas como texto fijo (las preguntas de hoy: «Arma un carrete», etc.).
  - **Respuesta con `/chat`:** si falla, un mensaje «Sin conexión» con «Reintentar», que reenvía la misma pregunta. Sale «Respuesta local».
  - **«Descubre con Mochi»:** hasta 3 filas de `/recommendations`.
  - **«Aprendiendo de ti»:** solo con `/profile`.
  - **«¿Con qué acompaño…?»** (arrastrar o mantener apretado un producto): muestra la oferta `carrito` de ese producto como mensaje de Mochi, o «No se me ocurre nada para acompañar eso» en un 204.

- [ ] **Step 1: Tests que fallan.**
  - `'si chat falla se ve Sin conexión y Reintentar reenvía la pregunta'`
  - `'Para ti sale de recommendations y se cuenta como mostrado una vez'`
  - `'arrastrar un producto a Mochi muestra su complemento de la API'`
  - `'Aprendiendo de ti usa solo el perfil del servidor'`
- [ ] **Step 2: Correrlos.** Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr `npm test` y `npm run lint`. Commit:** `feat: el buscador con Mochi responde solo con la API`

### Task 7: Los momentos de Mochi sobre `/mochi/offer`

**Files:**
- Modify:
  - `prototipo-app/src/screens/home/live/LiveHomeFeed.jsx` y `LiveBlocks.jsx` (kits, comentario del carrito, vertical por probar);
  - `prototipo-app/src/components/assistant/MochiPresence.jsx` («¿Qué puedo probar?»);
  - `prototipo-app/src/screens/checkout/CheckoutSuggestion.jsx` («¿Me falta algo?», solo si se pide);
  - `prototipo-app/src/screens/tracking/TrackingScreen.jsx` («Mochi te arma el próximo pedido»);
  - `prototipo-app/src/hooks/useAddToCart.js`;
  - sus tests.

**Interfaces:**
- **Consumes:** `offer`, `plans`, `noteShown`/`noteAccepted` y el estado del juego (`visited` → `stamped`).
- **Produces:**
  - **Kits:** los chips salen de `plans()`; tocar uno pide `offer('plan', { occasion })`. «Agregar el kit» agrega cada producto como sugerencia (`mochi-plan`).
  - **Comentario del carrito** (al volver a la Home): `offer('carrito', { product })`; en un 204, nada.
  - **Tocar a Mochi:** `offer('vertical_por_probar', { stamped })`, con los botones de hoy («Jugar», «Abrir», «Después»).
  - **«¿Qué puedo probar?»** del Mochi flotante: abre el panel con esa oferta.
  - **Checkout:** solo al tocar «¿Me falta algo?» pide `offer('checkout', { cart })`; en un 204 dice «Tu carrito está completo».
  - **Seguimiento:** al entregar, `offer('proximo_pedido', { items })`. Si hay oferta, la tarjeta «¿Y ahora …?» la muestra; si no, no aparece.
  - **Eventos:** cada oferta mostrada da `suggestion_shown` una vez (`firstShowing`), y cada producto agregado desde ella da `suggestion_accepted`. Las guardias de silencio de hoy (`silent()`, «Silenciar por hoy», callarse después de dos globos cerrados) siguen igual.

- [ ] **Step 1: Tests que fallan.**
  - `'el kit sale de la API y agregarlo registra una aceptación por producto'`
  - `'el comentario del carrito usa la oferta de la API y calla en un 204'`
  - `'tocar a Mochi propone la vertical sin sello que dice la API'`
  - `'¿Me falta algo? pide la oferta solo al tocarlo y dice Tu carrito está completo en un 204'`
  - `'al entregar, la tarjeta ¿Y ahora…? sale de la API'`
  - `'Mochi en silencio no pide ofertas'`
- [ ] **Step 2: Correrlos.** Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr `npm test` y `npm run lint`. Commit:** `feat: los momentos de Mochi salen de /mochi/offer`

### Task 8: Fuera el cerebro local, el catálogo transcrito y el código muerto

**Files:**
- Delete (con `git rm`, después de confirmar con grep que no quedan usuarios):
  - `src/assistant/brain.js`, `tags.js`, `discover.js` y `emptySearch.js`;
  - `src/assistant/explored.js` (si nada lo usa);
  - `src/screens/home/live/script.js`;
  - `src/components/assistant/Nudge.jsx` y `src/state/NudgeContext.jsx`;
  - `src/api/useRemoteForYou.js`;
  - `src/data/catalog.js`, `verticalCatalog.js` y `transcribedCatalog.js`;
  - sus tests.
- Modify:
  - `src/state/ProfileContext.jsx`: queda solo la generación, o pasa a `EventsContext`;
  - `src/api/orders.js`: `conceptOf` = `product.concept`; sin `TAG_TO_CONCEPT` ni `proto:`;
  - `App.jsx`: sin `NudgeProvider`, `Nudge` ni `markExplored` si ya no hace falta;
  - los cerca de 16 tests que envolvían en `NudgeProvider`;
  - los tests que usaban `ALL_PRODUCTS` como datos (`AddButton*`, `CartBar`, `CheckoutScreen`): pasan a usar productos de las respuestas de ejemplo.

- [ ] **Step 1:** `grep -rn "assistant/brain\|assistant/tags\|discover\|emptySearch\|explored\|home/live/script\|NudgeContext\|Nudge\b\|useRemoteForYou\|data/catalog\|verticalCatalog\|transcribedCatalog\|proto:" prototipo-app/src`. Expected: solo lo que esta tarea borra o cambia.
- [ ] **Step 2: Borrar y ajustar.** Ningún test nuevo de conducta: los de las tareas 4 a 7 ya cubren lo que reemplaza a esto. Si un test borrado probaba una guardia, confirmar que su equivalente existe en el servidor (tarea 1 o 3) y nombrarlo en el reporte.
- [ ] **Step 3:** Correr `npm test`, `npm run lint` y `npx vite build --outDir <tmp>`. Expected: PASS. Repetir el grep del paso 1: debe salir vacío.
- [ ] **Step 4: Commit:** `refactor: fuera el cerebro local de Mochi, los temas y el catálogo transcrito`

### Task 9: `mvp-check`, documentación y capturas

**Files:**
- Modify:
  - `prototipo-app/scripts/mvp-check.mjs` y `scripts/mvp-check.sh`;
  - `prototipo-app/scripts/screenshots.mjs`, si cambian los selectores;
  - `README.md`, `prototipo-app/README.md`, `docs/demo.md`, `docs/decisiones.md` (fila del 10-10 con los rulings de entrada, incluido el cambio a la regla 6b) y `docs/diseno-ia.md` (marcar la regla 6b como reemplazada);
  - las capturas que cambien de verdad.

- [ ] **Step 1: El recorrido de `mvp-check` crece:** buscar «cerveza» → ver un grupo → abrir el buscador con Mochi → pedir un kit (`plan`) → agregarlo → pagar.
  - La revisión de la base exige un pedido con líneas sembradas y al menos un `suggestion_accepted` con `origen = 'mochi-plan'` en `app_events`.
  - Se mantiene la revisión sin conexión.
  - Expected: «MVP check: 4 de 4 bien».
- [ ] **Step 2: Verificar contra la base real con `make mvp`,** a 375 × 812 y en escritorio:
  - buscador: «cerveza», «pañales», «algo para el carrete», «xyzzy»;
  - chat: «arma un carrete» y una pregunta con la API detenida;
  - kits de la Home, comentario del carrito, «¿Me falta algo?» y la tarjeta del seguimiento.
  - **Qué revisar:** ninguna oferta por cuenta propia trae alcohol, farmacia, bebé ni salud; no hay errores en la consola.
- [ ] **Step 3: Documentación y capturas,** quedándose solo con las que cambian. Las capturas hacen un pedido real en la base: anotarlo.
- [ ] **Step 4: Correr todas las suites y `make mvp-check`. Commit:** `docs: el buscador y Mochi trabajan sobre el RAG`
