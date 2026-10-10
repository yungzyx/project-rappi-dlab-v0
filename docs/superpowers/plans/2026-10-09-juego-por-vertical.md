# Juego por vertical: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las rondas del pasaporte enseñan el mundo de cada vertical (datos y preguntas con fuente) y Viajes es el sello 9.

**Architecture:** El contenido vive en `src/game/knowledge.json` (12 tarjetas por vertical) y `src/game/knowledge.js` lo expone. Las verticales del pasaporte pasan a ser `PASSPORT_ORDER` (las 8 del catálogo + `viajes`); `DATA.order` queda solo para lo que sale del catálogo (desafíos, mapa de conceptos). Una «tarjeta descubierta» es un dato visto o una pregunta acertada; se guardan en `state.discovered[vertical]` (ids de tarjeta) y entran al álbum (`state.cards`).

**Tech Stack:** React 19 + Vite, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-09-juego-por-vertical-design.md`

## Global Constraints

- Solo el juego del prototipo final; «Rappi hoy» no cambia.
- Código en inglés; textos y comentarios en español. Contenido con palabras propias y fuente https por tarjeta.
- Largos: dato `text` ≤ 200, `title` ≤ 40, `question` ≤ 140, alternativa ≤ 60, `explanation` ≤ 200.
- Farmacia sigue en `NEVER_PUSHED`; Licores lleva +18; nada de consejos médicos ni que incite a beber.
- `npm test` y `npm run lint` en verde en cada tarea; test que falla primero.

## Review Focus

1. Progreso guardado de antes (conceptos y cartas de catálogo en `discovered`/`cards`/`opened`): se carga sin romper y no deja ids huérfanos en el álbum.
2. Una vertical con todas sus tarjetas vistas: la ronda igual tiene 5 pasos (repite) y no se cuelga.
3. Viajes en todo lo que recorre las verticales del pasaporte (Home, pasaporte del juego, camino, Mochi, ronda de espera) y fuera de lo que es solo catálogo (mapa de conceptos, desafíos).
4. Preguntas con la respuesta correcta siempre en la misma posición, o con alternativas repetidas.
5. Enlaces de fuente que se abren dentro del teléfono y sacan a la persona de la app (deben abrir en una pestaña nueva).

## Rulings de entrada

- **Un solo PR** (la spec decía dos): la investigación terminó antes; el contenido de las 9 verticales entra con el motor y no hace falta un modo provisorio para verticales sin tarjetas. Commits separados (motor y Viajes, contenido) para revisar por partes. Costo si está mal: un PR más grande.
- **Cartas viejas:** los datos del catálogo salen del álbum, así que las cartas abiertas de antes no se pueden conservar (sus ids dejan de existir). Se conservan sellos, XP y racha.

---

### Task 1: Contenido y su validación

**Files:**
- Create: `prototipo-app/src/game/knowledge.json`, `prototipo-app/src/game/knowledge.js`, `prototipo-app/src/game/knowledge.test.js`
- Create: `docs/resultados/juego-verificacion-2026-10-09.md` (qué se verificó, qué se corrigió y qué se descartó, por vertical)

**Interfaces:**
- Produces: `KNOWLEDGE` (array); `cardsOf(vertical) → card[]`; `datosOf(vertical)`; `preguntasOf(vertical)`; `cardById(id) → card | undefined`; `asChallenge(card) → { id, kind: 'conocimiento', vertical, question, options: [{id, label}], answer, explanation, source }` (la forma que ya pinta `Ask`).

- [ ] **Step 1: Test que falla** — `knowledge.test.js`: `'cada vertical del pasaporte tiene 6 datos y 6 preguntas'`; `'cada tarjeta respeta los largos y tiene fuente https'`; `'en cada pregunta la respuesta está entre 3 alternativas distintas'`; `'la respuesta correcta no está siempre en el mismo lugar dentro de una vertical'`; `'ids únicos y con el prefijo de su vertical'`; `'asChallenge da la forma de un desafío'`.
- [ ] **Step 2: Correrlo** → FAIL (no existe el módulo).
- [ ] **Step 3: Armar el contenido** con los candidatos investigados (`scratchpad/juego/candidatos-*.json`) y la verificación independiente (`verificacion-*.json`): solo «ok» o «fix» aplicado; 6 + 6 por vertical; sin temas repetidos entre verticales (plástico de burbujas, ramen, código de barras, palta, frutilla: uno solo cada uno); preferir fuentes oficiales. Sin el campo `evidence` (queda en el informe). Ids `vertical-01`…`vertical-12`.
- [ ] **Step 4: Correrlo** → PASS; suite y lint.
- [ ] **Step 5: Commit** — `feat: tarjetas de conocimiento por vertical, verificadas y con fuente`

### Task 2: Viajes en el pasaporte

**Files:**
- Modify: `prototipo-app/src/game/verticals.js`, `prototipo-app/src/game/progress.js`, `prototipo-app/src/game/storage.js`, `prototipo-app/src/screens/game/Stamp.jsx`, `prototipo-app/src/screens/game/game-tokens.css`, `prototipo-app/src/screens/home/live/LiveBlocks.jsx`, `prototipo-app/src/screens/home/live/LiveHomeFeed.jsx`, `prototipo-app/src/screens/game/Passport.jsx`, `prototipo-app/src/screens/game/Path.jsx`, sus tests

**Interfaces:**
- Produces (`verticals.js`): `GAME_TO_SCREEN.viajes = 'travel'`; `PASSPORT_ORDER = [...DATA.order, 'viajes']`; `LABELS = { ...DATA.labels, viajes: 'Viajes' }`.
- Consumes: `PASSPORT_ORDER` en lugar de `DATA.order` en `conoceRappi`, `nextVertical`, `stampedVerticals`, `waitingRoundVertical`, `storage.known`, el pasaporte de la Home, la propuesta de Mochi, `Passport.jsx` y `Path.jsx`. `DATA.order` sigue en `challenges.js`, `facts.js`, `MapView.jsx`, `Concept.jsx`.

- [ ] **Step 1: Tests que fallan** — `'el pasaporte tiene 9 sellos, el último Viajes'` (Home y pasaporte del juego); `'abrir Viajes desde Mochi lo sella'` (`visit('travel')`); `'Viajes puede ser la ronda mientras llega el pedido'`; `'el mapa de conceptos no tiene Viajes'`.
- [ ] **Step 2: Correrlos** → FAIL.
- [ ] **Step 3: Implementar** con ícono `AirplaneTilt` (Phosphor), `--v-viajes: #1f6fb2`, emoji ✈️ y etiqueta «Viajes».
- [ ] **Step 4: Correrlos** → PASS; suite y lint.
- [ ] **Step 5: Commit** — `feat: Viajes es el sello 9 del pasaporte`

