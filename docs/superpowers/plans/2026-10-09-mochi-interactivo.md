# Mochi interactivo y momentos clave: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mochi acompaña fuera de la Home (flotante, con menú, silenciable) y aparece en tres momentos clave (sin resultados, pedido en camino, antes de pagar), más una guía de la primera vez.

**Architecture:** Un componente nuevo `MochiPresence` montado en `App.jsx` (solo en el prototipo final) que reutiliza `Mascot` y se comunica con el carrito por un evento de ventana, como `REPLAY_EVENT`. Los momentos clave son piezas chicas dentro de pantallas que ya existen (resultados de búsqueda, mapa, aviso del juego, checkout) y reutilizan la lógica de sugerencias que ya hay (`tagsOf`, `discoveryFor`, eventos de sugerencias).

**Tech Stack:** React 19 + Vite, Vitest + Testing Library (jsdom), CSS plano.

**Spec:** `docs/superpowers/specs/2026-10-09-mochi-interactivo-design.md`

## Global Constraints

- Solo en el prototipo final (`useDemo().isFinal`); «Rappi hoy» no cambia en nada.
- Código en inglés; todo lo que ve el usuario en español. Comentarios en español, como el resto del prototipo.
- Nunca sugerir por iniciativa propia lo sensible: `NEVER_SUGGESTED` (`farmacia`, `bebe`) de `screens/home/live/script.js`; alcohol solo con su aviso +18 (`product.ageRestricted`).
- Lo que se guarda en el navegador es comodidad por persona (lado de Mochi, silencio del día, guía vista), con `try/catch` y claves `rappi-proto-…`.
- «Reducir movimiento» del sistema: sin animaciones, todo sigue funcionando.
- Cada tarea: test que falla primero, `npm test` y `npm run lint` en verde (en `prototipo-app/`).
- Un PR por etapa (2, 3 y 4), cada uno revisado por el usuario antes de fusionar.

## Review Focus

1. Mochi flotante encima de algo tocable (barra del carrito, aviso, «+» de un producto) a 375 px de ancho: no debe tapar botones.
2. Silencio que no se respeta: después de «Silenciar por hoy» o de cerrar dos globos seguidos, ningún globo por iniciativa propia (la confirmación del carrito incluida).
3. Mantener presionado una tarjeta en el celular no debe disparar también el toque (abrir la hoja) ni bloquear el scroll.
4. Sugerencia del checkout que repite algo que ya está en el carro, o que propone algo sensible.
5. La guía y el saludo pisándose, o la guía reapareciendo después de «Saltar».

---

## Etapa 2 · Mochi interactivo (PR 1)

### Task 1: `MochiPresence`: dónde aparece, lado y menú

**Files:**
- Create: `prototipo-app/src/components/assistant/MochiPresence.jsx`, `prototipo-app/src/components/assistant/mochi-presence.css`
- Create: `prototipo-app/src/components/assistant/MochiPresence.test.jsx`
- Modify: `prototipo-app/src/App.jsx` (montarlo junto a `CartBar`), `prototipo-app/src/styles/tokens.css` (`--z-mochi: 37`, entre el aviso y el panel)

**Interfaces:**
- Produces: `MochiPresence({ screen, homeTab, push, raised })` — `screen` es `current.name`; `raised` = la pantalla tiene barra inferior (`SCREENS_WITH_NAV`).
- Produces: `MOCHI_HIDDEN_SCREENS = new Set(['checkout', 'tracking', 'game'])` (más la pestaña Home de `home`) exportado desde `MochiPresence.jsx`.
- Produces: `SIDE_KEY = 'rappi-proto-mochi-lado'` (`'left' | 'right'`, por defecto `'right'`).

- [ ] **Step 1: Tests que fallan** en `MochiPresence.test.jsx` (con `DemoProvider` en `final`, `AssistantProvider`, `CartProvider`; ver los providers de `LiveHomeFeed.test.jsx`):
  - `'aparece en una vertical y no en la Home, el checkout, el seguimiento ni el juego'`: `screen: 'vertical'` → hay `button[name="Mochi: ayuda y opciones"]`; con `'home'`+`homeTab: 'home'`, `'checkout'`, `'tracking'`, `'game'` → no.
  - `'en las otras pestañas de la Home sí aparece'`: `screen: 'home'`, `homeTab: 'offers'` → aparece.
  - `'en «Rappi hoy» no aparece'` (modo `actual`).
  - `'con el buscador con Mochi abierto no aparece'`.
  - `'tocarlo salta y abre el menú con sus 4 opciones; Escape lo cierra'` (clase `mascot--jump`): botones «Buscar con Mochi», «¿Qué puedo probar?» (carro vacío), «Mover a la izquierda», «Silenciar por hoy»; `aria-expanded="true"`; Escape → menú cerrado y foco en Mochi.
  - `'con carro, la segunda opción es revisarlo con el total'`: texto `Revisar mi carrito · $X` con `formatPrice(cart.total)`.
  - `'«Mover a la izquierda» lo cambia de lado y lo recuerda'`: clase `is-left` y `localStorage[SIDE_KEY] === 'left'`; al volver a montar sigue a la izquierda.
  - `'«Buscar con Mochi» abre el buscador'`: `useAssistant().isOpen` pasa a `true`.
