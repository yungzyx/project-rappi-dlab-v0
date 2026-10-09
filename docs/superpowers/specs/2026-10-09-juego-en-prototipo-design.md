# Juego de verticales dentro del prototipo final

> Especificación · 09-10-2026 · Estado: **para revisión**
> Contexto: prototipo final (PR #40) · juego independiente `~/rappi-juego-verticales` ([su especificación](https://github.com/yungzyx/rappi-juego-verticales/blob/main/docs/especificacion.md)) · [decisiones.md](../../decisiones.md)

## 1. Para qué

El prototipo final tiene un **pasaporte Rappi** en la Home (un sello por vertical abierta; con 4, envío gratis en la
demo). Aparte existe un **juego de verticales** (rondas, sellos con niveles, misión del día, cartas «¿Sabías que…?»)
que enseña las verticales de Rappi con datos reales del catálogo. Hoy son dos cosas sueltas.

Esta especificación los une en un **sistema de gamificación**: el juego vive dentro del prototipo, su pasaporte **es**
el pasaporte Rappi, se entra desde la Home y se ofrece **mientras llega un pedido** para que la espera se sienta más
corta.

### Criterios de éxito

1. Desde la tarjeta del pasaporte en la Home se entra al juego completo y se vuelve a la app sin perder nada.
2. Un sello ganado jugando aparece en el pasaporte de la Home, y abrir una vertical en la app cuenta en el juego.
3. En el seguimiento de un pedido en camino se ofrece una ronda de una vertical sin sello; si el pedido llega a mitad
   de ronda, se avisa y se puede terminar.
4. Todo funciona en el HTML de un solo archivo, sin internet ni API.
5. Farmacia nunca se sugiere ni se ofrece por iniciativa de Bigotes ni del seguimiento.

## 2. Pasaporte único (reglas)

- **Verticales:** las 8 del juego, en su orden: Súper, Express, Turbo, Licores, Chocolatería, Restaurantes,
  Farmacia, Rappi Mall. Sale **Mascotas** (el juego no tiene datos para jugarla). Una sola tabla traduce los ids:

  | Juego | Prototipo |
  |---|---|
  | `supermercado` | `grocery` |
  | `conveniencia` | `express` |
  | `turbo` | `turbo` |
  | `licores` | `liquor` |
  | `chocolateria` | `chocolates` |
  | `restaurantes` | `restaurants` |
  | `farmacia` | `pharmacy` |
  | `mall` | `retail` |

- **Sello = nivel Explorador o más.** Explorador se alcanza descubriendo un concepto de la vertical jugando **o**
  abriendo la vertical en la app (`visited`). Conocedor y Experto solo jugando, con las reglas del juego (mitad de los
  conceptos y 3 desafíos; todos y 8 desafíos). El nivel se ve en el borde del sello.
- **Envío gratis con 4 sellos** (como hoy). Restaurantes y Súper parten como visitadas (lo que una persona típica ya
  usa).
- **Farmacia** se puede jugar desde el pasaporte (aprender no es comprar), pero nunca la proponen Bigotes ni la tarjeta
  del seguimiento («la salud no se empuja», `diseno-ia.md` §4 regla 6). Licores mantiene su marca «+18».
- El resto de las reglas del juego (XP, nivel de explorador, misión del día, racha, cartas, sello «Conoce Rappi»)
  quedan como en su especificación.

## 3. Entradas y flujos

### Home (prototipo final)

- La tarjeta «Tu pasaporte Rappi» muestra los 8 sellos con su nivel y suma un botón **«Jugar»**.
- Tocar la tarjeta abre el juego en su pestaña **Pasaporte**; «Jugar», en la pestaña **Jugar** (la primera vez, la
  bienvenida de Bigotes y una ronda).
- Tocar un sello abre esa vertical en el juego con **«Jugar»** y **«Abrir {vertical}»** (abre la vertical en la app).
- Tocar a Bigotes propone una vertical sin sello (nunca Farmacia) con **«Jugar {vertical}»** (ronda directa),
  **«Abrir {vertical}»** y **«Después»**.

### Seguimiento del pedido

- Mientras el pedido no llega, bajo el avance aparece **«🎮 Juega mientras llega tu pedido · 1 min · gana el sello de
  {vertical}»**.
- Vertical elegida: la primera sin sello en el orden del pasaporte, sin Farmacia. Si todas (sin Farmacia) tienen
  sello, la de menor nivel (si empatan, la primera en ese orden), y el texto dice «sube de nivel en {vertical}».
- Tocarla abre la ronda directa. Arriba, una franja: «Tu pedido llega en N min» (mismos cálculos del seguimiento).
- Si el pedido llega durante la ronda, la franja cambia a **«¡Tu pedido llegó! Ver pedido»**; la ronda sigue.
- El fin de ronda (estrellas, XP, sello, carta) ofrece **«Volver a tu pedido»**.
- Al llegar el pedido la tarjeta desaparece (queda la oferta de Bigotes para el próximo pedido).

### El juego dentro de la app

- Es una pantalla más de la pila del prototipo (`game`), con sus pestañas Jugar, Pasaporte y Álbum y una flecha arriba
  para volver a la app. Sin barra del carro.
- Solo en el modo «Prototipo final». En «Rappi hoy» no hay pasaporte, juego ni tarjeta en el seguimiento.
- **«↺ Repetir escena»** (y Account → «Repetir escena de Bigotes») reinicia también el juego: queda con Restaurantes y
  Súper visitadas y todo lo demás en cero. «Ajustes → Reiniciar progreso» del juego hace lo mismo.

## 4. Construcción

- **Código** en `prototipo-app` (se copia del repo del juego y desde aquí se mantiene; ese repo queda como histórico):
  - `src/game/`: lógica pura sin React (`data`, `facts`, `challenges`, `progress`, `round`, `rng`, `storage`) con sus
    tests.
  - `src/data/verticales.json` (48 KB, catálogo del 05-10-2026, sin conceptos sensibles) y
    `scripts/extraer-datos.mjs` para regenerarlo desde el mapa `04`.
  - `src/screens/game/`: pantallas del juego y `GameScreen` (pestañas, bienvenida, avisos).
- **Estado único:** el proveedor del juego se monta en `App`. El pasaporte de la Home, Bigotes (`liveMemory`) y el
  seguimiento leen y escriben ese estado; `stamp(vertical)` marca `visited`. Clave nueva en el navegador
  (`rappi-proto-juego-v1`); los sellos de `rappi-proto-pasaporte` se traspasan como `visited` una sola vez. Si el
  navegador no guarda, todo sigue en memoria.
- **Estilos:** el juego usa los tokens, el Bigotes (`Mascot`) y la barra de estado del prototipo; se descartan sus
  reglas globales (`*`, `html`, `body`, `.stage`, `.phone`, `tokens.css`). Las clases que chocan se renombran
  (`.sheet` → `.game-sheet`, `.toast` → `.game-toast`, `.bottom-nav` → `.game-tabs`, `.screen` → `.game-screen`,
  barra de estado y Bigotes propios fuera) y todo su CSS queda bajo `.game`.
- **Dependencia nueva:** `@phosphor-icons/react` (16 íconos del juego; solo se incluyen los usados).
- Código en inglés; todo lo que se ve, en español.

## 5. Pruebas

- Los tests del juego, adaptados a la nueva ubicación y al estado único.
- Nuevos:
  1. Un sello ganado jugando aparece en el pasaporte de la Home; abrir una vertical en la app la deja en Explorador.
  2. Los sellos viejos de `rappi-proto-pasaporte` se traspasan una vez; con almacenamiento roto, el juego carga en cero.
  3. La tarjeta del seguimiento elige la primera vertical sin sello sin Farmacia; con todo sellado, la de menor nivel.
  4. Pedido que llega a mitad de ronda: la franja cambia y «Volver a tu pedido» lleva al seguimiento entregado.
  5. Bigotes nunca propone Farmacia; «Rappi hoy» no muestra pasaporte, juego ni tarjeta.
  6. «Repetir escena» deja el juego en el estado inicial.
- `npm test`, `npm run lint`, `npm run build`; prueba en el navegador a 402 × 874 y 390 × 844 con el HTML de un solo
  archivo.

## 6. Fuera de alcance

- Cambiar las reglas, desafíos o cartas del juego.
- Recompensas reales o conectar el progreso con la API o el panel (el progreso es de demo, solo en el navegador).
- Fusionar el repo `rappi-juego-verticales`: no se toca.

## 7. Riesgos

- **Tamaño del cambio** (≈ 2.000 líneas más CSS): se hace por etapas con tests en cada una.
- **Estilos cruzados:** se revisa pantalla por pantalla en el navegador, en los dos modos.
- **Peso del HTML:** sube alrededor de 100 KB (datos + código + íconos).
