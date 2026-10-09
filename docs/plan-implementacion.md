# Juego de verticales: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un prototipo React para celular que convierte el mapa multivertical en un juego de misiones, sellos por vertical y cartas «¿Sabías que…?», entregado también como un solo HTML.

**Architecture:** Los datos del 04 se extraen una vez a `src/data/verticales.json` (sin sensibles). `src/game/` es lógica pura (datos, cartas, desafíos con semilla, progreso, almacenamiento) probada sin React; `src/screens/` y `src/components/` solo muestran estado y llaman a esas funciones. Navegación con un estado en `App` (sin router).

**Tech Stack:** React 19, Vite 8, vitest 5 + Testing Library + jsdom, eslint 10 (misma config que `prototipo-app`), `vite-plugin-singlefile`, `@fontsource-variable/figtree`.

**Spec:** `docs/especificacion.md`

## Global Constraints

- Código en inglés; todo lo que ve el usuario (textos, README, mensajes de commit) en español.
- Ningún concepto con `sensitive: true` del 04 llega a `verticales.json` ni a ninguna pantalla.
- Ningún número del juego se escribe a mano: sale de `verticales.json`.
- Pertenencia: un concepto pertenece a una vertical si `items[vertical] >= minItems` (20).
- XP: descubrir +10 (una vez por concepto y vertical), desafío acertado +20, errado +5, misión del día +50. Nivel de explorador = 1 + ⌊XP/100⌋.
- Niveles de vertical: Explorador ≥ 1 concepto; Conocedor ≥ ⌈total/2⌉ conceptos y ≥ 3 acertados; Experto = todos y ≥ 8 acertados. «Conoce Rappi» = las 8 en Conocedor o más.
- Misión del día: descubrir 2 conceptos nuevos, acertar 1 desafío, abrir 1 carta; racha en días calendario locales.
- Licores lleva la marca «+18». Ningún texto invita a comprar.
- `localStorage` siempre dentro de try/catch; si falla, el juego sigue en memoria.
- Marco de teléfono 402 × 874 como `prototipo-app`; paleta de su `tokens.css`.
- `npm test` y `npm run lint` en verde antes de cerrar cada tarea.

## Review Focus

1. Un desafío con un distractor que en realidad es correcto (p. ej. un complemento en ambos sentidos, o un sustituto que también es complemento): el jugador acierta y el juego le dice que se equivocó. → test exhaustivo en la Tarea 4 con un verificador independiente.
2. Vertical sin datos para un tipo (Chocolatería sin sustitutos, Restaurantes sin productos puente): el generador no debe colgarse ni repetir opciones. → test por vertical en la Tarea 4.
3. Progreso guardado con una versión anterior o corrupto (`"{"`, `null`, tipos raros): debe cargar en cero, no romper. → test en la Tarea 5.
4. Racha al cambiar de mes/año y al completar dos veces el mismo día. → tests en la Tarea 5.
5. Fecha local vs UTC: completar la misión a las 23:30 en Chile no puede contar para el día siguiente. → `today()` usa la fecha local; test con hora fija en la Tarea 5.

---

### Task 1: Esqueleto del proyecto

**Files:**
- Create: `package.json`, `vite.config.js`, `eslint.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`, `src/App.test.jsx`, `.github/workflows/ci.yml`, `README.md`, `.prettierrc` (copiar de `prototipo-app` si existe)

**Interfaces:**
- Produces: `npm test`, `npm run lint`, `npm run build` (→ `dist/juego-verticales.html`), `npm run dev` (puerto 5176).

- [ ] **Step 1:** `package.json` con scripts `dev`, `build`, `test` (`vitest run`), `lint` (`eslint .`), `datos` (`node scripts/extraer-datos.mjs`); dependencias como en el Tech Stack, versiones iguales a `prototipo-app`.
- [ ] **Step 2:** Test `App.test.jsx`: `render(<App />)` muestra el texto «Juego de verticales». Correr `npm test` → FAIL (no existe App).
- [ ] **Step 3:** `App.jsx` mínimo, `main.jsx`, `index.html` (`lang="es"`, título «Juego de verticales»), `vite.config.js` con react, singlefile en `build` (renombrar salida a `juego-verticales.html` con `build.rollupOptions.input` + plugin que renombra, o `vite build && mv`), `test.environment: 'jsdom'`. `eslint.config.js` copiado de `prototipo-app`.
- [ ] **Step 4:** `npm test` → PASS; `npm run lint` → sin errores; `npm run build` → existe `dist/juego-verticales.html` sin otros archivos JS/CSS sueltos.
- [ ] **Step 5:** CI: `.github/workflows/ci.yml` con Node 22, `npm ci`, `npm run lint`, `npm test`. README breve (qué es, `npm install`, `npm run dev`, `npm run build`, aviso de prototipo independiente).
- [ ] **Step 6:** Commit `chore: esqueleto del juego (React + Vite + vitest)`.

