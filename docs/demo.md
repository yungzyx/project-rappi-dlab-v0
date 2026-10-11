# Guion de demo del MVP

Unos 10 minutos para mostrar el prototipo final a una persona del negocio: qué ve el usuario en la app, cómo Mochi cruza verticales y cómo invita a descubrir las que no usa (pasaporte y juego). Se hace con el MVP corriendo (`make mvp`): la app no abre sin la API.

## Antes de empezar

En una terminal del Mac donde está la base, desde la raíz del repositorio:

```bash
make mvp             # esperar «MVP listo: app http://localhost:5174 · panel …» (la API carga los modelos antes)
make mvp LAN=1       # si se muestra desde un iPhone en la misma red (solo en una red de confianza)
```

Si la app muestra **«Sin conexión con Mochi»**, la API todavía no terminó de cargar o no está corriendo: espera a «MVP listo» (la pantalla vuelve a probar sola cada 2 s; **Reintentar** prueba al instante) (qué más revisar, en [instalación](instalacion.md#5-el-mvp)). Antes de una presentación, `make mvp-check` comprueba que la app y la API se hablan (la Home, una compra en el Súper de prueba hasta el pago, el kit de Mochi, una ronda del juego, el panel con «Uso del MVP» y la caída de la API), contra un catálogo de prueba inventado y sin tocar la base real; no lo corras junto con los tests de rappi-ia.

1. Abre el prototipo (http://localhost:5174) y deja el modo **Prototipo final** (arriba a la izquierda; la tecla **D** alterna con «Rappi hoy», la app como es hoy).
2. Justo antes de presentar, con la API arriba: `cd rappi-ia && make warm`. Pasa por los botones del guion sin registrarlos: en frío la primera respuesta tarda de 2 a 5 s; después, menos de medio segundo. Repetirlo si la API pasó un rato sin uso.
3. Para empezar sin rastros de pruebas anteriores, toca la barra de la Home («¿Qué se te antoja hoy?») para abrir el buscador con Mochi y, arriba, en «Aprendiendo de ti», toca **Olvidar**: borra lo aprendido y los eventos del usuario de este navegador, y Mochi lo confirma («Listo, olvidé lo que aprendí de ti»). El botón aparece siempre, aunque Mochi todavía no haya aprendido nada.

## Recorrido

En el prototipo final la barra de la Home abre el buscador con Mochi y se toca. El campo de arriba busca tiendas y productos; las ideas de Mochi están en los botones de «Toca y te armo algo».

| # | Qué tocar | Qué mostrar | Qué decir |
|---|---|---|---|
| 1 | La barra de la Home y, en «Toca y te armo algo», **🍻 Arma un carrete** | Va directo a Licores sin preguntar: cervezas, licores y snacks, y las botillerías. Con la API, productos reales del catálogo, la sugerencia de otra vertical aparte y la fila **«También en»** (otras verticales con tiendas reales). | Entiende ocasiones, no solo productos. El mismo concepto existe en varias verticales: hoy cada una lo muestra por separado. |
| 2 | **🍔 ¿Qué almuerzo hoy?** | Solo restaurantes que llegan rápido, sin mezclar con lo anterior. | La búsqueda no se mezcla: responde en su vertical. |
| 3 | Arriba, «Aprendiendo de ti» muestra lo que Mochi notó de la persona (el perfil lo arma el servidor con sus eventos); **Olvidar** lo borra. | Los conceptos aprendidos, sin los sensibles. Tras **Olvidar**, Mochi lo confirma y la lista desaparece. | Cada toque enseña y la persona puede borrarlo: la memoria es transparente. |
| 4 | Un producto de la respuesta → en la tienda, bajo **«Lo que elegiste»**, tócalo de nuevo. | Se abre la hoja del producto: cantidad, notas para la tienda y el total. **Agregar.** | Lo que Mochi recomienda se compra con el mismo flujo de la app, sin salir a otra pantalla. |
| 4b | Volver con la flecha del buscador. | El buscador con Mochi se reabre donde estaba, con la misma respuesta. | Mochi no es otro canal: es parte del buscador, y se vuelve a él como a cualquier pantalla. |
| 5 | Abre el carro, revisa y recarga la página. | El carro sigue ahí (se guarda en el navegador). **Checkout** → delivery o retiro, propina y desglose → pagar. | El pedido se confirma; el pago es un texto de ejemplo. |
| 5b | **Account → Orders** (o «See all» en Recent orders) | **Mis pedidos**: el pedido recién hecho con su seguimiento en curso; al tocarlo, el mapa con Mochi recorriendo la ruta. | El seguimiento avanza solo, para la demo. |
| 6 | De vuelta en el buscador con Mochi, baja hasta **Descubre con Mochi** y toca una tarjeta. | La tarjeta dice por qué la propone (un complemento de lo que le gusta a la persona, de una vertical que quizá no abre) y abre esa vertical. | Lo aprendido también sirve para llevar a la persona a verticales donde nunca pidió. |
| 6b | En la Home, el acceso **Turbo**. | Los pasillos de la tienda Turbo (pestañas arriba) con sus productos reales y «Ver más», que se agregan al carro. | Opcional: muestra que la compra rápida también vive en el prototipo. |
| 6c | En la Home, un acceso de vertical (**Grocery**, **Liquor**…) → una tienda → **Ver más**. | Las tiendas reales de la vertical, la tienda con sus pasillos y precios vigentes, y la página siguiente de productos; en Licores, la marca **+18**. | Opcional: las pantallas de siempre, pero con el catálogo real. |
| 7 | En el buscador con Mochi, escribe **chela**. | No hay resultados con esa palabra, pero Mochi dice dónde sí hay lo que se buscaba («… sí hay en Licores») y **Ver en Licores** lleva ahí. | Un «sin resultados» no termina en un callejón sin salida: Mochi entiende el tema. |
| 7b | En el buscador con Mochi, escribe **cerveza**. | La API busca en todas las verticales y muestra **un grupo por vertical** (Licores, Express, Súper…), con «Ver más» en cada uno y la marca **+18**. Con el buscador abierto desde una vertical, esa va primero. | Un mismo producto se encuentra en varias verticales, sin elegir una antes. |
| 8 | En el checkout, toca **¿Me falta algo? Pregúntale a Mochi**. | Una sola sugerencia de otra vertical con su razón («Antes de pagar: … Combina con lo que llevas»), **Agregar** y **Deshacer**. Nunca trae alcohol, farmacia, bebé ni salud: Mochi no los propone por su cuenta. | Mochi sugiere cuando se le pide, en el momento en que más sirve, y sin empujar lo delicado. |

Los productos y precios salen del catálogo real y la sugerencia de otra vertical la decide Mochi en el servidor; la búsqueda también es de la API. Las pantallas de catálogo (verticales, tiendas, restaurantes con su menú, Turbo, Ofertas, Favoritos y la Home) leen el mismo catálogo. No hay respaldo local: si la API se cae a mitad de la demo, el buscador con Mochi dice «Sin conexión» con **Reintentar**, que vuelve a mandar la misma pregunta, y las ofertas que Mochi hace solo callan. Los botones **🍫 Algo dulce**, **🎁 Un regalo** y **🔥 Ofertas de hoy**, y el campo de búsqueda (con «Search ideas» (ideas fijas, no un historial) y «Popular stores» como en la app) quedan para preguntas del público.

### La Home con Mochi de cuerpo entero (2 minutos, opcional)

Es lo primero que se ve en el prototipo final. Para partir de cero: **↺ Repetir escena** (junto al interruptor, arriba a la izquierda).

1. Mochi entra caminando a la Home y saluda. No sugiere productos ni mueve la Home: la Home es la de siempre, con el pasaporte de verticales justo bajo los accesos. **Qué decir:** Mochi es parte de la Home, no un canal aparte.
1b. La primera vez, después del saludo, Mochi hace una guía de 3 pasos: el buscador, el pasaporte y «Jugar» (**Siguiente** / **Saltar**). No vuelve a aparecer; «↺ Repetir escena» la muestra de nuevo.
2. Baja hasta «¿Qué plan tienes hoy?» (cinco ocasiones) y elige **Carrete**: un kit de varias verticales con un solo botón. Como la persona eligió la ocasión, el kit puede traer alcohol, con la marca **+18**; en lo que Mochi ofrece por su cuenta nunca hay alcohol, farmacia, bebé ni salud.
3. Toca a Mochi: propone jugar una vertical que falta en el pasaporte. Con «Abrir» la sellas al entrar y, al volver, lo celebra.

El pasaporte y su envío gratis son una idea para probar con usuarios, no una promoción real.

### Juego de verticales (2 minutos, opcional)

1. En el pasaporte de la Home, toca **Jugar**: el camino de las 9 verticales con la misión del día. Juega una ronda de Chocolatería (5 pasos: datos «¿Sabías que…?» que se dan vuelta, preguntas curiosas y un desafío que la API arma con el catálogo) y abre el **Álbum**: cada dato trae su fuente. Si recargas la página, el progreso sigue: vive en el servidor. **Qué decir:** cada vertical enseña su mundo con datos verificados, para que la persona conozca verticales que no usa, jugando y sin que se le pida comprar.
2. Haz un pedido y, en el seguimiento, toca **«Juega mientras llega tu pedido»**: la ronda muestra arriba cuánto falta y avisa cuando llega (en la demo, a los 20 s). **Qué decir:** la espera se aprovecha para descubrir otra vertical y suma un sello.
3. Vuelve a la Home: el sello nuevo está en el pasaporte.
4. Abre el buscador con Mochi y toca **Algo dulce**: la respuesta trae un **«¿Sabías que…?»** con su fuente, ligado a lo que se buscó, y lo suma al álbum. **Qué decir:** el juego y el buscador comparten una sola base de conocimiento; Mochi nunca trae un dato de alcohol o salud por su cuenta.

### El panel con lo que acaba de pasar (2 minutos, opcional)

Con `make mvp` el panel ya está arriba. Después de la demo de la app, ábrelo en [http://localhost:5175/?vista=mvp&fuente=prototipo](http://localhost:5175/?vista=mvp&fuente=prototipo) (o elige **Prototipo** arriba y la pestaña **Uso del MVP**; **Actualizar** vuelve a pedir lo nuevo sin recargar).

1. **Ofertas del agente por momento:** el kit de «Carrete» aparece en **Plan** y, si usaste el carro o el checkout, en **Carro** y **Antes de pagar**, con lo mostrado y lo aceptado. **Qué decir:** así se ve en qué momento la oferta de Mochi funciona; el porcentaje aparece recién con 10 mostradas, antes solo las cuentas.
2. **Juego:** las rondas terminadas y las tarjetas descubiertas, por vertical del juego. Las estrellas promedio aparecen desde 5 rondas.
3. **Búsquedas sin resultado:** una búsqueda sin resultado en la app (por ejemplo, algo que el catálogo no tiene) suma a su vertical; el concepto solo se suma si la pregunta pasó por el agente (las búsquedas de la app no llevan concepto). Nunca se ve lo que se escribió.

**Qué decir:** cada bloque lleva el rótulo «uso del MVP, pocas personas: no es evidencia». Son las pruebas de unas pocas personas, no una medición, y nunca se mezclan con los datos simulados del resto del panel. «Olvidar» en la app borra también los eventos de esa persona.

## Qué aclarar si preguntan

- **De dónde salen los productos:** del catálogo público de rappi.cl (muestra de hasta 24 productos por sub-pasillo), con precios vigentes. Un producto muestra el precio y la tienda de su oferta vigente más barata entre las tiendas que se pueden abrir, así que no siempre es el mínimo absoluto.
- **Ofertas:** son productos con una rebaja que marca la tienda o una baja de precio respecto de la descarga anterior, sin las de más de 60 % (en la base real eran graneles: precio por kilo contra precio por unidad). No hay «Envío más barato»: el costo de envío es $0 en el 91 % de la base, casi seguro «sin dato», así que la Home y Ofertas muestran «Mejor evaluados».
- **Por qué no está Mascotas:** la base no tiene esa vertical, así que salió de los accesos y de las pantallas.
- **Por qué no siempre sale Restaurantes:** la vertical se elige donde el concepto es típico, no donde hay más ítems; restaurantes solo compite en lo que se pide hecho (comida, postres, café). Una vertical chica tampoco gana con un puñado de productos: necesita oferta suficiente. Ver [decisiones.md](decisiones.md#agente-bigotes).
- **Cómo se mediría el efecto:** la API ya registra cada sugerencia mostrada, aceptada y convertida en pedido (eventos seudónimos). Con datos de Rappi y un experimento A/B con grupo de control se mide si sube la frecuencia y cuántas verticales usa cada persona.
- **Qué va con qué:** los complementos (hamburguesa → gaseosas, vino → quesos) son una lista escrita a mano. Con datos de pedidos de Rappi se reemplazan por relaciones medidas, sin cambiar el mecanismo.
