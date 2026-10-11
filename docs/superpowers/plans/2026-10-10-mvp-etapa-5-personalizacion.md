# MVP etapa 5: personalización con la capa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las ofertas del agente se ordenan por lo que cada persona hace (perfil por eventos, segmentos no sensibles, marcas que compra), cada oferta dice «por qué» y se puede rastrear, los segmentos de la persona se recalculan después de cada pedido, y «Olvidar» borra todo sin que nada lo reviva.

**Architecture:** Un módulo nuevo `rappi_ia/offers/personal.py` junta las señales de una persona (`Interests`: puntaje por concepto ofrecible, con su base rastreable, y marcas compradas). El motor de ofertas lo recibe por `user_id` y lo usa en tres puntos: el orden de `vertical_por_probar`, el orden de `/agent/plans` y la marca del complemento. Todas las ofertas llevan `reason.text` (español, para la app) y `reason.basis` (las señales que lo explican). `POST /orders` recalcula los segmentos de esa persona en segundo plano. La búsqueda no cambia.

**Tech Stack:** Postgres 17, FastAPI (BackgroundTasks), psycopg 3, pytest; React 19, vitest; Playwright (`make mvp-check`).

**Spec:** `docs/superpowers/specs/2026-10-10-mvp-integrado-design.md` (§3 «Ofertas de Mochi», §4 «Etapa 5», §6, §8 riesgo de segmentos).

## Global Constraints

- Código en inglés; todo lo que ve el usuario (textos, `reason.text`, logs, docs) en español. El agente se llama en el código `rappi_agent`; el nombre visible sale de `config.AGENT_NAME` / `prototipo-app/src/agent/name.js`. No escribir «Mochi» ni «chat» en código nuevo.
- Guardias (`offers/guards.py`): el agente nunca propone por su cuenta Farmacia, salud, bebé ni alcohol. Solo conceptos que pasan `is_offerable` cuentan como interés. Los segmentos con `segment_defs.sensitive = true` nunca se leen para ofrecer (la lectura los excluye en SQL).
- La búsqueda (`/search`, y los productos de `/agent/ask`) no se personaliza.
- Datos de usuarios: solo `source = 'synthetic'` o `'prototype'`; las ofertas y el recálculo por pedido son para usuarios `prototype`. Las métricas simuladas no se presentan como evidencia.
- La forma de `reason` es un objeto. Las claves que la app ya lee (`concept`, `from_concept`, `occasion`) se mantienen; se suman `text: str` y `basis: list[dict]`.
- Las respuestas de ejemplo de `prototipo-app/src/api/fixtures/` las escribe `make contract`; toda forma nueva tiene su `Example`.
- Antes de dar una tarea por terminada: `make test` y `make lint` en rappi-ia; `npm test` y `npm run lint` en prototipo-app (y en dashboard-empresa si se toca). Tests de integración contra `rappi_ia_test`.

## Review Focus

1. **Una persona cuyo único interés es sensible o no ofrecible** (solo segmentos `compra-sin-gluten`/`mama-papa-bebe`, solo eventos de cerveza o pañales): sus ofertas son idénticas a las de alguien sin historia. Tests en Task 1 y Task 3.
2. **Dos pedidos seguidos de la misma persona:** los dos recálculos de segmentos en segundo plano no chocan (sin error de llave duplicada) y el resultado es el de la segunda corrida. Un pedido cuyo usuario se olvidó antes de que corra el recálculo no revive nada. Tests en Task 4.
3. **«Olvidar» con un guardado del juego o un pedido en vuelo:** después de «Olvidar» el servidor no tiene usuario, ni progreso, ni segmentos. Tests en Task 7.
4. **Una oferta sin señales personales** (usuario nuevo o anónimo): sigue saliendo igual que hoy, con un `reason.text` que no inventa gustos. Tests en Task 2 y Task 3.
5. **Búsqueda igual para dos personas con historias distintas:** mismos resultados en `/search` y mismos productos en `/agent/ask`. Test en Task 6.

---

### Task 1: Señales de una persona (`offers/personal.py`)

**Files:**
- Create: `rappi-ia/src/rappi_ia/offers/personal.py`
- Test: `rappi-ia/tests/integration/test_personal.py`