### Task 2: Datos

**Files:**
- Create: `scripts/extraer-datos.mjs`, `src/data/verticales.json`, `src/game/data.js`, `src/game/data.test.js`

**Interfaces:**
- Produces (`data.js`):
  - `DATA` (el JSON): `{ asOf, order: string[8], labels: {v: string}, minItems, products: {v: number}, catalogTotal, concepts: [{id, name, emoji, group, home, items: {v: number}, total}], complements: [[from, to, weight]], substitutes: [[a, b, weight]], conflicts: [[a, b]], bridges: [[name, verticals[], stores]], chains: [[name, verticals[], stores]], shared: [[a, b, n]], spread: [[nVerticals, count]] }`
  - `conceptById(id) → concept`
  - `belongs(concept, vertical) → boolean`
  - `conceptsOf(vertical) → concept[]` (pertenecen; orden por `items[vertical]` desc)
  - `related(id) → { complements: Set, substitutes: Set, conflicts: Set }` (complementos en ambos sentidos; sustitutos y conflictos simétricos)
  - `formatNumber(n) → string` (`Intl.NumberFormat('es-CL')`)

- [ ] **Step 1:** `extraer-datos.mjs <ruta>`: lee el HTML, toma el JSON de `const DATA = {...};`, quita conceptos sensibles y toda arista/relación con alguno, quita `services`, escribe `src/data/verticales.json` (2 espacios). Si no encuentra `DATA`, sale con código 1 y mensaje en español.
- [ ] **Step 2:** Correrlo con `"/Users/yungbot/Desktop/Rappi - Presentación gerente 2/04 Mapa multivertical.html"`. Expected: 107 conceptos.
- [ ] **Step 3:** Tests en `data.test.js`:
  - 107 conceptos, 100 complementos, 20 sustitutos, 44 conflictos; `asOf === '05-10-2026'`.
  - Ningún concepto con `sensitive` ni ids `['accesorios-fumador', ...]` (los 6 sensibles del 04, listados literalmente en el test) en conceptos ni en aristas.
  - `conceptsOf('chocolateria').length === 9`, `conceptsOf('supermercado').length === 92`, ninguna vertical con 0.
  - `related` es simétrico para sustitutos y conflictos.
  - `formatNumber(38454) === '38.454'`.
  Correr → FAIL; implementar `data.js`; correr → PASS.
- [ ] **Step 4:** Commit `feat: datos del mapa sin conceptos sensibles`.

### Task 3: Cartas «¿Sabías que…?»

**Files:**
- Create: `src/game/facts.js`, `src/game/facts.test.js`

**Interfaces:**
- Consumes: `DATA`, `conceptsOf`, `formatNumber`.
- Produces: `FACTS: [{ id, vertical: string|null, title, text }]` (orden estable), `factsOf(vertical) → fact[]`.

Plantillas por vertical (se omite la que no tiene datos):
- `{v}-productos`: cuántos productos tiene (en Restaurantes, «platos»).
- `{v}-mas`: el concepto con más productos en la vertical.
- `{v}-comparte`: la vertical con la que comparte más productos (`shared`).
- `{v}-puente`: el primer producto de `bridges` que incluye la vertical: en cuántas verticales y tiendas está.
- `{v}-cadena`: la primera cadena de `chains` que incluye la vertical: en cuántas verticales.
- `{v}-conceptos`: cuántos de los conceptos del juego tienen 20 o más productos ahí.
Generales (`vertical: null`): `general-una-vertical` (porcentaje de productos que están en una sola vertical, de `spread`) y `general-catalogo` (`catalogTotal`).

- [ ] **Step 1:** Tests: total entre 40 y 50; ids únicos; cada número de cada texto coincide con el recalculado desde `DATA` en el test (p. ej. `supermercado-productos` contiene `formatNumber(DATA.products.supermercado)`); ninguna carta cita un concepto inexistente; `factsOf('licores')` no vacío. Correr → FAIL.
- [ ] **Step 2:** Implementar; correr → PASS.
- [ ] **Step 3:** Commit `feat: cartas «¿Sabías que…?» desde los datos`.

### Task 4: Desafíos con semilla

**Files:**
- Create: `src/game/rng.js`, `src/game/challenges.js`, `src/game/challenges.test.js`

**Interfaces:**
- Consumes: `DATA`, `conceptsOf`, `related`, `belongs`, `conceptById`.
- Produces:
  - `rng(seed: string) → () => number` (hash de la cadena + mulberry32)
  - `KINDS = ['tipico', 'combo', 'sustituto', 'imposible', 'puente', 'trivia']`
  - `kindsFor(vertical) → kind[]` (solo los que tienen datos)
  - `makeChallenge(vertical, seed: string) → { id, kind, vertical, question, options: [{ id, label }] (4), answer: optionId, explanation }`