- [ ] **Step 2: Correrlos** — `npx vitest run src/components/assistant/MochiPresence.test.jsx` → FAIL (no existe el módulo).
- [ ] **Step 3: Implementar.** Al tocarlo salta (mood `jump` 900 ms, como en la Home). Mochi (`<Mascot size={68} mood=… />`) dentro de un `button.mochi-presence-body` con `aria-label="Mochi: ayuda y opciones"`, `aria-expanded`. Menú `div.mochi-popover[role=group][aria-label="Opciones de Mochi"]`; cerrar con Escape (foco vuelve al botón) o `pointerdown` fuera. «¿Qué puedo probar?» llama `assistant.open({ query: 'Muéstrame algo nuevo para probar' })`; «Revisar mi carrito» hace clic en `.cart-bar` si existe. Posición solo con CSS: `position: absolute; right|left: 12px; bottom` según clases `has-cart` (`cart.count > 0`) y `is-raised`: 28 / 92 (carro) / 100 (barra) / 164 px (ambos) + `env(safe-area-inset-bottom)`. Al hacer scroll dentro de `.phone` (listener `scroll` en captura) se achica a 54 px (`is-small`) y vuelve a los 750 ms. Movimiento con `@media (prefers-reduced-motion: no-preference)`.
- [ ] **Step 4: Correrlos** → PASS. `npm test` y `npm run lint` en verde.
- [ ] **Step 5: Arrastrar para cambiar de lado.** Test `'arrastrarlo más allá de la mitad del teléfono lo deja en ese lado'` (pointerdown → pointermove 8+ px → pointerup con `clientX` en la otra mitad; `getBoundingClientRect` de `.phone` simulado). Implementar con `setPointerCapture`; un arrastre no abre el menú. PASS.
- [ ] **Step 6: Commit** — `feat: Mochi flotante fuera de la Home, con menú y lado`

### Task 2: Silenciar por hoy y callarse si lo ignoran

**Files:**
- Modify: `MochiPresence.jsx`, `mochi-presence.css`, `MochiPresence.test.jsx`
- Create: `prototipo-app/src/state/mochiQuiet.js` (+ `mochiQuiet.test.js`)

**Interfaces:**
- Produces (`mochiQuiet.js`): `QUIET_KEY = 'rappi-proto-mochi-silencio'`; `isQuiet(today: string): boolean`; `quietToday(today: string): void`; `wake(): void`; `noteDismissed(): void` y `noteEngaged(): void` (dos cierres seguidos → callado el resto de la sesión, en memoria del módulo); `resetQuiet(): void` (lo llama `resetLive`).
- Consumes: `today()` de `src/game/progress.js` (fecha `AAAA-MM-DD`).

- [ ] **Step 1: Tests que fallan** — `mochiQuiet.test.js`: `'silenciado hoy, mañana vuelve'`, `'dos cierres seguidos lo callan; tocar algo entre medio no'`, `'resetQuiet lo despierta'`. `MochiPresence.test.jsx`: `'«Silenciar por hoy» lo deja como pestañita y tocarla lo despierta'` (clase `is-quiet`, `aria-label="Mochi está en silencio: tocar para despertarlo"`).
- [ ] **Step 2: Correrlos** → FAIL.
- [ ] **Step 3: Implementar** `mochiQuiet.js` (localStorage con try/catch; la racha de cierres en una variable del módulo) y la pestañita (`is-quiet`: 28 px asomando del borde, sin globos). `resetLive()` en `state/liveMemory.js` llama `resetQuiet()`.
- [ ] **Step 4: Correrlos** → PASS; suite y lint en verde.
- [ ] **Step 5: Commit** — `feat: Mochi se puede silenciar por hoy y se calla si lo ignoran`

