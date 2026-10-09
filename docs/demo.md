# Guion de demo del MVP

Unos 10 minutos para mostrar el prototipo final a una persona del negocio: qué ve el usuario en la app, cómo Mochi cruza verticales y cómo invita a descubrir las que no usa (pasaporte y juego). Se hace con la API corriendo; sin ella Mochi responde con reglas locales.

## Antes de empezar

En dos terminales del Mac donde está la base:

```bash
cd rappi-ia && make serve            # esperar «Application startup complete» (carga los modelos)
cd prototipo-app && npm run dev      # http://localhost:5174
```

1. Abre el prototipo y deja el modo **Prototipo final** (arriba a la izquierda; la tecla **D** alterna con «Rappi hoy», la app como es hoy).
2. Justo antes de presentar, con la API arriba: `cd rappi-ia && make warm`. Pasa por los botones del guion sin registrarlos: en frío la primera respuesta tarda de 2 a 5 s; después, menos de medio segundo. Repetirlo si la API pasó un rato sin uso.
3. Para empezar sin rastros de pruebas anteriores, toca la barra de la Home («¿Qué se te antoja hoy?») para abrir el buscador con Mochi y, arriba, en «Aprendiendo de ti», toca **Olvidar**: borra lo aprendido y los eventos del usuario de este navegador, y Mochi lo confirma («Listo, olvidé lo que aprendí de ti»). El botón solo aparece si Mochi ya aprendió algo.

## Recorrido

En el prototipo final no se escribe en un chat: la barra de la Home abre el buscador con Mochi y se toca. El campo de arriba busca tiendas y productos; las ideas de Mochi están en los botones de «Toca y te armo algo».

| # | Qué tocar | Qué mostrar | Qué decir |
|---|---|---|---|
| 1 | La barra de la Home y, en «Toca y te armo algo», **🍻 Arma un carrete** | Va directo a Licores sin preguntar: cervezas, licores y snacks, y las botillerías. Con la API, productos reales del catálogo, la sugerencia de otra vertical aparte y la fila **«También en»** (otras verticales con tiendas reales). | Entiende ocasiones, no solo productos. El mismo concepto existe en varias verticales: hoy cada una lo muestra por separado. |
| 2 | **🍔 ¿Qué almuerzo hoy?** | Solo restaurantes que llegan rápido, sin mezclar con lo anterior. | La búsqueda no se mezcla: responde en su vertical. |
| 3 | Arriba, «Aprendiendo de ti» ya muestra lo que Mochi notó, y los botones cambiaron: toca **🍺 Más cerveza** | Cervezas y, aparte, un bloque **«¿Te tinca sumar snacks? Porque llevas 🍺 cerveza»** con productos de otra vertical y su botón «Ver más en …». | Cada toque enseña: las ideas siguientes salen de lo que la persona ya pidió. Lo de otra vertical va aparte, una sola vez y con su razón a la vista. |
| 4 | Un producto de la respuesta → en la tienda, bajo **«Lo que elegiste»**, tócalo de nuevo. | Se abre la hoja del producto: cantidad, notas para la tienda y el total. **Agregar.** | Lo que Mochi recomienda se compra con el mismo flujo de la app, sin salir a otra pantalla. |
| 4b | Volver con la flecha del buscador. | El buscador con Mochi se reabre donde estaba, con la misma respuesta. | Mochi no es otro canal: es parte del buscador, y se vuelve a él como a cualquier pantalla. |
| 5 | Abre el carro, revisa y recarga la página. | El carro sigue ahí (se guarda en el navegador). **Checkout** → delivery o retiro, propina y desglose → pagar. | El pedido se confirma; el pago es un texto de ejemplo. |
| 5b | **Account → Orders** (o «See all» en Recent orders) | **Mis pedidos**: el pedido recién hecho con su seguimiento en curso; al tocarlo, el mapa con Mochi recorriendo la ruta. | El seguimiento avanza solo, para la demo. |
| 6 | De vuelta en el buscador con Mochi, baja hasta **Descubre con Mochi** y toca **Explorar** en una tarjeta. | «Exploraste N de 9» con las verticales sin probar; la tarjeta dice por qué (p. ej. «Te gusta 🍺 cerveza → 🍿 Snacks en Express») y abre esa vertical. | Lo aprendido también sirve para llevar a la persona a verticales donde nunca pidió. |
| 6b | En la Home, el acceso **Turbo**. | Productos por categoría (Frescos, Despensa, Picoteo) que se agregan al carro. | Opcional: muestra que la compra rápida también vive en el prototipo. |

Con la API, los productos y precios de los pasos 1 a 3 salen del catálogo real y la sugerencia de otra vertical la decide Mochi en el servidor (con «Respuesta local» si la API no contestó). Los botones **🍫 Algo dulce**, **🎁 Un regalo** y **🔥 Ofertas de hoy**, y el campo de búsqueda (tiendas y productos, con «Recent searches» y «Popular stores» como en la app) quedan para preguntas del público.

### La Home con Mochi de cuerpo entero (2 minutos, opcional)

Es lo primero que se ve en el prototipo final. Para partir de cero: **↺ Repetir escena** (junto al interruptor, arriba a la izquierda).

1. Mochi entra caminando a la Home y saluda. No sugiere productos ni mueve la Home: la Home es la de siempre, con el pasaporte de verticales justo bajo los accesos. **Qué decir:** Mochi es parte de la Home, no un canal aparte.
2. Baja hasta «¿Qué plan tienes hoy?» y elige **Carrete**: un kit de tres verticales con un solo botón.
3. Toca a Mochi: propone jugar una vertical que falta en el pasaporte. Con «Abrir» la sellas al entrar y, al volver, lo celebra.

El pasaporte y su envío gratis son una idea para probar con usuarios, no una promoción real.

### Juego de verticales (2 minutos, opcional)

1. En el pasaporte de la Home, toca **Jugar**: el camino de las 8 verticales con la misión del día. Juega una ronda (5 pasos: conceptos que se dan vuelta y desafíos de 4 opciones). **Qué decir:** el catálogo y el grafo de conceptos sirven para que la persona conozca verticales que no usa, jugando y sin que se le pida comprar.
2. Haz un pedido y, en el seguimiento, toca **«Juega mientras llega tu pedido»**: la ronda muestra arriba cuánto falta y avisa cuando llega (en la demo, a los 20 s). **Qué decir:** la espera se aprovecha para descubrir otra vertical y suma un sello.
3. Vuelve a la Home: el sello nuevo está en el pasaporte.

## Qué aclarar si preguntan

- **De dónde salen los productos:** del catálogo público de rappi.cl (muestra de hasta 24 productos por sub-pasillo), con precios vigentes.
- **Por qué no siempre sale Restaurantes:** la vertical se elige donde el concepto es típico, no donde hay más ítems; restaurantes solo compite en lo que se pide hecho (comida, postres, café). Una vertical chica tampoco gana con un puñado de productos: necesita oferta suficiente. Ver [decisiones.md](decisiones.md#agente-bigotes).
- **Cómo se mediría el efecto:** la API ya registra cada sugerencia mostrada, aceptada y convertida en pedido (eventos seudónimos). Con datos de Rappi y un experimento A/B con grupo de control se mide si sube la frecuencia y cuántas verticales usa cada persona.
- **Qué va con qué:** los complementos (hamburguesa → gaseosas, vino → quesos) son una lista escrita a mano. Con datos de pedidos de Rappi se reemplazan por relaciones medidas, sin cambiar el mecanismo.
