# Juego de verticales dentro del prototipo final: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar el juego de verticales (`~/rappi-juego-verticales`) al prototipo final como pantalla `game`, con un solo pasaporte (el del juego) y una ronda ofrecida mientras llega el pedido.

**Architecture:** La lógica pura del juego se copia a `prototipo-app/src/game/` y gana `visited` (vertical abierta en la app = Explorador). Un `GameProvider` montado en `App` es la única fuente del pasaporte: la Home, Bigotes y el seguimiento lo leen. Las pantallas del juego viven en `src/screens/game/` bajo una raíz `.game` con su propia pila de pestañas.

**Tech Stack:** React 19, Vite 8, vitest + Testing Library, `@phosphor-icons/react` (nuevo), `vite-plugin-singlefile` para el HTML del escritorio.

**Spec:** [docs/superpowers/specs/2026-10-09-juego-en-prototipo-design.md](../specs/2026-10-09-juego-en-prototipo-design.md)

## Global Constraints

- Código en inglés; todo lo visible en español. Sin conceptos sensibles en ninguna parte (el `verticales.json` ya viene filtrado).
- Pasaporte: las 8 verticales del juego en `DATA.order`; sello = nivel `explorador` o más; envío gratis con 4 sellos (`PASSPORT_GOAL = 4`); `visited` inicial = `['restaurantes', 'supermercado']`.
- Farmacia (`farmacia`) jugable, nunca propuesta por Bigotes ni por la tarjeta del seguimiento.
- Clave del navegador `rappi-proto-juego-v1`; traspaso único desde `rappi-proto-pasaporte`; sin almacenamiento, todo sigue en memoria.
- Solo en modo «Prototipo final» (`demo.isFinal`).
- `npm test`, `npm run lint`, `npm run build` en `prototipo-app/` antes de cerrar cada tarea.
- Rama `feat/juego-en-prototipo` (apilada sobre `feat/prototipo-final`); no fusionar.

## Review Focus

1. Progreso guardado roto, con `visited` raro o con el pasaporte viejo en formato inesperado: el juego debe cargar sin romper la Home.
2. Volver del juego con el gesto o la flecha del navegador y con el buscador con Bigotes abierto: se vuelve a la pantalla de antes.
3. Pedido que llega antes de empezar la ronda u `orderId` que ya no existe: la tarjeta desaparece y la franja no se muestra.
4. Todo sellado salvo Farmacia, o todo en Experto: la tarjeta del seguimiento elige bien o no aparece.
5. «Repetir escena» con el juego abierto: el juego queda en cero sin quedar a medio estado.

---

### Task 1: Lógica y datos del juego con `visited` y el traspaso

**Files:**
- Create: `prototipo-app/src/game/{data,facts,challenges,progress,round,rng,storage}.js` (copia de `~/rappi-juego-verticales/src/game/`), `prototipo-app/src/game/verticals.js`, `prototipo-app/src/data/verticales.json`, `prototipo-app/scripts/extraer-datos.mjs`, `prototipo-app/src/game/testSeed.js` (de `src/test/seed.js`)
- Copy tests: `prototipo-app/src/game/*.test.js` (los 6 del juego)
- Modify: `prototipo-app/vite.config.js` (`test.env.TZ = 'America/Santiago'`), `prototipo-app/package.json` (script `datos`)
- Test: `prototipo-app/src/game/passport.test.js` (nuevo)

**Interfaces:**
- Produces (`verticals.js`): `GAME_TO_SCREEN` (`{supermercado:'grocery', conveniencia:'express', turbo:'turbo', licores:'liquor', chocolateria:'chocolates', restaurantes:'restaurants', farmacia:'pharmacy', mall:'retail'}`), `SCREEN_TO_GAME` (inverso), `NEVER_PUSHED = new Set(['farmacia'])`, `PASSPORT_GOAL = 4`, `STARTER = ['restaurantes', 'supermercado']`.
- Produces (`progress.js`): `initialState()` con `visited: [...STARTER]`; `visit(state, vertical) → { state, isNew }` (isNew = pasó de `ninguno` a sellada); `verticalLevel` cuenta `visited` como `explorador`; `stampedVerticals(state) → string[]` (ids del juego en `DATA.order`); `waitingRoundVertical(state) → { vertical, isNew } | null` (primera sin sello fuera de `NEVER_PUSHED`; si no hay, la de menor nivel y en empate la primera; `null` si todas las elegibles están en `experto`).
- Produces (`storage.js`): `KEY = 'rappi-proto-juego-v1'`, `LEGACY_PASSPORT_KEY = 'rappi-proto-pasaporte'`; `load(storage)` acepta `visited` opcional (array de strings de `DATA.order`, lo demás se descarta) y, sin `KEY`, toma el pasaporte viejo (ids de pantalla válidos → ids del juego) como `visited`.

- [ ] **Step 1: Copiar la lógica, los datos, el script y sus tests; agregar TZ y el script `datos`; correr los tests copiados**
  Run: `cd prototipo-app && npx vitest run src/game` — Expected: PASS (los 6 archivos del juego).