**Interfaces:**
- Produces:
  - `Signal(kind: str, id: str, score: float, source: str)` (dataclass, `to_dict()`).
    - `kind` es `"concepto"` o `"marca"`.
    - `source` es `"eventos"`, `"segmento:<segment_id>"` o `"pedidos"`.
  - `Interests(concepts: dict[str, float], basis: dict[str, list[Signal]], brands: dict[str, int])`.
    - `concepts` va ordenado de mayor a menor.
    - `basis[concept_id]` guarda las señales que suman ese puntaje.
    - `brands` es `brand_key → pedidos distintos`.
    - `Interests.empty()`, `Interests.top(n) -> list[str]`.
  - `user_interests(conn, user_id: str | None) -> Interests`:
    - Si `user_id` es `None` o no es `prototype`, devuelve `Interests.empty()`.
    - **Eventos:** `events.store.profile(conn, user_id)`, una señal `("concepto", c, score, "eventos")`.
    - **Segmentos:** de `user_segments` unido a `segment_defs` con `NOT d.sensitive`, cada ítem de `evidence->'top'` con `kind = 'concepto'` suma `LEVEL_WEIGHT[level]` con `LEVEL_WEIGHT = {"bajo": 1.0, "medio": 2.0, "alto": 3.0}`, como señal `("concepto", c, peso, "segmento:<id>")`.
    - Solo conceptos que existen en la taxonomía y pasan `is_offerable`.
  - `bought_brands(conn, user_id) -> dict[str, int]`:
    - Viene de `app_order_lines` ⨝ `app_orders` (`user_id`) ⨝ `item_brands`.
    - Cuenta los pedidos distintos por `brand_key` y deja solo los que tienen `MIN_BRAND_ORDERS = 2` o más.
    - Las marcas con `product_brands.kind = 'cadena'` no cuentan.

- [ ] **Step 1: Tests** (con el fixture `db`, `seed_demo` y eventos y pedidos `prototype` armados con `events.record` / `events.record_order`; las filas de `user_segments` e `item_brands` se insertan a mano):
  - **Eventos y segmentos:**
    - `test_interests_combine_events_and_non_sensitive_segments`: el puntaje es la suma de las dos fuentes, y la base nombra ambas.
    - `test_sensitive_segment_is_never_read`: un segmento `sensitive = true` cuya evidencia nombra un concepto ofrecible no suma nada.
    - `test_non_offerable_concepts_are_dropped`: cerveza, pañales y medicamentos en eventos no aparecen.
  - **Usuarios que no se personalizan:**
    - `test_anonymous_and_synthetic_users_have_no_interests`.
  - **Marcas:**
    - `test_bought_brands_need_two_orders`: una marca en 1 pedido no aparece; en 2 sí.
    - `test_chain_brands_do_not_count`.
- [ ] **Step 2: Correr y ver que fallan.** Comando: `cd rappi-ia && .venv/bin/pytest tests/integration/test_personal.py -q`. Esperado: FAIL, porque el módulo no existe.
- [ ] **Step 3: Implementar** `personal.py`. Una consulta para los segmentos y una para las marcas.
- [ ] **Step 4: Verificar.** Comando: `make test && make lint`. Esperado: en verde.
- [ ] **Step 5: Commit.** Mensaje: `feat: señales de una persona para ofrecer (eventos, segmentos no sensibles y marcas)`.

### Task 2: Cada oferta dice por qué (`reason.text` y `reason.basis`)

**Files:**
- Modify: `rappi-ia/src/rappi_ia/offers/engine.py`, `rappi-ia/tests/integration/test_agent_offer.py` (las aserciones del `reason`), `rappi-ia/tests/integration/test_contract.py` (solo si hace falta)
- Test: `rappi-ia/tests/unit/test_offer_reasons.py`

