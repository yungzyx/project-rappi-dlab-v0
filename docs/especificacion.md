# Juego de verticales: especificación

Prototipo de prueba, independiente de `rappi-dlab` (no afiliado a Rappi). Convierte el mapa multivertical («04 Mapa multivertical» de la presentación) en un juego para celular: el usuario descubre las 8 verticales de Rappi completando misiones, sube de nivel en cada una y colecciona datos «¿Sabías que…?».

No reemplaza ni modifica los prototipos anteriores (02 App con Bigotes, 12 Bigotes vivo, 04 Mapa multivertical): es un testeo aparte.

## Para quién y qué demuestra

- Audiencia: el gerente, en la misma presentación que los otros prototipos. No lo usan usuarios reales todavía.
- Qué demuestra: que el catálogo y el grafo de conceptos sirven para que una persona conozca verticales que no usa, jugando, sin empujarla a comprar.
- Éxito: en 2 minutos de demo se entiende el bucle (descubrir → desafío → carta → sello), todos los datos que muestra son reales y verificables, y funciona sin internet en un solo HTML.

## Datos

- Fuente única: el objeto `DATA` del 04 (catálogo del 05-10-2026). `scripts/extraer-datos.mjs <ruta al 04>` lo lee y escribe `src/data/verticales.json`.
- Al extraer se descartan los conceptos sensibles (`sensitive: true`, hoy 6), los productos y cadenas con nombres de salud sexual o tabaco, los conceptos que no pertenecen a ninguna vertical (no se podrían descubrir) y toda relación que los toque: el repo del juego no los contiene.
- Se guarda solo lo agregado que ya trae el 04: conteos por concepto y vertical, complementos, sustitutos, pares «nunca junto», productos y cadenas presentes en más verticales, pares de verticales que comparten productos, reparto de productos por número de verticales, fecha del catálogo. Sin precios, tiendas ni filas de productos.
- Hoy: 106 conceptos jugables.
- Un concepto **pertenece** a una vertical si tiene ahí 20 o más productos (`minItems` del 04, la misma regla de las líneas del mapa). Así cada vertical tiene entre 9 (Chocolatería) y 92 (Súper) conceptos por descubrir.
- Ningún número se escribe a mano: cartas y desafíos se arman con plantillas sobre estos datos.

## Pantallas (celular, marco de 402 × 874 como `prototipo-app`)

Barra inferior con 4 pestañas: Inicio, Mapa, Pasaporte, Álbum.

1. **Inicio**: Bigotes saluda; nivel de explorador y barra de XP; misión del día con sus 3 pasos; racha; botón «Seguir explorando» (lleva a la vertical con menos avance).
2. **Mapa con niebla**: las 8 verticales en círculo con sus conceptos como puntos; apagados hasta descubrirlos. Tocar una vertical abre su pantalla.
3. **Vertical**: sello y nivel; avance (conceptos descubiertos / total, desafíos acertados); conceptos (descubiertos con nombre y emoji, los demás como «?»); botón «Desafío».
4. **Ficha de concepto** (al tocar un concepto de la vertical): lo descubre. Muestra en cuántas verticales está, sus complementos y sustitutos.
5. **Desafío**: pregunta, 4 opciones, respuesta con explicación de la regla real.
6. **Resultado**: XP ganada, carta «¿Sabías que…?» nueva, animación del sello si sube de nivel.
7. **Pasaporte**: los 8 sellos con su nivel y el sello especial «Conoce Rappi».
8. **Álbum**: cartas por vertical; las bloqueadas en gris.

Ajustes (desde Inicio): «Reiniciar progreso».

## Reglas del juego

### Experiencia

| Acción | XP |
|---|---|
| Descubrir un concepto en una vertical | +10 (una vez por concepto y vertical) |
| Desafío acertado | +20 |
| Desafío errado | +5 (con explicación) |
| Misión del día completa | +50 |

Nivel de explorador = 1 + ⌊XP / 100⌋.

### Nivel de cada vertical (por avance, no por XP)

- **Sin sello**: nada descubierto.
- **Explorador**: al menos 1 concepto descubierto.
- **Conocedor**: al menos la mitad de sus conceptos (redondeado hacia arriba) y 3 desafíos acertados de esa vertical.
- **Experto**: todos sus conceptos y 8 desafíos acertados.
- Sello especial **«Conoce Rappi»**: las 8 verticales en Conocedor o más.

### Desafíos

Cada desafío pertenece a una vertical, tiene 1 respuesta correcta y 3 distractores que son falsos con seguridad según los datos, sin opciones repetidas, y una explicación con la regla real. Tipos:

