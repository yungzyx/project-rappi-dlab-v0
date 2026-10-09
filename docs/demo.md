# Guion de demo del MVP

Unos 10 minutos para mostrar el MVP a una persona del negocio: qué ve el usuario en la app, cómo Bigotes cruza verticales y cómo eso llega al panel. Se hace con la API corriendo; sin ella Bigotes responde con reglas locales y el panel con datos guardados.

## Antes de empezar

En tres terminales del Mac donde está la base:

```bash
cd rappi-ia && make serve            # esperar «Application startup complete» (carga los modelos)
cd prototipo-app && npm run dev      # http://localhost:5174
cd dashboard-empresa && npm run dev  # http://localhost:5175
```

1. Abre el prototipo y deja el modo **Prototipo final** (arriba a la izquierda; la tecla **D** alterna con «Rappi hoy», la app como es hoy).
2. Abre el panel en otra pestaña y elige la fuente **Prototipo**: ahí aparece lo que se haga en la demo.
3. Justo antes de presentar, con la API arriba: `cd rappi-ia && make warm`. Pasa por los botones del guion sin registrarlos: en frío la primera respuesta tarda de 2 a 5 s; después, menos de medio segundo. Repetirlo si la API pasó un rato sin uso.
4. Para empezar sin rastros de pruebas anteriores, toca la barra de la Home («¿Qué se te antoja hoy?») para abrir el buscador con Bigotes y, arriba, en «Aprendiendo de ti», toca **Olvidar**: borra lo aprendido y los eventos del usuario de este navegador, y Bigotes lo confirma («Listo, olvidé lo que aprendí de ti»). El botón solo aparece si Bigotes ya aprendió algo. Lo que se probó desde otros navegadores sigue en la fuente Prototipo.

## Recorrido

En el prototipo final no se escribe en un chat: la barra de la Home abre el buscador con Bigotes y se toca. El campo de arriba busca tiendas y productos; las ideas de Bigotes están en los botones de «Toca y te armo algo».

| # | Qué tocar | Qué mostrar | Qué decir |
|---|---|---|---|
| 1 | La barra de la Home y, en «Toca y te armo algo», **🍻 Arma un carrete** | Va directo a Licores sin preguntar: cervezas, licores y snacks, y las botillerías. Con la API, productos reales del catálogo, la sugerencia de otra vertical aparte y la fila **«También en»** (otras verticales con tiendas reales). | Entiende ocasiones, no solo productos. El mismo concepto existe en varias verticales: hoy cada una lo muestra por separado. |
| 2 | **🍔 ¿Qué almuerzo hoy?** | Solo restaurantes que llegan rápido, sin mezclar con lo anterior. | La búsqueda no se mezcla: responde en su vertical. |
| 3 | Arriba, «Aprendiendo de ti» ya muestra lo que Bigotes notó, y los botones cambiaron: toca **🍺 Más cerveza** | Cervezas y, aparte, un bloque **«¿Te tinca sumar snacks? Porque llevas 🍺 cerveza»** con productos de otra vertical y su botón «Ver más en …». | Cada toque enseña: las ideas siguientes salen de lo que la persona ya pidió. Lo de otra vertical va aparte, una sola vez y con su razón a la vista. |
| 4 | Un producto de la respuesta → en la tienda, bajo **«Lo que elegiste»**, tócalo de nuevo. | Se abre la hoja del producto: cantidad, notas para la tienda y el total. **Agregar.** | Lo que Bigotes recomienda se compra con el mismo flujo de la app, sin salir a otra pantalla. |
| 4b | Volver con la flecha del panel. | El buscador con Bigotes se reabre donde estaba, con la misma respuesta. | Bigotes no es otro canal: es parte del buscador, y se vuelve a él como a cualquier pantalla. |
| 5 | Abre el carro, revisa y recarga la página. | El carro sigue ahí (se guarda en el navegador). **Checkout** → delivery o retiro, propina y desglose → pagar. | El pedido se confirma; el pago es un texto de ejemplo. |
| 5b | **Account → Orders** (o «See all» en Recent orders) | **Mis pedidos**: el pedido recién hecho con su seguimiento en curso; al tocarlo, el mapa con Bigotes recorriendo la ruta. | El seguimiento avanza solo, para la demo. |
| 6 | En el panel: **Entre verticales**, fuente Prototipo. Si el panel ya estaba ahí, toca **Actualizar** (junto a la fecha de corte). | «Bigotes entre verticales»: suben las mostradas, aceptadas y convertidas. | Cada sugerencia queda medida: se ve si se acepta y si termina en compra. |
| 7 | De vuelta en el buscador con Bigotes, baja hasta **Descubre con Bigotes** y toca **Explorar** en una tarjeta. | «Exploraste N de 9» con las verticales sin probar; la tarjeta dice por qué (p. ej. «Te gusta 🍺 cerveza → 🍿 Snacks en Express») y abre esa vertical. | Lo aprendido también sirve para llevar a la persona a verticales donde nunca pidió. |
| 7b | En la Home, el acceso **Turbo**. | Productos por categoría (Frescos, Despensa, Picoteo) que se agregan al carro. | Opcional: muestra que la compra rápida también vive en el prototipo. |
| 8 | En el panel, fuente **Simulados**: Resumen y Oportunidades. | Las decisiones de la semana y lo que la gente pide y no encuentra. | Con datos simulados: muestra la mecánica, no resultados. Con datos de Rappi se mide de verdad. |

Con la API, los productos y precios de los pasos 1 a 3 salen del catálogo real y la sugerencia de otra vertical la decide Bigotes en el servidor (con «Respuesta local» si la API no contestó). Los botones **🍫 Algo dulce**, **🎁 Un regalo** y **🔥 Ofertas de hoy**, y el campo de búsqueda (tiendas y productos, con «Recent searches» y «Popular stores» como en la app) quedan para preguntas del público.

### La Home con Bigotes de cuerpo entero (2 minutos, opcional)

Es lo primero que se ve en el prototipo final. Para partir de cero: **↺ Repetir escena** (junto al interruptor, arriba a la izquierda).

1. Bigotes entra caminando a la Home y saluda. No sugiere productos ni mueve la Home: la Home es la de siempre, con el pasaporte de verticales justo bajo los accesos. **Qué decir:** Bigotes es parte de la Home, no un canal aparte.
2. Baja hasta «¿Qué plan tienes hoy?» y elige **Carrete**: un kit de tres verticales con un solo botón.
3. Toca a Bigotes: propone una vertical que falta en el pasaporte. Ábrela y vuelve: celebra el sello.

El pasaporte y su envío gratis son una idea para probar con usuarios, no una promoción real.

## Qué aclarar si preguntan

- **De dónde salen los productos:** del catálogo público de rappi.cl (muestra de hasta 24 productos por sub-pasillo), con precios vigentes.
- **Por qué no siempre sale Restaurantes:** la vertical se elige donde el concepto es típico, no donde hay más ítems; restaurantes solo compite en lo que se pide hecho (comida, postres, café). Una vertical chica tampoco gana con un puñado de productos: necesita oferta suficiente. Ver [decisiones.md](decisiones.md#agente-bigotes).
- **Los porcentajes del panel en la demo:** con la fuente Prototipo el % de aceptación aparece recién con 10 sugerencias mostradas; antes solo se ven los conteos.
- **Qué va con qué:** los complementos (hamburguesa → gaseosas, vino → quesos) son una lista escrita a mano. Con datos de pedidos de Rappi se reemplazan por relaciones medidas, sin cambiar el mecanismo.