**Interfaces:**
- Produces: todo `Offer.reason` trae las claves de hoy, más `text: str` y `basis: list[dict]` (con la forma de `Signal.to_dict()`, o señales del contexto: `{"kind": "carrito"|"busqueda"|"pedido"|"ocasion"|"sello", "id": …, "source": "contexto"}`).
- Textos sin personalizar (constantes en `engine.py`, tal cual):
  - `plan`: `REASON_PLAN = "Porque elegiste «{occasion}»."`
  - `carrito` y `checkout`: `REASON_CART = "Porque llevas {emoji} {name}."` Si el origen no es ofrecible: `REASON_CART_ANONYMOUS = "Porque combina con lo que llevas."`
  - `proximo_pedido`: `REASON_NEXT = "Porque pediste {emoji} {name}."`
  - `sin_resultado`: `REASON_NO_RESULT = "Porque buscaste «{query}» y aquí sí hay."`
  - `vertical_por_probar`: `REASON_TO_TRY = "Porque aún no tienes el sello de {vertical}."`

- [ ] **Step 1: Tests:**
  - `test_every_moment_has_reason_text_and_basis`: los seis momentos, con `text` no vacío y `basis` lista.
  - `test_cart_reason_names_the_origin`.
  - `test_cart_reason_is_anonymous_for_a_non_offerable_origin`: cerveza en el carro no se nombra.
  - `test_reason_keeps_the_ids_the_app_reads`: siguen `concept`, `from_concept` y `occasion`.
- [ ] **Step 2: Correr y ver que fallan; implementar hasta verde.** Ajustar las aserciones exactas de `test_agent_offer.py` para que comparen las claves de siempre más `text` y `basis`.
- [ ] **Step 3: Contrato.** Correr `make contract`: las respuestas de ejemplo `agent-offer-*` suman `text` y `basis`.
- [ ] **Step 4: Verificar.** Comando: `make test && make lint`.
- [ ] **Step 5: Commit.** Mensaje: `feat: cada oferta del agente dice por qué`.

### Task 3: La vertical por probar y las ocasiones se ordenan por afinidad

**Files:**
- Modify: `rappi-ia/src/rappi_ia/offers/engine.py` (`make_offer`, `vertical_to_try`, `home_occasions`), `rappi-ia/src/rappi_ia/api/agent.py` (`/agent/plans?user_id=`), `rappi-ia/tests/integration/test_contract.py`
- Test: `rappi-ia/tests/integration/test_offer_affinity.py`

**Interfaces:**
- Consumes: `user_interests` (Task 1); `agent.verticals.typical_verticals(conn)`.
- Produces:
  - `make_offer(conn, embedder, moment, context, user_id=None)`: el `user_id` ahora sí se usa. Calcula `user_interests` una sola vez y se lo pasa a los momentos que lo usan.
  - `vertical_to_try(conn, stamped, interests: Interests)`:
    - Afinidad de una vertical: `afinidad(v) = Σ interests.concepts[c]` sobre los conceptos cuya vertical típica es `v`.
    - Las verticales sin sello y ofrecibles se ordenan por afinidad, de mayor a menor. En un empate manda `PASSPORT_ORDER`.
    - Con afinidad > 0, `reason.text = "Porque te gusta {emoji} {name}, y en {vertical} hay más."`, donde `{emoji} {name}` es el concepto que más aporta. `basis` lleva las señales de los 3 conceptos que más aportan.
    - Sin afinidad: igual que hoy, con `REASON_TO_TRY`.
  - `home_occasions(conn, interests: Interests) -> list[dict]`:
    - Puntaje de una ocasión: la suma de `interests.concepts` sobre sus conceptos ofrecibles.
    - Las ocasiones con puntaje > 0 van primero, de mayor a menor. Las demás quedan en el orden de hoy (`HOME_OCCASIONS` y después la taxonomía).
    - Una ocasión con puntaje lleva `reason: {"text": "Porque te gusta {emoji} {name}.", "basis": […]}`; sin puntaje, no trae la clave `reason`.
  - `GET /agent/plans?user_id=` (opcional, máximo 64 caracteres).

- [ ] **Step 1: Tests:**
  - **Vertical por probar:**
    - `test_vertical_to_try_follows_affinity`: con interés en chocolate, Chocolatería sale antes que Súper.
    - `test_vertical_to_try_without_history_keeps_passport_order`.
    - `test_vertical_to_try_never_offers_farmacia_or_licores_even_with_affinity`.
  - **Ocasiones:**
    - `test_plans_order_by_interest`: con interés en carne y carbón, «asado» va primero.
    - `test_plans_without_user_keep_the_default_order`: igual a `agent-plans.json`.
  - **Guardias:**
    - `test_only_sensitive_or_non_offerable_history_changes_nothing`: segmento sensible más eventos de cerveza dan lo mismo que sin historia (Review Focus 1).