- [ ] **Step 2: Escribir `passport.test.js` (falla)**

```js
test('arranca con Restaurantes y Súper selladas', () => {
  expect(stampedVerticals(initialState())).toEqual(['supermercado', 'restaurantes'])
})
test('abrir una vertical en la app la deja en Explorador, una sola vez', () => {
  const { state, isNew } = visit(initialState(), 'turbo')
  expect(isNew).toBe(true)
  expect(verticalLevel(state, 'turbo')).toBe('explorador')
  expect(visit(state, 'turbo').isNew).toBe(false)
})
test('la ronda de la espera nunca es Farmacia; con todo sellado, la de menor nivel', () => {
  expect(waitingRoundVertical(initialState())).toEqual({ vertical: 'conveniencia', isNew: true })
  const all = DATA.order.reduce((s, v) => visit(s, v).state, initialState())
  expect(waitingRoundVertical(all)).toEqual({ vertical: 'supermercado', isNew: false })
})
test('traspasa el pasaporte viejo una vez y tolera basura', () => {
  const storage = memoryStorage({ 'rappi-proto-pasaporte': '["grocery","liquor","pet","x"]' })
  expect(load(storage).visited.sort()).toEqual(['licores', 'supermercado'])
  expect(load(memoryStorage({ 'rappi-proto-juego-v1': '{"version":1,"visited":"no"}' }))).toEqual(initialState())
})
```

  Run: `npx vitest run src/game/passport.test.js` — Expected: FAIL (`visit` no existe).
