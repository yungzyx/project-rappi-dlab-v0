# Prototipo de la app

Maqueta navegable de la app de Rappi Chile, hecha a partir de capturas y videos del iPhone, para **mostrar la propuesta del proyecto**. Desde fuera, lo que un usuario hace en un vertical no parece influir en lo que se le recomienda en los demás. Aquí el asistente **Mochi** aprende de lo que haces y recomienda **entre verticales** (cerveza → snacks, pizza → gaseosas, pan → fiambres).

> Imágenes, logos y marcas pertenecen a Rappi y a sus dueños; se usan solo como maqueta de demostración. Proyecto independiente, no afiliado ni respaldado por Rappi.

Hecho con Vite + React 19. **Necesita la API de [`rappi-ia`](../rappi-ia/)**: sin ella no abre y muestra «Sin conexión con Mochi» con un botón «Reintentar» (ya no hay un modo local que funcione solo en el navegador). Con la API, Mochi busca en el catálogo real. Las imágenes que no cargan muestran un respaldo neutro.

![Modo demo: la misma app en el prototipo final y en «Rappi hoy»](docs/screenshots/00-modo-demo.jpg)

*Las capturas de las pantallas se tomaron o se revisaron el 10-10-2026 con el MVP corriendo y el catálogo real (`npm run screenshots`); solo la ficha de Mochi, la de voz y la de «Con la API» con Bigotes son anteriores. `npm run screenshots` necesita el MVP corriendo y, como paga una compra, deja un pedido y sus eventos (`source = 'prototype'`) en la base.*

## Cómo correrlo

Requiere Node 22.22+ o 24.15+ (ver `.nvmrc` en la raíz). Como la app no abre sin la API, se levanta con el resto del MVP, desde la raíz del repositorio:

```bash
make mvp              # API :8000, app http://localhost:5174 y panel :5175; Ctrl-C detiene los tres
make mvp LAN=1        # abre la API y la app a la red local, para el iPhone (misma red wifi o su hotspot)
make mvp-check        # recorre la app con Chrome (Home, una compra en el Súper de prueba, el kit de Mochi, API caída) contra un catálogo inventado, sin tocar la base real
```