- [ ] **Step 2: Correr y ver que fallan; implementar hasta verde.**
- [ ] **Step 3: Contrato.**
  - Agregar `Example("agent-plans-afin", "GET", "/agent/plans?user_id=u-afin")` y `Example("agent-offer-vertical-por-probar-afin", "POST", "/agent/offer", {"moment": "vertical_por_probar", "user_id": "u-afin", "context": {"stamped": []}})`.
  - `u-afin` se prepara en el fixture del cliente con eventos `prototype` que dan interés en chocolate y en carne.
  - Correr `make contract`.
- [ ] **Step 4: Verificar.** Comando: `make test && make lint`.
- [ ] **Step 5: Commit.** Mensaje: `feat: la vertical por probar y las ocasiones se ordenan por lo que te gusta`.

### Task 4: El complemento prefiere tu marca, y los segmentos se recalculan después de cada pedido

**Files:**
- Modify:
  - `rappi-ia/src/rappi_ia/agent/tools.py` (`suggest_complement`: parámetro `prefer_brands`)
  - `rappi-ia/src/rappi_ia/offers/engine.py` (`complement`)
  - `rappi-ia/src/rappi_ia/api/app.py` (`POST /orders`)
  - `rappi-ia/src/rappi_ia/api/deps.py` (`get_connector`)
  - `rappi-ia/src/rappi_ia/layers/segments.py` (caché de reglas; métricas de una persona en SQL)
- Test: `rappi-ia/tests/integration/test_offer_brand.py`, `rappi-ia/tests/integration/test_order_segments.py`

**Interfaces:**
- Consumes: `user_interests(...).brands` (Task 1).
- Produces:
  - **`suggest_complement(conn, sources, current, embedder, exclude=frozenset(), prefer_brands: dict[str, int] | None = None)`:**
    - Con `prefer_brands`, pide `k=12` candidatos por concepto destino en vez de 4.
    - Busca las marcas de esos candidatos en `item_brands`.
    - Pone primero el producto de la marca comprada con más pedidos y devuelve los 3 primeros como hoy.
    - Si ningún candidato es de una marca comprada, el resultado es el de hoy.
  - **`complement`:**
    - Cuando el producto que encabeza la oferta es de una marca comprada, `reason.text` suma `" Es {marca}, la marca que compras."`, con el nombre de `product_brands.name`, y `basis` suma la señal `("marca", brand_key, pedidos, "pedidos")`.
  - **`deps.get_connector() -> Callable[[], ContextManager[Connection]]`:**
    - Abre conexiones fuera del request.
    - Los tests lo reemplazan para usar la conexión del test.
  - **`POST /orders`:**
    - Después del commit agrega una `BackgroundTasks` que llama a `recalculate_user_segments(connector, user_id)` (en `api/app.py` o en `layers/segments.py`).
    - Esa función:
      1. Abre una conexión con el connector.
      2. Toma `pg_advisory_xact_lock(hashtext('segments:' || user_id))`.
      3. Si el usuario ya no existe en `app_users`, termina sin hacer nada.
      4. Corre `build_segments(conn, "prototype", user_id)`.
      5. Registra el tiempo con `log.info`.
    - Cualquier error se registra con `log.warning` y no se propaga.
  - **Rendimiento:**
    - `load_segment_rules` queda en caché por ruta y `mtime` del archivo.
    - `user_metrics(conn, source, user_id)` filtra por usuario en SQL cuando recibe `user_id`, con el mismo resultado que hoy. El test de hoy `test_a_single_user_recalculation_touches_only_that_user` sigue en verde.
    - Meta: recalcular una persona en menos de 300 ms en `rappi_ia_test`. El informe registra la medición.