### Task 3: Confirmación al agregar al carro, con «Deshacer»

**Files:**
- Modify: `prototipo-app/src/hooks/useAddToCart.js`, `prototipo-app/src/state/liveMemory.js`, `MochiPresence.jsx`, tests de ambos

**Interfaces:**
- Produces (`liveMemory.js`): `MOCHI_CART_EVENT = 'mochi-carrito'`; detalle `{ product }`.
- Consumes: `isQuiet`, `noteDismissed`, `noteEngaged` (Task 2); `useAddToCart().remove`.

- [ ] **Step 1: Tests que fallan** — en `components/AddButton.extra.test.jsx`: `'en el prototipo final, agregar avisa a Mochi'` (escucha `MOCHI_CART_EVENT` en `window`, recibe el producto); `'en «Rappi hoy» no'`. En `MochiPresence.test.jsx`: `'al agregar dice «¡Listo! … está en tu carrito» y se va a los 4 s'`; `'«Deshacer» quita el producto'`; `'silenciado no dice nada'`; `'cerrar el globo cuenta como ignorarlo'` (dos veces → callado).
- [ ] **Step 2: Correrlos** → FAIL.
- [ ] **Step 3: Implementar.** En `add` de `useAddToCart`, junto a `rememberAdded`: `window.dispatchEvent(new CustomEvent(MOCHI_CART_EVENT, { detail: { product: item } }))`. En `MochiPresence`, el globo `div.mochi-bubble[role=status]` con texto, «Deshacer» y «×» (`aria-label="Cerrar"`), 4000 ms; mood `jump` al aparecer. No sugiere nada: la sugerencia sigue en la Home al volver. Los comentarios de `useAddToCart.js` que dicen «no hay aviso» se ajustan.
- [ ] **Step 4: Correrlos** → PASS; suite y lint.
- [ ] **Step 5: Commit** — `feat: Mochi confirma lo agregado al carro con «Deshacer»`

### Task 4: Preguntarle a Mochi por un producto

**Files:**
- Modify: `prototipo-app/src/components/ProductCard.jsx`, `prototipo-app/src/components/product-card.css`, `prototipo-app/src/components/ProductCard.test.jsx`, `MochiPresence.jsx`
- Create: `prototipo-app/src/hooks/useLongPress.js` (+ `useLongPress.test.jsx`)

**Interfaces:**
- Produces: `useLongPress(onLongPress, { ms = 500 }) → { handlers, fired: () => boolean }` — `handlers` = `onPointerDown/Up/Leave/Cancel/Move` (se cancela si el dedo se mueve más de 10 px: es scroll) y `onContextMenu` (evita el menú del sistema mientras se mantiene). `fired()` dice si el último toque fue largo, para que el `onClick` no abra la hoja.
- Produces: `askAbout(product) → query string` = `` `¿Con qué acompaño ${product.name}?` `` (exportada desde `MochiPresence.jsx`, la usan la tarjeta y el soltar).
- Produces: `MOCHI_DRAG_TYPE = 'application/x-mochi-producto'`.

- [ ] **Step 1: Tests que fallan** — `useLongPress.test.jsx`: `'500 ms quieto dispara; moverse 10 px no; soltar antes no'`. `ProductCard.test.jsx`: `'mantener presionado muestra «Preguntarle a Mochi» y no abre la hoja'`; `'«Preguntarle a Mochi» abre el buscador con «¿Con qué acompaño …?»'`; `'en «Rappi hoy» mantener presionado no hace nada'`. `MochiPresence.test.jsx`: `'soltar una tarjeta sobre Mochi pregunta por ese producto'` (evento `drop` con `dataTransfer.getData(MOCHI_DRAG_TYPE)` = JSON del producto).
- [ ] **Step 2: Correrlos** → FAIL.
- [ ] **Step 3: Implementar.** En `ProductCard`, solo con `isFinal`: el botón principal suma `handlers` y `draggable` (escritorio) con `onDragStart` que guarda el producto en `MOCHI_DRAG_TYPE`; tras el toque largo aparece `button.product-ask` «Preguntarle a Mochi» sobre la tarjeta (se va al tocar fuera o a los 3 s). `MochiPresence` acepta `onDragOver` / `onDrop` solo si el tipo es `MOCHI_DRAG_TYPE` y muestra «Acércamelo y lo vemos juntos» mientras se arrastra.
- [ ] **Step 4: Correrlos** → PASS; suite y lint.
- [ ] **Step 5: Verificar en el navegador** (servidor `prototipo-mochi`, 375 × 812 y escritorio): aparece y desaparece donde corresponde, no tapa el «+» ni la barra del carrito, menú con teclado, arrastre, silencio, confirmación con «Deshacer», toque largo con scroll. Capturas en el scratchpad.
- [ ] **Step 6: Commit** — `feat: preguntarle a Mochi por un producto (mantener presionado o arrastrar)`