Reglas por tipo según la tabla de la spec. Distractores de `combo`: conceptos que pertenecen a alguna vertical y no están en ninguna relación con el ancla (ni el ancla misma). De `imposible`: complementos del ancla; si faltan, conceptos sin relación. De `puente`: números 1–8 distintos del correcto. De `trivia`: 4 verticales al azar; correcta la de más productos; la explicación nombra los 4 conteos. Opciones barajadas con la misma `rng`.

- [ ] **Step 1:** Tests:
  - Determinismo: misma `(vertical, seed)` → mismo desafío; semillas distintas → al menos 2 desafíos distintos en 20.
  - Exhaustivo: para cada vertical y semillas `'0'..'199'`: 4 opciones con ids y textos distintos; verificador independiente escrito en el test (a partir de `DATA` crudo, sin `related`) confirma que `answer` es verdadera y las otras 3 falsas para cada tipo.
  - `kindsFor('chocolateria')` no incluye tipos sin datos; `makeChallenge` nunca lanza error para ninguna vertical.
  - Ninguna pregunta ni opción de licores invita a comprar (no contiene «compra», «pide», «agrega al carro»).
  Correr → FAIL.
- [ ] **Step 2:** Implementar; correr → PASS.
- [ ] **Step 3:** Commit `feat: desafíos con semilla y verificación exhaustiva`.

### Task 5: Progreso y almacenamiento

**Files:**
- Create: `src/game/progress.js`, `src/game/progress.test.js`, `src/game/storage.js`, `src/game/storage.test.js`

**Interfaces:**
- Consumes: `conceptsOf`, `factsOf`, `FACTS`, `rng`.
- Produces (funciones puras; `state` nunca se muta):
  - `initialState() → { version: 1, xp, discovered: {v: id[]}, correct: {v: n}, answered: {v: n}, cards: id[], opened: id[], daily: { date, discovered, correct, opened, done }, streak: { count, lastDate } }`
  - `today(now = new Date()) → 'AAAA-MM-DD'` (fecha local)
  - `discover(state, vertical, conceptId, date) → { state, xp }` (0 si ya estaba)
  - `answer(state, vertical, isCorrect, date) → { state, xp, card: fact|null }` (desbloquea una carta bloqueada de la vertical, si no quedan una general, si no `null`)
  - `openCard(state, cardId, date) → { state, xp }`
  - `explorerLevel(xp) → number`
  - `verticalLevel(state, vertical) → 'ninguno'|'explorador'|'conocedor'|'experto'`
  - `conoceRappi(state) → boolean`
  - `currentStreak(state, date) → number` (0 si `lastDate` es anterior a ayer)
  - `dailyVertical(date) → vertical` (destacada del día, con `rng(date)`)
  - `nextVertical(state) → vertical` (la de menor avance, para «Seguir explorando»)
  - Cada acción reinicia `daily` si `daily.date !== date`, y al completar los 3 pasos suma +50 una sola vez y actualiza la racha.
  - `storage.js`: `KEY = 'juego-verticales-v1'`, `load() → state` (initialState si no hay, si falla, si no parsea o si `version !== 1`), `save(state) → boolean`, `clear() → boolean`.

- [ ] **Step 1:** Tests de `progress`:
  - XP: descubrir +10 y repetir +0; acertar +20; errar +5; misión completa +50 una vez.
  - Niveles en Chocolatería (9 conceptos): 1 → explorador; 5 + 3 acertados → conocedor; 5 + 2 → explorador; 9 + 8 → experto. `explorerLevel(0) === 1`, `explorerLevel(199) === 2`.
  - `conoceRappi` falso con 7 en conocedor, verdadero con 8.
  - Racha: completar 2026-10-08 y 2026-10-09 → 2; completar dos veces el 09 → 2; saltar al 11 → 1; 2026-10-31 → 2026-11-01 → 2; 2026-12-31 → 2027-01-01 → 2; `currentStreak` el 12 con `lastDate` 09 → 0.
  - `today(new Date(2026, 9, 8, 23, 30))` → `'2026-10-08'`.
  - `answer` desbloquea cartas distintas hasta agotar las de la vertical y luego generales.
  - El estado de entrada no se muta (`Object.freeze` profundo en el test).
- [ ] **Step 2:** Tests de `storage` con `localStorage` simulado: guardar/cargar ida y vuelta; `getItem` que lanza → `initialState`; valores `'{'`, `'null'`, `'{"version":0}'` → `initialState`; `setItem` que lanza → `save` devuelve `false` sin lanzar.
- [ ] **Step 3:** Correr → FAIL; implementar; correr → PASS.
- [ ] **Step 4:** Commit `feat: progreso, niveles, racha y guardado local`.