- [ ] **Step 1: Tests:**
  - **Marca del complemento:**
    - `test_complement_prefers_the_brand_you_buy`: dos candidatos del concepto destino, uno de la marca B (comprada en 2 pedidos); B va primero y `reason.text` la nombra.
    - `test_complement_without_bought_brand_is_unchanged`.
  - **Recálculo después de un pedido:**
    - `test_order_recalculates_that_users_segments`: `TestClient` corre la tarea al terminar la respuesta, y `user_segments` del usuario cambia.
    - `test_two_orders_in_a_row_do_not_collide` (Review Focus 2).
    - `test_recalculation_after_forget_restores_nothing`: llamar la función después de `events.forget` no crea filas.
    - `test_recalculation_error_does_not_break_the_order`: un connector que falla deja el pedido en 200 y registra un aviso.
  - **Reglas de segmentos:**
    - `test_segment_rules_are_cached`.
- [ ] **Step 2: Correr y ver que fallan; implementar hasta verde.**
- [ ] **Step 3: Verificar.** Comando: `make test && make lint`. Anotar en el informe el tiempo de un recálculo.
- [ ] **Step 4: Commit.** Mensaje: `feat: el complemento prefiere tu marca y los segmentos se recalculan después de cada pedido`.

### Task 5: Hecho cuando — dos personas, ofertas distintas y rastreables

**Files:**
- Test: `rappi-ia/tests/integration/test_personalization_done.py`

**Interfaces:**
- Consumes: Tasks 1-4 a través de la API (`POST /events`, `POST /orders`, `POST /agent/offer`, `GET /agent/plans`).

- [ ] **Step 1: Test `test_two_users_with_different_histories_get_different_offers`.** Prepara dos usuarios `prototype` solo a través de la API:
  - `u-dulce`: busca y pide chocolates y galletas, dos veces de la misma marca.
  - `u-asado`: busca y pide carne y carbón.

  Comprueba:
  - `vertical_por_probar` difiere entre los dos.
  - El primer ítem de `/agent/plans` difiere.
  - Cada `reason.text` nombra un concepto de la historia de esa persona, y cada `reason.basis` contiene una señal con `source` `eventos`, `segmento:…` o `pedidos` cuyo id está en su historia (rastreable).
  - Para `u-dulce`, si su marca aparece entre los candidatos del complemento, va primero.
- [ ] **Step 2: Correr.** Esperado: PASS con Tasks 1-4. Si falla, el arreglo va en la tarea que corresponde y el informe dice cuál.
- [ ] **Step 3: Commit.** Mensaje: `test: dos personas con historias distintas reciben ofertas distintas y rastreables`.

### Task 6: La búsqueda no se personaliza (guardia con test)

**Files:**
- Test: `rappi-ia/tests/integration/test_search_not_personal.py`

- [ ] **Step 1: Tests**, con las dos personas del test de la Task 5 (comparte un helper o fixture; si duplica la preparación, la saca a un helper del módulo de tests):
  - `test_search_results_do_not_depend_on_history`: `/search?q=chocolate` y `?q=carne` dan los mismos resultados para todos. `/search` no recibe usuario, así que el test además fija que la firma de la ruta no acepte `user_id`.
  - `test_ask_products_do_not_depend_on_history`: `/agent/ask` con «chocolate» y «carne» devuelve los mismos `products` para `u-dulce`, `u-asado` y un usuario nuevo. El texto puede diferir; los productos no.
- [ ] **Step 2: Correr.** Esperado: PASS. Si falla, hay personalización escondida: corregir en la fuente.
- [ ] **Step 3: Commit.** Mensaje: `test: la búsqueda no depende de la historia de la persona`.

### Task 7: La app muestra «¿Por qué?» y pide las ocasiones por persona; «Olvidar» espera lo que está en vuelo

**Files:**
- Create: `prototipo-app/src/components/assistant/OfferWhy.jsx` (+ test)
- Modify:
  - Ofertas: `prototipo-app/src/api/agent.js` (`plans(userId)`), los lugares donde se muestra una oferta (`screens/home/live/LiveHomeFeed.jsx`, `CheckoutSuggestion.jsx`, `screens/tracking/TrackingScreen.jsx`, `SearchSections.jsx`, `AssistantPanel.jsx`) y la lista de ocasiones de la Home.
  - «Olvidar»: `prototipo-app/src/game/saver.js` (`cancel()`), `prototipo-app/src/state/GameContext.jsx` (`settle()`), `prototipo-app/src/api/orders.js` (`trackOrder` y `ordersSettled()`), `screens/checkout/CheckoutScreen.jsx` y `components/assistant/AssistantPanel.jsx` (`forgetAll`).