Requisitos y qué hacer si falla algo: [docs/instalacion.md](../docs/instalacion.md#5-el-mvp). Para correr solo la app, con la API ya levantada por su cuenta (`cd rappi-ia && make serve`):

```bash
cd prototipo-app
npm ci
npm run dev              # http://localhost:5174
npm run dev -- --host    # para abrirlo en el iPhone
```

En el iPhone, desde Safari: **Compartir → Agregar a pantalla de inicio**. Se abre a pantalla completa con el ícono de Mochi y el gesto "volver" funciona.

### La API de `rappi-ia`

La API (puerto 8000) carga los modelos antes de aceptar peticiones: `make mvp` espera a que responda y, si la app se abrió antes, «Reintentar» vuelve a probar. Con ella, Mochi:

- da las **pantallas de catálogo** (ver «De dónde salen las pantallas»);
- busca en el **catálogo real** con búsqueda híbrida en todas las verticales (un grupo por vertical, la de la pantalla primero), con precios vigentes;
- sugiere un complemento **de otra tienda** en un bloque aparte;
- arma la fila **"Para ti"** del inicio con lo que aprendió de ti (productos reales de otro vertical, con aviso +18 si corresponde);
- registra eventos seudónimos y pedidos (uno por vertical) en la API, para medir las sugerencias (mostradas, aceptadas y convertidas).

Si la API se cae con la app ya abierta, el chat de Mochi dice «Sin conexión» con «Reintentar» (reenvía la misma pregunta) y las ofertas que Mochi hace solo callan: ya no hay respuestas locales. La API también ofrece `/chat/voice` (Whisper) y `/chat/photo` (CLIP), pero el prototipo actual no los usa: el prototipo final tiene un buscador, sin micrófono ni cámara.

<img src="docs/screenshots/40-bigotes-api.jpg" width="300" alt="Con la API: cervezas reales bajo $3.000 y snacks de otra tienda (captura anterior, con Bigotes y el chat escrito)">

*Con la API de rappi-ia: cervezas del catálogo real bajo $3.000 y, en un bloque aparte, snacks de otra tienda. Es una captura anterior: todavía con Bigotes y el chat escrito, que ya no existe.*

- **Dónde busca la API:** en el mismo host desde el que se abrió la página, puerto 8000; desde el iPhone no hace falta configurar nada. Para apuntar a otra API, crea `.env.local` con `VITE_API_URL=http://localhost:8001`.
- **Desde el iPhone:** `make mvp LAN=1` (abre la API y la app a la red; el panel pide sus datos a `localhost:8000` y solo sirve en este equipo; solo en una red de confianza). Sirve en la wifi de casa, con el hotspot del iPhone y con `http://nombre-del-mac.local:5174`. macOS pedirá permiso de red la primera vez.

### Comandos

| Comando | Para qué |
|---|---|
| `npm test` | Tests (Vitest): Mochi, buscador, carrito, perfil, navegación, precios, seguimiento, pedidos, hoja de producto, cliente de la API, accesibilidad del buscador |
| `npm run lint` | ESLint (reglas de React Hooks) |
| `npm run format` | Formato con Prettier |
| `npm run build` | Build de producción en `dist/` |
| `npm run screenshots` | Regenera las capturas de este README; necesita el MVP corriendo (`make mvp`) y usa el Chrome instalado |
| `./scripts/make-icons.sh` | Regenera los íconos de pantalla de inicio desde `scripts/icon.svg` |

Tests: 582 (Vitest, 10-10-2026). CI en GitHub Actions: lint, tests y build.

**Accesibilidad:** el buscador con Mochi y las hojas inferiores se usan con teclado y VoiceOver (el foco entra al abrir, Escape cierra, Tab no se sale y el foco vuelve al cerrar), cada respuesta de Mochi se anuncia completa al lector de pantalla y las áreas táctiles miden al menos 40 px.

## Modo demo: Rappi hoy y Prototipo final

El interruptor junto al teléfono (tecla **D**, o Account → Modo demo en el celular) cambia entre la app como es hoy (**Rappi hoy**, «para hoy») y el **Prototipo final**, que arranca por defecto. Antes eran tres modos («Propuesta», «Rappi hoy» y «Bigotes vivo»); los dos con el asistente se juntaron en uno. Quien tenía guardado un modo viejo entra al prototipo final.

| Rappi hoy | Prototipo final |
|:---:|:---:|
| <img src="docs/screenshots/02-home-rappi-hoy.jpg" width="300" alt="Home de Rappi hoy"> | <img src="docs/screenshots/01-home-final.jpg" width="300" alt="Home del prototipo final con Mochi"> |
| Buscador original | Mochi vive en la Home y la misma barra abre su buscador |

En el **prototipo final** Mochi de cuerpo entero vive en la Home (`src/screens/home/live/`), sin ícono de chat. Al entrar saluda y, la primera vez, hace una guía de 3 pasos (el buscador, el pasaporte y «Jugar», con «Siguiente» y «Saltar»; no vuelve a aparecer, salvo con «Repetir escena»); no sugiere productos ni reordena la Home. La Home suma el pasaporte del juego de verticales (bajo los accesos de siempre; ver «Juego de verticales»), «¿Qué plan tienes hoy?» (un kit de varias verticales) y, al tocar a Mochi, una vertical por probar. Mochi saluda al llegar, salta, apunta y gira según lo que dice, y en espera mira alrededor, baila o se estira; sin nada que decir se asoma desde el borde y al hacer scroll se esconde, para no tapar la Home. Lo que se agrega al carro fuera de la Home lo comenta al volver, si combina con algo de otra vertical. La barra de la Home y la lupa de abajo abren el buscador con Mochi (ver más abajo), y al entregar un pedido ofrece armar el próximo. En el celular, «Repetir escena de Mochi» está en Account. «↺ Repetir escena», junto al interruptor, vuelve a empezar. Respeta «reducir movimiento» del sistema.

## Juego de verticales

En el prototipo final, el **pasaporte Rappi** de la Home es el del juego de verticales (traído de `rappi-juego-verticales`, que queda como histórico): 9 sellos (Súper, Express, Turbo, Licores, Chocolatería, Restaurantes, Farmacia, Rappi Mall y Viajes), uno por vertical en nivel Explorador o más. Un sello se gana jugando (descubrir un dato) o abriendo la vertical en la app (Viajes: RappiTravel); Conocedor y Experto, solo jugando, y se ven en el borde del sello. Con 4 sellos, envío gratis en la demo.

- **Desde la Home:** el título del pasaporte abre el pasaporte del juego; «Jugar», su camino de verticales; cada sello, su hoja con «Jugar» y «Abrir {vertical}». Mochi, al tocarlo, propone jugar la primera vertical sin sello.
- **Mientras llega el pedido:** el seguimiento ofrece «Juega mientras llega tu pedido», una ronda de 5 pasos en una vertical sin sello. Arriba, una franja con el tiempo que falta; si el pedido llega a mitad de ronda, avisa con «Ver pedido».
- **El juego:** cada vertical enseña su mundo (el cacao en Chocolatería, el vino y el pisco en Licores, aviones y destinos en Viajes; Súper, Express y Turbo traen temas variados). Una ronda tiene 5 pasos: 2 datos «¿Sabías que…?» que se dan vuelta, 2 preguntas curiosas y 1 desafío del catálogo (Viajes, sin catálogo: 3 preguntas). Los datos van al álbum con su fuente, que se abre en otra pestaña. Además, XP y nivel (Conocedor: 6 de las 12 tarjetas y 3 aciertos; Experto: las 12 y 8), misión del día y racha.
- **Contenido:** 108 tarjetas (6 datos y 6 preguntas por vertical) en `src/game/knowledge.json`, escritas con palabras propias y verificadas una por una contra su fuente ([informe](../docs/resultados/juego-verificacion-2026-10-09.md)). Los desafíos del catálogo usan agregados del catálogo del 05-10-2026 (`src/data/verticales.json`, sin conceptos sensibles; `npm run datos -- "<04 Mapa multivertical.html>"` los regenera).
- **Farmacia** se puede jugar desde el pasaporte, pero ni Mochi ni el seguimiento la proponen (la salud no se empuja). Licores lleva la marca «+18».
- El progreso es de demo: se guarda solo en el navegador. «Repetir escena» lo deja como al empezar.

| El juego | Mientras llega el pedido |
|:---:|:---:|
| <img src="docs/screenshots/31-juego-camino.jpg" width="240" alt="Camino de verticales del juego"> | <img src="docs/screenshots/32-juego-espera.jpg" width="240" alt="Ronda con la franja del pedido"> |
| Camino de verticales, misión del día y nivel | La ronda muestra cuánto falta para el pedido |

## Lo nuevo de la propuesta

### Mochi, el buscador

En el prototipo final no hay chat escrito, voz ni foto: la barra de la Home («¿Qué se te antoja hoy?») abre el buscador con Mochi, que reúne el buscador de siempre y lo que Mochi sabe de ti:

- **Aprendiendo de ti:** arriba muestra lo que va aprendiendo («🍺 Cerveza · 🥃 Copete») y un botón **Olvidar** que lo borra, también en la API.
- **Toca y te armo algo:** botones con ideas fijas («¿Qué almuerzo hoy?», «Arma un carrete», «Algo dulce»). Al tocar uno, Mochi responde con productos y tiendas; si abres una tienda desde ahí y vuelves, la búsqueda sigue donde estaba.
- **El campo de búsqueda** consulta la API y muestra los productos en un grupo por vertical, con la de la pantalla primero y «Ver más» en cada uno; sin resultados, Mochi dice dónde sí hay lo buscado. Debajo siguen «Recent searches» y «Popular stores», como en la app.
- **Descubre con Mochi:** complementos de lo que le gusta a la persona, de `/recommendations`, cada uno con su vertical para abrirla.

<img src="docs/screenshots/20-asistente.jpg" width="300" alt="Buscador con Mochi tras tocar «Arma un carrete»">

*Buscador con Mochi tras tocar «Arma un carrete» (con el MVP corriendo).*

La captura `docs/screenshots/21-voz.jpg` es de una versión anterior del prototipo (voz), que ya no existe.

Mochi es la mochila Rappi con bigote. En la app usa 4 poses de una sola imagen (`src/assets/mochi-poses.webp`): frontal (quieto), feliz (saluda o lo señalas con el mouse), tímido (piensa o escucha) y saltando (al tocarlo). Respira, se inclina hacia el mouse y, en la Home, salta, gira y baila según lo que dice.

<img src="docs/screenshots/30-ficha-mochi.jpg" width="640" alt="Ficha de Mochi: giro, expresiones y poses">

*Ficha del personaje: giro, expresiones y poses.*

### Recomendaciones entre verticales

En el prototipo final no hay filas de sugerencias al entrar a una vertical ni en la Home: Mochi recomienda entre verticales cuando se le pide (el buscador con Mochi, «Preguntarle a Mochi» en un producto, «¿Me falta algo?» en el checkout) y, en la Home, comenta lo agregado si combina con algo de otra vertical.

### Mochi en los momentos clave

- **Sin resultados:** si el buscador con Mochi no encuentra nada pero la consulta es de un tema conocido («chela» → cerveza), Mochi dice «Aquí no hay «chela», pero en Licores sí» y lleva ahí. Si no reconoce el tema, invita a buscar con otras palabras. Nunca ofrece Farmacia ni cosas de bebé por su cuenta.
- **Pedido en camino:** en el mapa, Mochi está tímido mientras se prepara el pedido, de frente en camino y feliz con «¡Ya casi!» en el tramo final; al llegar, salta en el aviso del juego.
- **¿Me falta algo?:** en el checkout, un botón «¿Me falta algo? Pregúntale a Mochi». Solo al tocarlo, Mochi sugiere UNA cosa de otra vertical con su razón («Llevas 🍺 Cerveza → 🥩 Carnes»), «Agregar» y «Deshacer». Nada aparece por su cuenta.

### Mochi fuera de la Home

En el prototipo final, Mochi flota a un costado en las demás pantallas (no en la Home, el buscador con Mochi, el juego, el checkout ni el seguimiento), sobre la barra inferior o la del carrito, y se achica al hacer scroll:

- **Tocarlo:** salta y abre un menú: «Buscar con Mochi», «Revisar mi carrito · $total» (o «¿Qué puedo probar?» con el carro vacío), «Mover al otro lado» y «Silenciar por hoy». Escape o tocar fuera lo cierran.
- **Moverlo:** arrastrarlo lo deja en el lado más cercano; el lado se recuerda en el navegador.
- **Al agregar al carro:** «¡Listo! … está en tu carrito» con «Deshacer», 4 s. No sugiere nada: eso queda para la Home al volver.
- **Preguntarle por un producto:** mantener presionada una tarjeta muestra «Preguntarle a Mochi» (abre el buscador con «¿Con qué acompaño …?»). En escritorio también se puede arrastrar la tarjeta hasta Mochi.
- **Silencio:** «Silenciar por hoy» lo deja como una pestañita en el borde hasta mañana (tocarla lo despierta). Si se cierran dos globos seguidos, no habla por su cuenta el resto de la sesión. «Repetir escena» lo despierta.

### Compra completa

| Checkout | Seguimiento | Entregado |
|:---:|:---:|:---:|
| <img src="docs/screenshots/25-checkout.jpg" width="240" alt="Checkout"> | <img src="docs/screenshots/26-seguimiento.jpg" width="240" alt="Seguimiento"> | <img src="docs/screenshots/27-entregado.jpg" width="240" alt="Pedido entregado"> |
| Delivery o retiro, propina y desglose (envío gratis con Pro). El medio de pago es un texto de ejemplo. | Simulado: los pasos avanzan solos y Mochi recorre la ruta en el mapa; se puede jugar mientras llega. | Calificación y la siguiente sugerencia cruzada. |

También:

- **Hoja de producto:** al tocar un producto se abre una hoja con la cantidad, notas para la tienda y el total, y desde ahí se puede ir a la tienda.
- **Mis pedidos** (en Account): cada pedido hecho en el prototipo abre su seguimiento, en curso o entregado; el carro, los favoritos, la dirección y Loyalty se guardan en el navegador y sobreviven a una recarga.
- **Turbo** con los pasillos de su tienda con más productos vigentes (pestañas arriba y en Categories), con sus productos y «Ver más», que se agregan al carro, además de las pestañas Favorites y Offers.
- **Menús reales** de los restaurantes, con pestañas por sección: salen de la API (`/catalog`), el catálogo que descarga el scraper. La portada es la foto de un plato popular: la base no guarda los logos de los restaurantes.
- **Loyalty**, con un programa de fidelización vinculable.
- **Si algo falla:** una pantalla con error muestra «Algo salió mal» y «Volver al inicio» sin cerrar la app, y una imagen que no carga muestra un respaldo neutro.

<img src="docs/screenshots/28-loyalty-vinculado.jpg" width="240" alt="Loyalty con un programa vinculado">

*Loyalty con un programa vinculado (con el MVP corriendo).*

## Pantallas replicadas de Rappi

Calcadas de las capturas del iPhone, en modo "Rappi hoy" (sin agregados de la propuesta). El diseño es de las capturas; las tiendas, los productos y los precios son del catálogo real (ver «De dónde salen las pantallas»).

| Restaurants | Turbo | Deals | Favorites |
|:---:|:---:|:---:|:---:|
| <img src="docs/screenshots/10-restaurants.jpg" width="190" alt="Restaurants"> | <img src="docs/screenshots/11-turbo.jpg" width="190" alt="Turbo"> | <img src="docs/screenshots/12-deals.jpg" width="190" alt="Deals"> | <img src="docs/screenshots/13-favorites.jpg" width="190" alt="Favorites"> |

| Account | Grocery | Liquor | RappiTravel |
|:---:|:---:|:---:|:---:|
| <img src="docs/screenshots/14-account.jpg" width="190" alt="Account"> | <img src="docs/screenshots/15-grocery.jpg" width="190" alt="Grocery"> | <img src="docs/screenshots/16-liquor.jpg" width="190" alt="Liquor"> | <img src="docs/screenshots/17-rappitravel.jpg" width="190" alt="RappiTravel"> |

Además: Pharmacy, Retail, Express, Chocolates, Loyalty, buscador, página de tienda y carrito. Pet (Mascotas) salió: la base no tiene esa vertical.

## De dónde salen las pantallas

Las pantallas de catálogo leen la API (`/catalog`, `src/api/catalog.js`) y la app solo pone el diseño:

| Pantalla | Qué viene de la API |
|---|---|
| Verticales (Grocery, Pharmacy, Retail, Liquor, Express, Chocolates) | Las tiendas (una tarjeta por formato) y «Bajaron de precio» |
| Tienda | Sus pasillos, de a una página de productos (24, con «Ver más») y el precio vigente de cada uno |
| Restaurante | Su menú con precios; la portada es la foto de un plato popular |
| Turbo | Los pasillos de la tienda Turbo con más productos vigentes y sus productos |
| Deals (Offers) | «Bajaron de precio» por vertical (se excluyen las bajas de más de 60 %: en la base real eran graneles, precio por kilo contra precio por unidad) y «Mejor evaluados» |
| Favorites y Home | «Los mejores» y las listas de la Home (restaurantes rápidos, «Cerca de ti», «Mejor evaluados») |

- **Un producto muestra el precio y la tienda de su oferta vigente más barata entre las tiendas que se pueden abrir**, para que el precio y la tienda nunca se contradigan. Si ninguna tienda abrible lo vende, no ofrece «Ver tienda».
- **Sin «Envío más barato»:** el costo de envío es $0 en el 91 % de la base, casi seguro «sin dato», así que la Home y Deals muestran «Mejor evaluados» y un envío de $0 no se presenta como gratis.
- **Si la API falla** en una pantalla, esa pantalla muestra «Sin conexión» con «Reintentar» y el resto de la app sigue usable; una tienda que no está en la base muestra «Esta tienda no está en el catálogo».
- **Nada local:** el buscador (`/search`), el chat (`/chat`), los kits y comentarios de Mochi (`/mochi/plans`, `/mochi/offer`), «Para ti» y «Descubre» (`/recommendations`) y lo aprendido (`/profile`) salen de la API; el cerebro local, los temas y el catálogo transcrito se borraron. Mochi no propone por su cuenta alcohol, farmacia, bebé ni salud: solo el kit de una ocasión elegida puede traer alcohol, con +18.

## Qué es real y qué es simulado

- **Real:** las tiendas, productos, precios, menús y ofertas que muestran las pantallas (vienen de la API, que lee la base que descarga el scraper), el carrito, los pedidos y el historial del navegador.
  - **De la API** vienen también la búsqueda y los productos y precios que muestra Mochi.
- **De las capturas:** el diseño (títulos, filas de categorías, banners, íconos). No son catálogo: no apuntan a ninguna tienda ni producto.
- **Simulado:** el pago y el seguimiento (el pedido «llega» a los 20 s), y el progreso del juego (solo en el navegador).
- **Privacidad:** el id de usuario es seudónimo (`proto-…`, guardado en este navegador). El carro, los favoritos, la dirección, Loyalty y los pedidos también se guardan solo en este navegador. "Olvidar" borra lo aprendido también en la API. En modo "Rappi hoy" no se aprende.
- **Supuestos:** textos cortados en el borde de las capturas, marcados como "supuesto" en los archivos `data.js`. Lo que la API no sabe (tiempo de entrega de un producto, nota, costo de envío: un $0 es un dato que falta, no «envío gratis») no se muestra.

## Estructura

```text
src/
├── api/            Cliente de la API de rappi-ia (catálogo, chat, "Para ti", pedidos, eventos), con tiempo límite y errores tipados; fixtures/ guarda las respuestas de ejemplo que escribe el backend (`make contract` en rappi-ia)
├── assistant/      El texto con que se le pregunta a Mochi por un producto (`¿Con qué acompaño…?`)
├── assets/         Recortes de las capturas
├── game/           Lógica del juego de verticales: tarjetas de conocimiento, desafíos, XP, niveles, pasaporte (lógica pura, con tests)
├── components/     Piezas compartidas; assistant/ tiene la mascota, la barra de la Home, el buscador con Mochi y Descubre
├── data/           Accesos y verticales de la Home; verticales.json del juego
├── hooks/          Navegación con historial, scroll
├── screens/        Una carpeta por pantalla (home, deals, vertical, checkout, tracking, game…)
├── state/          Carrito, perfil, pedidos, hoja de producto, modo demo, dirección… (varios persisten en localStorage)
└── styles/         Tokens de diseño y estilos globales
docs/screenshots/   Capturas de este README
public/             Íconos y manifiesto para "Agregar a pantalla de inicio"
scripts/            Íconos, capturas y el recorrido de `make mvp-check` (Home, compra, kit de Mochi y API caída)
```
