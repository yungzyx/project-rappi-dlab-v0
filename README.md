# rappi-dlab · Que Rappi se conozca más allá de una vertical

Propuesta para Rappi Chile: un **prototipo navegable de la app** en el que Mochi, la mochila de Rappi con bigote, vive en la Home, busca contigo y te invita a descubrir verticales que no usas, con un pasaporte de sellos y un juego que también se ofrece mientras llega tu pedido. Detrás hay datos reales: el catálogo público de rappi.cl en Postgres + pgvector, una búsqueda híbrida evaluada y una capa de datos que entiende qué es cada producto.

> [!NOTE]
> Proyecto independiente: no está afiliado a Rappi ni cuenta con su respaldo. Rappi y las demás marcas mencionadas pertenecen a sus respectivos dueños.

[![CI](https://github.com/yungzyx/rappi-dlab/actions/workflows/ci.yml/badge.svg)](https://github.com/yungzyx/rappi-dlab/actions/workflows/ci.yml)

<img src="prototipo-app/docs/screenshots/00-modo-demo.jpg" width="320" alt="Prototipo final: Mochi en la Home, el buscador con Mochi y el pasaporte">

*El prototipo final. El interruptor de arriba (tecla **D**) alterna con la app como es hoy.*

## El problema

Vista desde fuera, como usuarios de la app, cada vertical de Rappi parece funcionar como un silo: lo que una persona compra o busca en el supermercado no parece cambiar lo que se le recomienda en licores, farmacia o restaurantes. La hipótesis: muchas personas usan una o dos verticales y no llegan a las demás.

La señal existe: cada búsqueda y cada pedido dice algo de quien lo hace. Pero no se ve que cruce de una vertical a otra, y con ella se pueden perder venta cruzada y frecuencia. El proyecto no tiene acceso a datos internos: con ellos, Rappi puede confirmarlo o descartarlo. Detalle en [docs/contexto-y-problema.md](docs/contexto-y-problema.md).

## La propuesta

**Buscar dentro de la vertical, entender a través de las verticales, e invitar a descubrir las que la persona no usa.** El prototipo final lo muestra en cuatro piezas:

| Pieza | Qué hace |
|---|---|
| **Mochi en la Home** | Mochi de cuerpo entero vive en la Home, sin ícono de chat ni canal aparte. Saluda, acompaña el pasaporte y el plan del día («¿Qué plan tienes hoy?», un kit de varias verticales) y, al tocarlo, propone una vertical por probar. |
| **Buscador con Mochi** | La barra de la Home abre el buscador de siempre con lo que Mochi sabe de ti: lo aprendido (con «Olvidar»), ideas para tocar («Arma un carrete»), búsqueda de tiendas y productos y «Descubre con Mochi». Sin chat escrito. |
| **Pasaporte Rappi y juego de verticales** | Un sello por vertical (8). Se gana abriendo la vertical o jugando: rondas cortas con conceptos y desafíos sobre el catálogo real, niveles, misión del día y cartas «¿Sabías que…?». Con 4 sellos, envío gratis (idea para probar, no una promoción). |
| **Mientras llega el pedido** | El seguimiento ofrece «Juega mientras llega tu pedido»: una ronda de una vertical sin sello, con el tiempo que falta arriba. La espera se aprovecha para descubrir otra vertical. |

| La Home | El buscador con Mochi | El juego | Mientras llega el pedido |
|:---:|:---:|:---:|:---:|
| <img src="prototipo-app/docs/screenshots/01-home-final.jpg" width="190" alt="Home con Mochi y el pasaporte"> | <img src="prototipo-app/docs/screenshots/20-asistente.jpg" width="190" alt="Buscador con Mochi"> | <img src="prototipo-app/docs/screenshots/31-juego-camino.jpg" width="190" alt="Camino del juego de verticales"> | <img src="prototipo-app/docs/screenshots/32-juego-espera.jpg" width="190" alt="Ronda con la franja del pedido"> |

### Cómo cruza las verticales

La búsqueda sigue aislada por vertical (quien está en Licores ve Licores: así se cuida la precisión). Los intereses se guardan como **conceptos** comunes a todas (cerveza, snacks salados, pañales…), y una recomendación cruzada sigue tres pasos: concepto → complemento → búsqueda en la otra vertical.

| Lo que hace la persona | Concepto | Complemento | Dónde se busca | Qué ve |
|---|---|---|---|---|
| Pide cerveza bajo $3.000 en Licores | cerveza | snacks salados | la vertical donde el concepto es más típico entre las que tienen oferta suficiente (Express) | «De Express · ¿Te tinca sumar snacks salados? Porque llevas cerveza», con «Ver más en Express» |
| Compra pañales en el supermercado | pañales | alimentación de bebé | la vertical donde ese concepto es más típico (farmacia), no la de más ítems | «De Farmacia · ¿Te tinca sumar alimentación de bebé? Porque llevas pañales» |

Las sugerencias siguen reglas para no perder la confianza del cliente: como máximo una sugerencia cruzada por respuesta y con su razón visible; nunca productos sensibles por iniciativa propia (medicamentos, salud sexual, tabaco y vapeo; Farmacia se puede jugar pero nunca se propone); el alcohol con el aviso +18; y lo aprendido se ve y se borra («Olvidar»).

El efecto real (frecuencia, venta cruzada, verticales nuevas por persona) solo se puede medir con datos de Rappi y un experimento A/B con grupo de control.

## Cómo funciona

![Flujo de datos por etapas: descarga, Postgres, IA offline, consulta y prototipo](docs/diagramas/rag-datos.png)

1. **Descarga (semanal).** `rappi refresh` lee las páginas públicas de rappi.cl y guarda catálogo, menús y precios con historial.
2. **Postgres + pgvector.** El catálogo (capa 1) y `search_documents`, una partición por vertical.
3. **IA offline.** Cada producto y plato recibe un concepto (capa 2), y los conceptos se enlazan con sus complementos. Una capa de datos suma atributos, medidas, marcas, un grafo de conocimiento y segmentos, y los expone en el esquema `capa` ([docs/capa-de-datos.md](docs/capa-de-datos.md)). Cada documento recibe un embedding de un modelo local multilingüe (e5), con un índice vectorial por vertical.
4. **Consulta.** Búsqueda híbrida dentro de la vertical: por palabras y por significado, combinadas por posición (RRF) y reforzadas por el concepto pedido. Mochi arma la respuesta y la sugerencia cruzada.
5. **Prototipo.** La API (FastAPI, puerto 8000) atiende al prototipo (5174). El prototipo no abre sin la API: muestra «Sin conexión con Mochi» (se levantan juntos con `make mvp`). Las verticales, las tiendas con sus pasillos, los restaurantes con su menú, Turbo, Ofertas, Favoritos y la Home leen el catálogo real de la API (`/catalog`); el buscador y el cerebro local de Mochi siguen con datos locales hasta la etapa 3 del MVP.

**Mochi** en la API conversa por texto, voz (Whisper) o foto (CLIP); el prototipo usa solo el texto, como buscador. Reconoce servicios sin catálogo (un viaje lleva a **RappiTravel**, un envío o trámite a **RappiFavor**). Sin clave de API responde con plantillas; con clave, Claude solo redacta sobre lo que el código ya recuperó y verificó. Diseño completo: [docs/diseno-ia.md](docs/diseno-ia.md).

## Grafos y diagramas

| Qué | Para qué | Dónde |
|---|---|---|
| Mapa multivertical | Qué productos y conceptos comparten las verticales, con complementos, sustitutos y «nunca junto» | [docs/mapas/mapa-multivertical.html](docs/mapas/mapa-multivertical.html) (descargar y abrir; se regenera con `rappi-ia multivertical`) |
| Mapa de conceptos | Cada concepto junto a la vertical donde es más típico (la regla de Mochi) | [docs/mapas/mapa-conceptos.jpg](docs/mapas/mapa-conceptos.jpg) |
| Flujo de datos | Del catálogo a la respuesta de Mochi | [PNG](docs/diagramas/rag-datos.png) · [interactivo](docs/diagramas/rag-datos.html) |
| Arquitectura por carriles | Qué hace cada pieza de la IA | [PNG](docs/diagramas/arquitectura-ia.png) · [interactivo](docs/diagramas/arquitectura-ia.html) |
| Scraper | Cómo se descarga el catálogo | [PNG](docs/diagramas/scraper-flujo.png) · [interactivo](docs/diagramas/scraper-flujo.html) |

<img src="docs/mapas/mapa-conceptos.jpg" width="520" alt="Mapa de conceptos: cada concepto junto a la vertical donde es más típico">

## Resultados

Cada cifra dice qué tipo de dato es: real, evaluación automática, estimación o simulación.

| Ámbito | Métrica | Valor | Tipo de dato | Fuente |
|---|---|---|---|---|
| Catálogo | Documentos de búsqueda | 253.945: 84.024 productos, 165.623 platos y 4.298 tiendas | Real (catálogo público) | Base `rappi`, 05-10-2026 |
| Catálogo | Documentos con embedding | 100 % (`intfloat/multilingual-e5-base`, 768 dim, HNSW por vertical) | Real | Base `rappi`, 04-10-2026 |
| Capa 2 | Taxonomía | 133 conceptos · 103 complementos curados · 818 categorías con mapeo revisado | Curado a mano; mapa de categorías generado con LLM y versionado | `make concepts`, 30-09-2026 |
| Capa 2 | Precisión de la asignación | 86 % por regla de nombre, 88 % por mapeo y 88 % por vecinos, en una muestra nueva tras corregir las reglas (antes: 81, 82 y 57 %) | **Estimación** con jueces LLM | [antes](docs/resultados/capas-precision-2026-10-06.md) · [después](docs/resultados/capas-precision-2026-10-06-nueva-muestra.md) |
| Capa de datos | Atributos, marcas y grafo | 83 atributos sobre 79.617 ítems · 6.359 marcas · 23.534 productos canónicos · 32.105 aristas en 12 relaciones | Real, con reglas propias; atributos 92 % y marcas 97 a 99 % de precisión estimada | `make layers`, 06-10-2026 |
| Búsqueda | nDCG@10 | híbrido 0,917 · sin refuerzo por concepto 0,860 · vectorial 0,849 · léxico 0,776 | Evaluación automática | [reporte del 06-10](docs/resultados/busqueda-2026-10-06.md) |
| Búsqueda | «Sin resultado» | precisión 1,00 (0 falsas alarmas) · recall 0,71 (29 de 41) | Evaluación automática | [reporte del 30-09](docs/resultados/busqueda-2026-09-30.md) |
| Calidad | Tests | scraper 144 · rappi-ia 1002 · prototipo 575 · panel 90 | Verificación local y CI | `make test` · `npm test` |

### Catálogo por vertical

| Vertical | Tiendas | Productos | Con concepto |
|---|---:|---:|---:|
| Supermercado | 320 | 29.403 | 99,8 % |
| Conveniencia | 38 | 7.848 | 100 % |
| Turbo | 18 | 2.642 | 100 % |
| Rappi Mall | 359 | 32.761 | 99,7 % |
| Farmacia | 16 | 4.726 | 99,8 % |
| Licores | 79 | 5.519 | 100 % |
| Chocolatería | 24 | 1.125 | 100 % |
| Restaurantes | 3.444 | 165.623 platos | 94,7 % |

Documentos al 04-10-2026 (segunda descarga semanal automática); «Con concepto», del 06-10. En tiendas es una muestra: la página pública muestra hasta 24 productos por sub-pasillo. Turbo quedó con los precios del 27-09 (ver [Límites](#límites)).

### Búsqueda

124 consultas positivas en las 8 verticales y 41 negativas, con relevancia juzgada automáticamente por concepto ([`queries.json`](rappi-ia/src/rappi_ia/eval/queries.json)). Por tipo de consulta, el híbrido logra 0,979 en las exactas, 0,965 sin tildes y 0,711 en necesidades en lenguaje natural («algo para el carrete»), frente a 0,570 del léxico. Detalle, por vertical y con la historia de cada reevaluación: [docs/resultados/](docs/resultados/).

> [!IMPORTANT]
> **Qué no es evidencia**
>
> - **Usuarios y eventos simulados.** Los segmentos y las métricas de negocio usan personas simuladas (`source = 'synthetic'`): muestran la mecánica, no un resultado.
> - **La ventaja del híbrido.** La relevancia se juzga por concepto y el híbrido recibe un refuerzo por ese mismo concepto; sin él, no se distingue del vectorial (0,860 frente a 0,849). Falta un juicio humano.
> - **Las precisiones de la capa 2 y de la capa de datos** son estimaciones con jueces LLM.
> - **El progreso del juego y el pasaporte** son de demo: se guardan solo en el navegador.
> - **«No está en el catálogo»** no significa «Rappi no lo vende»: en tiendas el catálogo es una muestra.

## Probarlo

### El MVP (`make mvp`)

Un comando levanta la API de rappi-ia (:8000), la app (:5174) y el panel (:5175). **La app no corre sin la API:** si no responde, muestra «Sin conexión con Mochi» con un botón «Reintentar». Ya no hay una versión que funcione sola en el navegador.

Requisitos (el detalle, en [docs/instalacion.md](docs/instalacion.md)):

- Postgres con la base `rappi` cargada (ver «Con el catálogo real»).
- `make install` en `rappi-scraper/` y `make install install-ml` en `rappi-ia/`.
- `npm ci` en `prototipo-app/` y en `dashboard-empresa/` (Node 22.22+ o 24.15+).

```bash
make mvp          # desde la raíz del repositorio; Ctrl-C detiene los tres
make mvp LAN=1    # abre la API y la app a la red local, para el iPhone (solo en una red de confianza)
make mvp-check    # recorre la app con Chrome (la Home, una compra en el Súper de prueba y la caída de la API) contra un catálogo inventado, sin tocar la base real
```

`make mvp` revisa las dependencias, los puertos y la base (`rappi-ia doctor`, solo lectura), aplica las migraciones pendientes (no las de una rama sin fusionar: `MIGRATE=1` lo fuerza, ver [docs/instalacion.md](docs/instalacion.md#5-el-mvp)), arranca los tres con sus registros prefijados y avisa cuando responden. La API tarda en estar lista porque carga los modelos. No descarga nada de rappi.cl.

La tecla **D** (o Account → Settings → Modo demo en el celular) alterna «Prototipo final» y «Rappi hoy». Guion de demo: [docs/demo.md](docs/demo.md).

### Con el catálogo real

La API lee la base `rappi`, que se restaura desde un respaldo (o se descarga) y se deja al día con la capa de IA: ver [docs/instalacion.md](docs/instalacion.md), secciones 3 y 4. Con ella, Mochi busca en el catálogo real con precios vigentes. La API no tiene autenticación y por defecto escucha solo en el equipo local (`make mvp LAN=1` y `make serve-lan` la abren a la red, solo en una red de confianza). `make schedule` en `rappi-scraper/` programa la actualización semanal (domingos 03:00) seguida de `make post-refresh` en rappi-ia.

## Qué es real y qué es simulado

- **Real:** el catálogo, los precios y los menús (de rappi.cl), los conceptos, la capa de datos, la búsqueda y las respuestas de Mochi con la API. Las tiendas, productos, precios, menús y ofertas que muestran las pantallas del prototipo salen de la API; su diseño (títulos, categorías, banners) sigue siendo de recortes de capturas de la app. Lo que la API no sabe (tiempo de entrega, nota, costo de envío) no se muestra.
- **Simulado:** el pago, el seguimiento del pedido (llega a los 20 s), los usuarios y eventos para segmentos y métricas, y el progreso del juego.
- **Uso responsable:** solo páginas públicas sin barreras técnicas, sin APIs internas ni inicio de sesión, una descarga a la vez con pausas de 1,5 a 3 s y una actualización por semana. Sin datos personales: los usuarios son simulados o del prototipo (id seudónimo). Los datos descargados no se publican ni están en el repositorio. Fines de investigación y demostración; un uso comercial requeriría autorización de Rappi.

## Límites

- **Cobertura parcial en tiendas:** hasta 24 productos por sub-pasillo y una sucursal por marca o formato. No se listan las tiendas sin ofertas vigentes en un pasillo de primer nivel, ni Mascotas (la base no tiene esa vertical).
- **Buscador local hasta la etapa 3:** el buscador del prototipo y los bloques de Mochi en la Home (kit, «Descubre») aún usan datos locales; lo que abren y no está en la base muestra «Esta tienda no está en el catálogo».
- **Turbo sin actualizar:** sus tiendas ya no aparecen como Turbo en los listados públicos que recorre el scraper; sus precios son del 27-09.
- **Evaluación automática:** no hay juicio humano, y el refuerzo por concepto favorece al híbrido.
- **«Sin resultado»:** detecta 29 de 41 negativas; el reporte explica las demás.
- **Demo local:** la API no tiene autenticación; la instalación está pensada para macOS (Homebrew, launchd).
- **Cambios del sitio:** si rappi.cl cambia su frontend, hay que ajustar los parsers; el reporte de cada corrida marca las respuestas anómalas.

## Estructura del repositorio

```text
.
├── prototipo-app/          el prototipo final (Vite + React): Mochi, buscador, pasaporte y juego de verticales
├── rappi-ia/               conceptos, embeddings, búsqueda, capa de datos, Mochi y API (comando `rappi-ia`)
├── rappi-scraper/          descarga del catálogo público → Postgres + pgvector (comando `rappi`; migraciones de toda la base)
├── dashboard-empresa/      panel de negocio para más adelante (Vite + React; datos simulados)
├── docs/                   propuesta, diseño, decisiones, demo, instalación y resultados
│   ├── diagramas/          diagramas (PNG e interactivos) y sus fuentes en diagramas-fuente/
│   ├── mapas/              mapa multivertical y mapa de conceptos
│   └── resultados/         reportes de evaluación versionados (fuente de las cifras)
├── Makefile, scripts/      `make mvp` y `make mvp-check`: levantan y recorren el MVP
├── .github/workflows/      CI (scraper y rappi-ia contra Postgres + pgvector; prototipo y panel con lint, tests y build)
└── CLAUDE.md               convenciones para asistentes de código
```

**Fuera del repositorio:** la base Postgres `rappi`, `rappi-scraper/data/` y `rappi-ia/data/`. Los datos descargados no se versionan.

## Para más adelante: panel de negocio

[`dashboard-empresa/`](dashboard-empresa/) es un panel para la empresa que no forma parte de la propuesta de hoy, pero queda en el repo para usarlo más adelante: convierte la conducta de compra y lo que la gente pide en decisiones (tendencias por concepto, demanda no satisfecha, usuarios en riesgo, rendimiento de las sugerencias cruzadas y salud del catálogo). Lee las métricas de la API (`/analytics`). Hoy usa **usuarios simulados**, salvo la pestaña Catálogo (real): muestra la mecánica, no un resultado.

```bash
cd dashboard-empresa && npm ci && npm run dev   # http://localhost:5175 (sin la API usa respuestas guardadas)
```

## Historial del proyecto

Este repo cuenta la propuesta vigente. Todas las etapas anteriores (la presentación al gerente, el chat escrito de Bigotes, los modos «Propuesta» y «Bigotes vivo») y el juego de verticales con su historial están en [**rappi-evolucion-proyecto**](https://github.com/yungzyx/rappi-evolucion-proyecto), con una etiqueta por etapa y su [línea de tiempo](https://github.com/yungzyx/rappi-evolucion-proyecto/blob/main/EVOLUCION.md).

## Documentación

Índice, con qué leer según lo que buscas: [docs/README.md](docs/README.md). Decisiones con su porqué: [docs/decisiones.md](docs/decisiones.md).

## Autor

[yungzyx](https://github.com/yungzyx). Desarrollo asistido por IA (Claude Code).

Repositorio privado y sin licencia de código abierto: incluye capturas y material de terceros.