### Task 3: Rondas, niveles y progreso con tarjetas

**Files:**
- Modify: `prototipo-app/src/game/round.js`, `prototipo-app/src/game/progress.js`, `prototipo-app/src/game/storage.js`, `prototipo-app/src/state/GameContext.jsx`, tests de `round`, `progress`, `storage`, `passport` y los de pantallas del juego que dependan de conceptos

**Interfaces:**
- Produces: `makeRound(state, vertical) → steps` con pasos `{ type: 'dato', card }`, `{ type: 'pregunta', challenge }` (de `asChallenge`) y `{ type: 'desafio', challenge }` (catálogo). Orden: dato, pregunta, dato, desafío, pregunta; Viajes cambia el desafío por una pregunta.
- Produces: `discover(state, vertical, cardId, date)` (suma a `discovered[vertical]` y a `cards`); `answer(state, vertical, isCorrect, date, cardId?)` (si acierta una pregunta de conocimiento, la suma a `discovered` y `cards`; ya no desbloquea cartas del catálogo); `verticalLevel` y `nextVertical` cuentan `cardsOf(v).length`.
- Produces (`storage.js`): al cargar, `discovered` y `cards`/`opened` se quedan solo con ids de `KNOWLEDGE`.

- [ ] **Step 1: Tests que fallan** — `'una ronda trae 2 datos, 2 preguntas y 1 desafío del catálogo, sin repetir'`; `'Viajes: 2 datos y 3 preguntas'`; `'con todo visto, la ronda igual tiene 5 pasos'`; `'acertar una pregunta la suma a lo descubierto y al álbum; fallar no'`; `'niveles: Explorador con 1, Conocedor con 6 y 3 aciertos, Experto con 12 y 8'`; `'un progreso guardado con conceptos y cartas viejas se carga sin ids huérfanos y conserva sellos, XP y racha'`.
- [ ] **Step 2: Correrlos** → FAIL.
- [ ] **Step 3: Implementar.** Elegir sin descubrir primero (en el orden del archivo); si faltan, repetir las ya vistas. `GameContext` pasa `cardId` a `answer`.
- [ ] **Step 4: Correrlos** → PASS; ajustar los tests del juego que suponían conceptos (cada cambio de expectativa, explicado en el commit); suite y lint.
- [ ] **Step 5: Commit** — `feat: las rondas y los niveles cuentan tarjetas de conocimiento`

### Task 4: Pantallas del juego

**Files:**
- Modify: `prototipo-app/src/screens/game/Round.jsx`, `round.css`, `Album.jsx`, `album.css`, `FactCard.jsx`, `Vertical.jsx` (la «colección»), `Passport.jsx`, `Path.jsx`, `Intro.jsx`, sus tests

**Interfaces:**
- Consumes: pasos de Task 3; `cardById`, `cardsOf`.

- [ ] **Step 1: Tests que fallan** — `'un dato se da vuelta: «¿Sabías que…?» y, atrás, el dato con su fuente'`; `'una pregunta de conocimiento muestra «Pregunta curiosa» y, al responder, la explicación y la fuente'`; `'el álbum muestra las tarjetas descubiertas de cada vertical con «Fuente: …» y las que faltan como «?»'`; `'la fuente se abre en una pestaña nueva'` (`target="_blank" rel="noopener"`); `'el pasaporte dice «Descubriste N de 108 datos» y la hoja de la vertical «Ver datos»'`.
- [ ] **Step 2: Correrlos** → FAIL.
- [ ] **Step 3: Implementar.** El dato reutiliza la carta que se da vuelta de `Discover`; la pregunta reutiliza `Ask` con título «Pregunta curiosa». La «colección» de una vertical muestra sus 12 tarjetas (descubiertas y «?»). La bienvenida dice «Gana sellos en las 9 verticales de Rappi» y «Colecciona datos curiosos de cada mundo».
- [ ] **Step 4: Correrlos** → PASS; suite y lint.
- [ ] **Step 5: Verificar en el navegador** (375 × 812 y escritorio): una ronda de Chocolatería y una de Viajes completas, el álbum con fuentes, el sello de Viajes en la Home y el juego. Sin errores.
- [ ] **Step 6: Commit** — `feat: rondas, álbum y colección con datos de cada vertical`

### Task 5: Cierre

- [ ] README del prototipo (juego), `docs/demo.md`, fila en `docs/decisiones.md`, capturas (31-juego-camino y una de ronda si cambia).
- [ ] Revisor nuevo (Opus) con el Review Focus; arreglos con test que falla primero.
- [ ] PR con CI en verde; prototipo del escritorio actualizado. **No se fusiona sin el usuario.**
