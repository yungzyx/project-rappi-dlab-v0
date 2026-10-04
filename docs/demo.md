# Guion de demo del MVP

Unos 10 minutos para mostrar el MVP a una persona del negocio: qué ve el usuario en la app, cómo Bigotes cruza verticales y cómo eso llega al panel. Se hace con la API corriendo; sin ella Bigotes responde con reglas locales y el panel con datos guardados.

## Antes de empezar

En tres terminales del Mac donde está la base:

```bash
cd rappi-ia && make serve            # esperar «Application startup complete» (carga los modelos)
cd prototipo-app && npm run dev      # http://localhost:5174
cd dashboard-empresa && npm run dev  # http://localhost:5175
```

1. Abre el prototipo y deja el modo **Propuesta** (arriba a la izquierda; la tecla **D** alterna con «Rappi hoy»).
2. Abre el panel en otra pestaña y elige la fuente **Prototipo**: ahí aparece lo que se haga en la demo.
3. Para empezar sin rastros de pruebas anteriores, en el chat toca **Olvidar**: borra los eventos y pedidos del usuario de este navegador. Lo que se probó desde otros navegadores sigue en la fuente Prototipo.

## Recorrido

| # | Qué escribir en el chat | Qué mostrar | Qué decir |
|---|---|---|---|
| 1 | `una hamburguesa` | Hamburguesas de restaurantes y, aparte, **«De Licores · ¿Te tinca sumar bebidas gaseosas? Porque llevas 🍔 hamburguesa»** con su botón «Ver más en Licores». | La búsqueda no se mezcla: responde en su vertical. Lo de otra vertical va aparte, una sola vez y con su razón a la vista. |
| 2 | `vino tinto` | Vinos de Licores, quesos del súper y la fila **«También en»**: Express, Súper y Turbo con el logo y el nombre de tiendas reales. | El mismo concepto existe en varias verticales: hoy cada una lo muestra por separado. |
| 3 | `algo para el carrete` | Va directo a Licores sin preguntar y sugiere desde Express. | Entiende ocasiones, no solo productos. |
| 4 | `tengo fiebre` | Productos para cuidarse, el aviso de consultar a un químico farmacéutico y ningún medicamento sugerido. | Lo sensible nunca se ofrece por iniciativa propia. |
| 5 | Agrega al carro un producto de la sugerencia (paso 1) y paga. | El pedido se confirma. | — |
| 6 | En el panel: **Entre verticales**, fuente Prototipo. Si el panel ya estaba ahí, toca **Actualizar** (junto a la fecha de corte). | «Bigotes entre verticales»: suben las mostradas, aceptadas y convertidas. | Cada sugerencia queda medida: se ve si se acepta y si termina en compra. |
| 7 | En el panel, fuente **Simulados**: Resumen y Oportunidades. | Las decisiones de la semana y lo que la gente pide y no encuentra. | Con datos simulados: muestra la mecánica, no resultados. Con datos de Rappi se mide de verdad. |

## Qué aclarar si preguntan

- **De dónde salen los productos:** del catálogo público de rappi.cl (muestra de hasta 24 productos por sub-pasillo), con precios vigentes.
- **Por qué no siempre sale Restaurantes:** la vertical se elige donde el concepto es típico, no donde hay más ítems; restaurantes solo compite en lo que se pide hecho (comida, postres, café). Una vertical chica tampoco gana con un puñado de productos: necesita oferta suficiente. Ver [decisiones.md](decisiones.md#agente-bigotes).
- **Los porcentajes del panel en la demo:** con la fuente Prototipo el % de aceptación aparece recién con 10 sugerencias mostradas; antes solo se ven los conteos.
- **Qué va con qué:** los complementos (hamburguesa → gaseosas, vino → quesos) son una lista escrita a mano. Con datos de pedidos de Rappi se reemplazan por relaciones medidas, sin cambiar el mecanismo.