| Tipo | Pregunta | Correcta | Distractores |
|---|---|---|---|
| Típico | «¿Cuál de estos es típico de {vertical}?» | concepto con esa vertical como típica (`home`) | conceptos que no pertenecen a esa vertical ni la tienen como típica |
| Combo | «¿Qué combina con {concepto}?» | un complemento | conceptos que no son complementos ni sustitutos ni «nunca junto» de él |
| Sustituto | «Si no hay {concepto}, ¿qué ofrece Bigotes en su lugar?» | un sustituto | conceptos sin ninguna relación con él |
| Pareja imposible | «¿Cuál nunca sugeriría Bigotes junto a {concepto}?» | un par «nunca junto» | 3 complementos de él (solo conceptos que tienen 3; uno sin relación tampoco se sugeriría y sería correcto) |
| Producto puente | «{producto} está en N verticales. ¿En cuál de estas no está?» | una vertical donde no está | 3 verticales donde sí está |
| Trivia | «¿Cuál de estas verticales tiene más productos?» | según los conteos | otras verticales (sin Restaurantes, que cuenta platos) |

Un tipo solo se ofrece en una vertical si hay datos para armarlo (por ejemplo, Sustituto solo con conceptos que tienen sustitutos y pertenecen a esa vertical).

Los desafíos salen de un generador con semilla: la misma semilla da el mismo desafío.

### Misión del día

- Semilla = fecha local (AAAA-MM-DD): la misma misión para todos ese día.
- 3 pasos: descubrir 2 conceptos nuevos (en cualquier vertical), acertar 1 desafío, abrir 1 carta del álbum.
- **Racha**: días consecutivos con la misión completa. Un día sin completar la corta; se cuenta en días calendario locales (cambio de mes y de año incluidos).

### Cartas «¿Sabías que…?»

- Entre 40 y 50 cartas generadas por plantilla y agrupadas por vertical: productos de la vertical; concepto más típico; vertical con la que comparte más productos; producto puente que está en esa vertical; cadena presente en esa vertical y otras; reparto de productos por número de verticales (cartas generales).
- Cada carta muestra «Catálogo del {fecha}».
- Cada resultado de desafío desbloquea una carta todavía bloqueada de esa vertical (si quedan; si no, una general).

## Límites y cuidado

- Sin conceptos sensibles en ninguna parte del juego.
- Ninguna misión pide comprar; el texto habla de conocer, no de pedir.
- Licores: solo exploración y desafíos, con la marca «+18» en su sello y su pantalla.
- El progreso es de demo: se guarda solo en el navegador (`localStorage`, con manejo de error: si no se puede guardar, el juego sigue sin guardar). Ningún dato sale del dispositivo.
- Los números del juego son del catálogo real; el progreso del jugador no se presenta como métrica.

## Construcción

- React 19 + Vite + Figtree, como `prototipo-app`; paleta copiada de su `tokens.css`; Bigotes adaptado de su `Mascot.jsx`.
- `src/game/` lógica pura sin React: `data.js` (carga e índices), `facts.js`, `challenges.js`, `progress.js` (XP, niveles, racha, misión del día; funciones puras sobre el estado), `storage.js`.
- `src/screens/` las pantallas; `src/components/` Bigotes, sello, carta, barra de XP, barra inferior.
- Código en inglés; todo lo que ve el usuario en español.

## Pruebas

- vitest + Testing Library + eslint; `npm test` y `npm run lint` antes de dar algo por terminado; GitHub Actions los corre en cada PR.
- Desafíos: recorrer todos los generables y comprobar contra los datos que la correcta es verdadera, los 3 distractores falsos y las 4 opciones distintas.
- Sensibles: ningún id sensible del 04 aparece en `verticales.json`, cartas, desafíos ni mapa.
- Cartas: cada número coincide con los datos.
- Niveles, XP y racha: umbrales exactos; racha con día seguido, día salteado, cambio de mes y de año.
- Almacenamiento: si `localStorage` falla al leer o escribir, el juego carga en cero y sigue.
- Pantallas: acertar un desafío suma 20 XP y desbloquea una carta; «Reiniciar progreso» deja todo en cero; la misión del día se completa con sus 3 pasos.
- Revisión visual en el navegador a 402 × 874 y a 390 × 844.

## Entrega

- `npm run build` genera `dist/juego-verticales.html`: un solo archivo que abre sin internet (vite-plugin-singlefile).
- Repo privado `yungzyx/rappi-juego-verticales`; README en español. La implementación va en una rama con PR; no se fusiona sin visto bueno.
- La carpeta «Rappi - Presentación gerente» no se toca sin confirmación; si el juego gusta, se propone agregarlo como «13 Juego de verticales».
