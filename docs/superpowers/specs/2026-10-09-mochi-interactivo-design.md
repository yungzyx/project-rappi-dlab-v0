# Mochi interactivo y momentos clave

> Especificación · 09-10-2026 · Estado: **para revisión del usuario**
> Parte de la etapa 1 (PR #44: Mochi reemplaza a Bigotes, celebra cada sello y salta al tocarlo).

## 1. Para qué

Que Mochi acompañe a la persona **fuera de la Home** y aparezca en los momentos donde el cruce entre verticales vale
más (no encontrar algo, esperar el pedido, pagar), sin volverse molesto. Todo solo en el **prototipo final**:
«Rappi hoy» queda igual que la app actual.

### Criterios de éxito

1. Fuera de la Home, Mochi está a mano en un costado, se puede mover al otro lado y callar por hoy.
2. Una búsqueda sin resultados nunca termina en un callejón sin salida si otra vertical lo tiene.
3. Mientras llega el pedido, Mochi cuenta en qué va con su pose; al llegar, avisa aunque se esté jugando.
4. Antes de pagar hay **una** sugerencia de otra vertical, con su razón y «Deshacer».
5. La primera vez, una guía de 3 pasos que se puede saltar.
6. Tests nuevos para cada punto; `npm test` y `npm run lint` en verde; revisado en el navegador.

## 2. Etapas

### Etapa 2 · Mochi interactivo (a partir de `Prototipo original — Mochi interactivo.html`)

- **Dónde está:** flotando en un costado sobre la barra inferior o la del carrito, en todas las pantallas del
  prototipo final **menos**: la Home (ahí ya vive de cuerpo entero), el buscador con Mochi (tiene su avatar), el
  juego (tiene el suyo), el checkout y el seguimiento (tiene el del mapa). Al hacer scroll se achica (68 → 54 px).
- **Tocarlo:** salta y abre un menú corto: «Buscar con Mochi», «Revisar mi carrito · $total» (o «¿Qué puedo probar?»
  con el carro vacío), «Mover al otro lado» y «Silenciar por hoy». Escape o tocar fuera lo cierra; el foco vuelve a él.
- **Moverlo:** arrastrarlo lo deja en el lado más cercano. El lado se recuerda en el navegador (comodidad por persona).
- **Silenciar por hoy:** Mochi queda como una pestañita en el borde, sin globos hasta mañana; tocarla lo vuelve a
  mostrar. Además, si la persona cierra dos globos seguidos, Mochi no habla por iniciativa propia el resto de la sesión.
- **Al agregar al carro** (fuera de la Home): «¡Listo! {producto} está en tu carrito» con «Deshacer», 4 s. Lo de
  sugerir qué combina sigue en la Home al volver («Vi que agregaste…»), para no hablar dos veces de lo mismo.
- **Preguntarle por un producto:** mantener presionada una tarjeta de producto (0,5 s) muestra «Preguntarle a Mochi»;
  abre el buscador con Mochi con «¿Con qué acompaño {producto}?». En escritorio también se puede arrastrar la tarjeta
  hasta Mochi (como en el HTML). Mantener presionado no choca con el scroll en el celular; arrastrar sí.
- **Movimiento reducido:** sin animaciones ni arrastre animado; el menú y «Mover al otro lado» siguen funcionando.

### Etapa 3 · Momentos clave

- **Sin resultados:** si la búsqueda de una vertical no encuentra nada y otra vertical sí (datos del prototipo; con la
  API, la regla «disponible en otra vertical» que ya usa el agente), en lugar de solo «No results» aparece Mochi tímido:
  «Aquí no hay {consulta}, pero en {vertical} sí» con «Ver en {vertical}». Si ninguna lo tiene, Mochi lo dice y ofrece
  «Probar otra búsqueda». Nunca ofrece Farmacia por iniciativa propia (regla de no empujar la salud).
- **Pedido en camino:** en el mapa, la pose sigue la etapa: preparando → tímido (pensando), en camino → frontal,
  último 20 % de la ruta → feliz con «¡Ya casi!» en un globo. En el juego, el aviso «¡Tu pedido llegó!» que ya existe
  suma a Mochi saltando.
- **«¿Te falta algo?» antes de pagar:** en el checkout, una tarjeta con **una** sugerencia de otra vertical
  (complemento del grafo de conceptos, con la razón visible: «Llevas cerveza → snacks»), agregar con un toque y
  «Deshacer». Nunca productos sensibles; alcohol solo con su aviso +18. Se registra con los eventos de sugerencias que
  ya existen (mostrada, aceptada), con un origen nuevo `checkout`.

### Etapa 4 · Guía de la primera vez

- Tras el saludo de la Home, la primera vez: 3 pasos en que Mochi señala el buscador, el pasaporte y «Jugar», con un
  globo corto cada uno, «Siguiente» y «Saltar». Se recuerda en el navegador que ya se vio; «Repetir escena» la
  vuelve a mostrar.

## 3. Fuera de alcance

- Renombrar el código interno (`LiveBigotes`, clases `bigotes-*`) y regenerar diagramas.
- Voz, cámara o chat escrito con Mochi.
- Métricas como evidencia: con datos simulados, los eventos solo sirven para la demo.

## 4. Decisiones para revisar

1. **Comentar al agregar al carro fuera de la Home.** El 09-10 se decidió no tener aviso flotante al agregar; el HTML
   interactivo sí lo tiene. Propuesta: confirmación corta con «Deshacer» (no sugiere nada), y la sugerencia se queda
   en la Home al volver.
2. **Dónde no aparece Mochi flotante:** Home, buscador con Mochi, juego, checkout y seguimiento.
3. **Orden de las etapas:** 2 → 3 → 4, un PR por etapa, cada uno revisado antes de fusionar.