### Task 5: Cierre de la etapa 2

- [ ] README del prototipo (sección del prototipo final: Mochi flotante), fila en `docs/decisiones.md` (confirmación al agregar en vez de «sin aviso»), capturas (`npm run screenshots`, con el servidor de vista previa detenido; solo se guardan las que cambian de verdad).
- [ ] Revisión de la rama con un revisor nuevo (Opus); arreglos con test que falla primero.
- [ ] PR «Mochi interactivo» con CI en verde; prototipo del escritorio actualizado (el anterior a la Papelera). **No se fusiona sin el usuario.**

---

## Etapa 3 · Momentos clave (PR 2, desde `main` con la etapa 2 fusionada)

### Task 6: Mochi en «sin resultados»

**Files:**
- Create: `prototipo-app/src/assistant/emptySearch.js` (+ `emptySearch.test.js`)
- Modify: `prototipo-app/src/components/search/SearchSections.jsx`, `prototipo-app/src/components/search/search.css`, `prototipo-app/src/components/assistant/AssistantPanel.jsx` (le pasa `push`), su test

**Interfaces:**
- Produces: `emptySearch(query) → { tag, label, emoji, vertical, verticalName } | null` — primer tema de `tagsOf(query)` que no esté en `NEVER_SUGGESTED`, con la vertical donde más aparece (`productsForTags`/`storesForTags`, como `itemsFor` de `script.js`; mover `mostCommon` a un lugar compartido si se reutiliza).
- Consumes: `routeForScreen` de `data/verticals.js`.

- [ ] **Step 1: Tests que fallan** — `emptySearch.test.js`: `'«chela» lleva a la vertical con más cerveza'`; `'algo de farmacia nunca se ofrece'`; `'una palabra sin tema da null'`. `AssistantPanel.test.jsx`: `'sin resultados, Mochi ofrece la vertical que sí lo tiene'` (texto `Aquí no hay «…», pero en … sí` y botón `Ver en …` → `push(...routeForScreen(vertical))`); `'sin tema, Mochi lo dice y ofrece otra búsqueda'` (botón «Probar otra búsqueda» deja el campo vacío y con foco). `'en «Rappi hoy» sigue el texto de siempre'`.
- [ ] **Step 2: Correrlos** → FAIL.
- [ ] **Step 3: Implementar** `emptySearch` y, en `SearchResults`, si `isEmpty` y hay `onMochi` (solo lo pasa el buscador del prototipo final): `<Mascot size={56} mood="listen" />` con el texto y la acción. «Rappi hoy» conserva «No results for …».
- [ ] **Step 4: Correrlos** → PASS; suite y lint.
- [ ] **Step 5: Commit** — `feat: sin resultados, Mochi lleva a la vertical que sí lo tiene`

### Task 7: Mochi sigue el pedido

**Files:**
- Modify: `prototipo-app/src/screens/tracking/TrackingMap.jsx`, `TrackingMap.test.jsx`, `TrackingScreen.jsx`, `prototipo-app/src/screens/game/OrderBanner.jsx`, su test (`order.test.jsx`)

**Interfaces:**
- Produces: `TrackingMap({ progress, delivered, step })`; `poseFor({ step, progress, delivered }) → { x: 0 | -1, y: 0 | -1, almost: boolean }` exportada desde `TrackingMap.jsx`: preparando (`step <= 1`) → tímido `(0, -1)`; en camino → frontal `(0, 0)`; `progress >= 0.8` o entregado → feliz `(-1, 0)`; `almost` = en camino con `progress >= 0.8`.

- [ ] **Step 1: Tests que fallan** — `TrackingMap.test.jsx`: `'preparando, Mochi está tímido'` (`image` con `y="-1"`), `'al final de la ruta dice «¡Ya casi!»'` (texto en el mapa), `'entregado, feliz y sin «¡Ya casi!»'`. `order.test.jsx`: `'cuando llega el pedido, Mochi salta en el aviso del juego'` (`.game-order .mochi.mascot--jump`).
- [ ] **Step 2: Correrlos** → FAIL.
- [ ] **Step 3: Implementar** `poseFor`, el `y` del `<image>`, un globo SVG («¡Ya casi!») sobre Mochi y `<Mascot size={28} mood="jump" />` en el aviso de llegada.
- [ ] **Step 4: Correrlos** → PASS; suite y lint.
- [ ] **Step 5: Commit** — `feat: Mochi sigue el pedido con su pose y avisa al llegar`