### Task 6: Marco, Bigotes, navegación e Inicio

**Files:**
- Create: `src/styles/tokens.css` (copiado de `prototipo-app`, más colores por vertical), `src/styles/global.css` (marco `.stage`/`.phone` de `prototipo-app`), `src/components/Mascot.jsx` + `mascot.css` (copiados), `src/components/BottomNav.jsx`, `src/components/XpBar.jsx`, `src/state/GameContext.jsx`, `src/screens/Home.jsx`, `src/screens/Settings.jsx`, `src/screens/Home.test.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Produces: `GameProvider` + `useGame() → { state, discover(v, id), answer(v, ok), openCard(id), reset(), toast }` (envuelve `progress.js`, guarda con `storage.save` después de cada acción, `date = today()`); `App` con `screen: { name, params }` y `go(name, params)`; pestañas `inicio | mapa | pasaporte | album`.

- [ ] **Step 1:** Tests: Inicio muestra «Nivel 1», la misión del día con 3 pasos sin marcar y el nombre de la vertical del día; «Seguir explorando» lleva a la pantalla de una vertical; Ajustes → «Reiniciar progreso» → confirma → XP 0. Correr → FAIL.
- [ ] **Step 2:** Implementar; correr → PASS; lint.
- [ ] **Step 3:** Commit `feat: marco del teléfono, Bigotes e Inicio`.

### Task 7: Vertical, ficha, desafío y resultado

**Files:**
- Create: `src/screens/Vertical.jsx`, `src/screens/Concept.jsx`, `src/screens/Challenge.jsx`, `src/screens/Result.jsx`, `src/components/Stamp.jsx`, `src/components/FactCard.jsx`, `src/screens/play.test.jsx`

**Interfaces:**
- Consumes: `useGame`, `conceptsOf`, `related`, `makeChallenge`, `verticalLevel`.
- Produces: `Stamp({ vertical, level })`, `FactCard({ fact, locked })`; semilla del desafío = `` `${vertical}-${state.answered[vertical] ?? 0}` ``.

- [ ] **Step 1:** Tests: en Vertical, tocar un concepto «?» abre su ficha y suma 10 XP; la ficha lista sus complementos; «Desafío» → elegir la respuesta correcta → Resultado muestra «+20 XP» y una carta nueva; errar muestra la explicación y «+5 XP»; subir a Conocedor muestra la animación/aviso del sello; Licores muestra «+18». Correr → FAIL.
- [ ] **Step 2:** Implementar; correr → PASS; lint.
- [ ] **Step 3:** Commit `feat: vertical, ficha de concepto, desafíos y resultado`.

### Task 8: Mapa con niebla, Pasaporte y Álbum

**Files:**
- Create: `src/screens/Map.jsx`, `src/screens/Passport.jsx`, `src/screens/Album.jsx`, `src/screens/collection.test.jsx`

**Interfaces:**
- Consumes: `useGame`, `DATA`, `FACTS`, `verticalLevel`, `conoceRappi`.
- Mapa: SVG `viewBox 0 0 360 360`, 8 verticales en círculo (orden de `DATA.order`), cada concepto como punto junto a su `home`; punto encendido si está descubierto en alguna vertical; tocar una vertical → pantalla Vertical.

- [ ] **Step 1:** Tests: el mapa tiene 8 botones de vertical y 107 puntos, 0 encendidos al inicio y 1 tras descubrir uno; Pasaporte muestra 8 sellos y «Conoce Rappi» bloqueado; Álbum muestra todas las cartas, bloqueadas en gris, y abrir una desbloqueada marca el paso «abrir 1 carta» de la misión. Correr → FAIL.
- [ ] **Step 2:** Implementar; correr → PASS; lint.
- [ ] **Step 3:** Commit `feat: mapa con niebla, pasaporte y álbum`.

### Task 9: Entrega

**Files:**
- Modify: `README.md`
- Create: `scripts/captura.mjs` (opcional, si `playwright-core` está disponible)

- [ ] **Step 1:** `npm run build` → `dist/juego-verticales.html` único; abrirlo como archivo en el navegador (sin servidor): carga, se juega un desafío, el progreso persiste al recargar.
- [ ] **Step 2:** Revisión visual en el navegador a 402 × 874 y 390 × 844: sin textos cortados ni desbordes; captura para el PR.
- [ ] **Step 3:** README: qué es, cómo jugar, de dónde salen los datos (`npm run datos -- <ruta al 04>`), límites (datos del 05-10-2026, progreso solo local, sin sensibles), pruebas.
- [ ] **Step 4:** `npm test` y `npm run lint` en verde; commit `docs: README y entrega en un solo HTML`; push de la rama `feat/juego` y PR a `main` con la captura. No fusionar sin visto bueno.