- Test: los `.test.jsx` de esos componentes, `saver.test.js`, `GameContext.test.jsx`, `AssistantPanel.test.jsx`.

**Interfaces:**
- **Ofertas:**
  - Consumes: `reason.text` y `reason.basis` (Task 2), y `GET /agent/plans?user_id=` (Task 3).
  - Produces: `OfferWhy({ reason })`.
    - Pinta un botón «¿Por qué?» que despliega `reason.text`.
    - Si `reason.text` falta, no pinta nada.
    - Va en toda oferta del agente que hoy se muestra.
  - `plans()` pasa `userId()`. Si una ocasión trae `reason`, la Home muestra la etiqueta «Para ti».
- **«Olvidar»:**
  - Produces: `saver.cancel() -> Promise<void>`. Descarta lo que está en cola y resuelve cuando termina el envío en vuelo, si lo hay.
  - Produces: `GameContext.settle()`. Llama a `saver.cancel()`.
  - Produces: `ordersSettled() -> Promise<void>`. Resuelve cuando terminan los pedidos en vuelo; `CheckoutScreen` envía cada pedido a través de `trackOrder`.
  - `forgetAll` espera, antes del `DELETE`:
    1. `game.settle()`;
    2. `ordersSettled()`;
    3. lo que ya espera hoy.

- [ ] **Step 1: Tests:**
  - **«¿Por qué?»:**
    - `OfferWhy`: `shows the reason on tap`, `renders nothing without text`.
    - En cada superficie de oferta, `the offer has ¿Por qué?`, con las respuestas de ejemplo.
  - **Ocasiones:**
    - `plans sends the user and shows Para ti for occasions with a reason`, con la respuesta de ejemplo `agent-plans-afin`.
  - **«Olvidar»** (Review Focus 3):
    - `saver.cancel drops the queued state and waits for the one in flight`.
    - `Olvidar waits for a game save in flight and sends nothing after DELETE`.
    - `Olvidar waits for an order in flight`.
- [ ] **Step 2: Correr y ver que fallan; implementar hasta verde.**
- [ ] **Step 3: Verificar.** Comando: `npm test && npm run lint` en prototipo-app.
- [ ] **Step 4: Commit.** Mensaje: `feat: la app muestra por qué de cada oferta y «Olvidar» espera lo que está en vuelo`.

### Task 8: Recorrido de punta a punta y documentación

**Files:**
- Modify:
  - `scripts/mvp-check.sh` / `prototipo-app/scripts/mvp-check.mjs`: la revisión de la compra suma «¿Por qué?» en la oferta del carro.
  - Documentación: `docs/capa-de-datos.md` (los segmentos ahora se leen para ofrecer, nunca los sensibles), `docs/decisiones.md` (una fila con fecha 10-10-2026), `docs/demo.md` (cómo ver dos personas distintas), `README.md` y `CLAUDE.md` (una línea).

- [ ] **Step 1:** La revisión de la compra en `mvp-check` toca «¿Por qué?» en la oferta del carro y ve el texto. Esperado: 6 de 6.
- [ ] **Step 2: Documentación.**
  - Qué señales se usan: eventos, segmentos no sensibles y marcas con 2 o más pedidos.
  - Qué no se usa nunca: segmentos sensibles, alcohol, salud y bebé, y la búsqueda.
  - Cuándo se recalculan los segmentos: después de cada pedido, solo esa persona, en segundo plano, y además el domingo.
  - Qué es `reason`.
  - Que los umbrales siguen calibrados con datos simulados.
- [ ] **Step 3: Verificar.** Comandos: `make test` y `make lint` (rappi-ia), `npm test` y `npm run lint` (prototipo-app y dashboard-empresa), y `make mvp-check` → 6 de 6.
- [ ] **Step 4: Commit.** Mensaje: `docs: etapa 5 del MVP, personalización con la capa`.