### Task 8: «¿Te falta algo?» antes de pagar

**Files:**
- Create: `prototipo-app/src/screens/checkout/CheckoutSuggestion.jsx` (+ `CheckoutSuggestion.test.jsx`), estilos en `checkout.css`
- Modify: `prototipo-app/src/screens/checkout/CheckoutScreen.jsx` (bajo «Your order», solo con `isFinal`)

**Interfaces:**
- Produces: `checkoutSuggestion(items) → { from: { label, emoji }, to: { label, emoji, vertical, verticalName }, product } | null` — para cada línea del carro, `productTags` → primer tema con `discoveryFor({ tag, vertical })`; el producto es el primer `items[].product` de esa sugerencia que no esté ya en el carro (`lineKey`).
- Consumes: `discoveryFor` (`screens/home/live/script.js`), `useAddToCart` (con `fromSuggestion: true`, `suggestionOrigin: 'checkout'`), `firstShowing` + `events.track('suggestion_shown', …)` como en `useAddToCart`.

- [ ] **Step 1: Tests que fallan** — `'con cerveza en el carro sugiere un snack de otra vertical, con la razón'` (`Llevas 🍺 Cerveza → 🍿 Snacks`); `'agregarla la suma al carro con «Deshacer», que la quita'`; `'nunca sugiere algo que ya está en el carro'`; `'con solo productos de farmacia no sugiere nada'`; `'mostrarla registra suggestion_shown con origen checkout una vez'`; `'en «Rappi hoy» no aparece'`.
- [ ] **Step 2: Correrlos** → FAIL.
- [ ] **Step 3: Implementar** la tarjeta (`<Mascot size={40} badge mood="wave" />`, razón, producto con su precio y +18 si corresponde, «Agregar» / «Deshacer»).
- [ ] **Step 4: Correrlos** → PASS; suite y lint.
- [ ] **Step 5: Commit** — `feat: antes de pagar, Mochi sugiere una cosa de otra vertical`

### Task 9: Cierre de la etapa 3

- [ ] README, `docs/demo.md` (pasos nuevos), fila en `docs/decisiones.md`, capturas; navegador a 375 px; revisor nuevo; PR «Mochi en los momentos clave» con CI en verde; escritorio actualizado. **No se fusiona sin el usuario.**

---

## Etapa 4 · Guía de la primera vez (PR 3)

### Task 10: Guía de 3 pasos

**Files:**
- Modify: `prototipo-app/src/screens/home/live/LiveHomeFeed.jsx`, `LiveHomeFeed.test.jsx`, `prototipo-app/src/state/liveMemory.js`

**Interfaces:**
- Produces (`liveMemory.js`): `TOUR_KEY = 'rappi-proto-guia-vista'`; `resetLive()` la borra.
- Consumes: `speak(say, target, holdMs)` de `LiveHomeFeed` (con `actions`), bloques `'passport'`.

- [ ] **Step 1: Tests que fallan** — `'la primera vez, después del saludo, Mochi muestra el buscador, el pasaporte y «Jugar»'` (tres frases en orden con «Siguiente»; la 2.ª y 3.ª paradas en el bloque `passport`); `'«Saltar» la termina y no vuelve'` (al montar de nuevo, solo el saludo); `'la segunda visita no la muestra'`; `'«Repetir escena» la vuelve a mostrar'`; `'con «reducir movimiento» también funciona'`.
- [ ] **Step 2: Correrlos** → FAIL.
- [ ] **Step 3: Implementar** en `LiveHomeFeed`: al terminar el saludo (`T.greet`), si no está `TOUR_KEY`, los 3 pasos con `speak` y `actions` [«Siguiente» / «Listo», «Saltar»]; el último paso o «Saltar» guardan `TOUR_KEY`. Mientras dura la guía no corre nada «al volver» ni los gestos de espera.
- [ ] **Step 4: Correrlos** → PASS; suite y lint.
- [ ] **Step 5: Commit** — `feat: guía de la primera vez con Mochi`

### Task 11: Cierre de la etapa 4

- [ ] README y `docs/demo.md`, capturas, navegador, revisor nuevo, PR «Guía de la primera vez» con CI en verde, escritorio actualizado. **No se fusiona sin el usuario.**