- [ ] **Step 3: Implementar `verticals.js`, `visit`, `stampedVerticals`, `waitingRoundVertical`, `visited` en `verticalLevel`/`initialState`, y el traspaso en `storage.load`**
- [ ] **Step 4: Correr** `npx vitest run src/game` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(juego): lógica del juego en el prototipo con un solo pasaporte`

### Task 2: Pantallas del juego como pantalla `game`

**Files:**
- Create: `prototipo-app/src/screens/game/` (`GameScreen.jsx`, `Path.jsx`, `Round.jsx`, `Passport.jsx`, `Album.jsx`, `Vertical.jsx`, `Concept.jsx`, `Settings.jsx`, `GameTabs.jsx` (de `BottomNav`), `Intro.jsx`, `Hud.jsx`, `Stamp.jsx`, `FactCard.jsx`, `MapView.jsx`, `GameSheet.jsx` (de `Sheet`), `GameToast.jsx` (de `Toast`), sus CSS y `game.css` con los tokens del juego bajo `.game`), `prototipo-app/src/state/GameContext.jsx`
- Copy tests: `prototipo-app/src/screens/game/{path,play,flow,collection}.test.jsx`, `prototipo-app/src/state/GameContext.test.jsx`
- Modify: `prototipo-app/src/App.jsx` (`GameProvider`; `SCREENS.game` lazy; `game` en `SCREENS_WITHOUT_CART`), `prototipo-app/package.json` (`@phosphor-icons/react`)

**Interfaces:**
- Consumes: Task 1.
- Produces: `useGame()` con `state`, `discover`, `answer`, `openCard`, `seeIntro`, `visit(screenId) → isNew`, `reset()`; `GameScreen({ back, push, params })` con `params = { tab?: 'jugar'|'pasaporte'|'album', vertical?: gameId, round?: gameId, orderId?: string }` (`vertical` abre su hoja con «Jugar» y «Abrir {vertical}»; `round` arranca la ronda directo); la flecha de arriba y salir de la ronda directa llaman `back()`.
- Estilos: sin `*`/`html`/`body`/`.stage`/`.phone`/`StatusBar`/`Mascot` del juego (se usa `components/assistant/Mascot`); clases renombradas `screen→game-screen`, `sheet→game-sheet`, `sheet-backdrop→game-sheet-backdrop`, `toast→game-toast`, `bottom-nav→game-tabs`; cada regla del juego prefijada con `.game `.

- [ ] **Step 1: Copiar y adaptar los tests de pantallas para que rendericen `GameScreen` con `GameProvider` (helper `renderGame(params)`); agregar en `flow.test.jsx`:**

```js
test('la flecha de arriba sale del juego', () => {
  const back = vi.fn(); renderGame({ tab: 'jugar' }, { back })
  fireEvent.click(screen.getByRole('button', { name: 'Volver a Rappi' }))
  expect(back).toHaveBeenCalled()
})
test('con `round` arranca la ronda de esa vertical', () => {
  renderGame({ round: 'turbo' })
  expect(screen.getByRole('progressbar', { name: /Paso 1 de 5/ })).toBeTruthy()
})
test('con `vertical` abre su hoja con «Abrir Turbo»', () => {
  const push = vi.fn(); renderGame({ vertical: 'turbo' }, { push })
  fireEvent.click(screen.getByRole('button', { name: 'Abrir Turbo' }))
  expect(push).toHaveBeenCalledWith('vertical', { id: 'turbo' })
})
```

  Run: `npx vitest run src/screens/game src/state/GameContext.test.jsx` — Expected: FAIL (no existe `GameScreen`).
- [ ] **Step 2: Copiar pantallas y componentes, renombrar clases, prefijar CSS, montar `GameProvider` y la ruta `game`; instalar `@phosphor-icons/react`**
- [ ] **Step 3: Correr** `npm test && npm run lint` — Expected: PASS.
- [ ] **Step 4: Commit** `feat(juego): el juego como pantalla del prototipo`

### Task 3: Pasaporte único en la Home y Bigotes

**Files:**
- Modify: `prototipo-app/src/screens/home/live/LiveBlocks.jsx` (`Passport`), `LiveHomeFeed.jsx`, `live.css`, `prototipo-app/src/state/liveMemory.js` (fuera `PASSPORT`, `loadPassport`, `stamp`, `savePassport`, `STARTER`), `prototipo-app/src/components/DemoToggle.jsx` y `src/screens/account/AccountScreen.jsx` («Repetir escena» también llama `game.reset()`)
- Test: `prototipo-app/src/screens/home/live/LiveHomeFeed.test.jsx`

**Interfaces:**
- Consumes: `useGame()`, `stampedVerticals`, `verticalLevel`, `GAME_TO_SCREEN`, `SCREEN_TO_GAME`, `NEVER_PUSHED`, `PASSPORT_GOAL`.
- `Passport({ state, fresh, onOpenGame, onOpenStamp })`: 8 sellos en `DATA.order` con clase `is-{nivel}`; botón «Jugar» → `push('game', { tab: 'jugar' })`; tocar la tarjeta → `push('game', { tab: 'pasaporte' })`; tocar un sello → `push('game', { vertical })`.
- Bigotes al tocarlo: primera sin sello fuera de `NEVER_PUSHED`, con acciones «Jugar {vertical}» → `push('game', { round })`, «Abrir {vertical}» → `game.visit(screenId)` + abrir la vertical, «Después».

- [ ] **Step 1: Tests (fallan):** el pasaporte muestra 8 sellos y `aria-valuenow` = sellos (2 al inicio); un sello ganado con `game.visit('liquor')` aparece en la Home; «Jugar» abre `game`; Bigotes nunca propone Farmacia aunque sea la única sin sello; «Repetir escena» deja `stampedVerticals` en el inicio.
- [ ] **Step 2: Implementar.**
- [ ] **Step 3: Correr** `npm test && npm run lint` — Expected: PASS.
- [ ] **Step 4: Commit** `feat(juego): el pasaporte de la Home es el del juego`

### Task 4: Ronda mientras llega el pedido

**Files:**
- Modify: `prototipo-app/src/screens/tracking/TrackingScreen.jsx` (+ `tracking.css`), `src/screens/game/GameScreen.jsx` (franja), `src/screens/game/Round.jsx` (texto del botón final)
- Create: `src/screens/game/OrderBanner.jsx`
- Test: `prototipo-app/src/screens/tracking/TrackingScreen.test.jsx`, `src/screens/game/flow.test.jsx`

**Interfaces:**
- Consumes: `waitingRoundVertical`, `useOrders().find`, `minutesLeft`/`STEPS` de `screens/tracking/progress.js`.
- Tarjeta (solo `demo.isFinal` y pedido no entregado): «🎮 Juega mientras llega tu pedido» + «1 min · gana el sello de {vertical}» o «1 min · sube de nivel en {vertical}»; toca → `push('game', { round, orderId })`.
- `OrderBanner({ orderId })`: «Tu pedido llega en N min» o «¡Tu pedido llegó! Ver pedido» (→ `back()`); no se muestra si el pedido no existe. Con `orderId`, el botón final de la ronda dice «Volver a tu pedido».

- [ ] **Step 1: Tests (fallan):** tarjeta con «gana el sello de Express» al inicio; sin tarjeta en «Rappi hoy» ni tras entregar; tocarla hace `push('game', { round: 'conveniencia', orderId })`; la franja cambia a «¡Tu pedido llegó!» al avanzar 22 s; `orderId` inexistente no muestra franja.
- [ ] **Step 2: Implementar.**
- [ ] **Step 3: Correr** `npm test && npm run lint` — Expected: PASS.
- [ ] **Step 4: Commit** `feat(juego): una ronda mientras llega el pedido`

### Task 5: Textos, capturas y entrega

**Files:**
- Modify: `prototipo-app/README.md`, `README.md`, `docs/demo.md`, `docs/decisiones.md`, `prototipo-app/scripts/screenshots.mjs` (capturas del juego y de la tarjeta del seguimiento)

- [ ] **Step 1: Docs y fila en decisiones; capturas nuevas (solo las que cambian).**
- [ ] **Step 2: Verificación** `npm test && npm run lint && npm run build`; HTML de un solo archivo probado en el navegador (Home → pasaporte → juego → ronda → volver; pedido → tarjeta → ronda → pedido llega → volver), a 402 × 874.
- [ ] **Step 3: Commit** `docs(juego): textos, capturas y guion con el juego en el prototipo`
