# rappi-dlab · Recomendaciones entre verticales para Rappi Chile

Prototipo que muestra cómo lo que una persona hace en un vertical de Rappi (supermercado, licores, farmacia, restaurantes…) puede mejorar lo que se le recomienda en los demás. Reúne el catálogo público de rappi.cl en Postgres + pgvector, una búsqueda híbrida evaluada, el asistente **Bigotes** y un panel de negocio.

> [!NOTE]
> Proyecto independiente: no está afiliado a Rappi ni cuenta con su respaldo. Rappi y las demás marcas mencionadas pertenecen a sus respectivos dueños.

[![CI](https://github.com/yungzyx/rappi-dlab/actions/workflows/ci.yml/badge.svg)](https://github.com/yungzyx/rappi-dlab/actions/workflows/ci.yml)

<img src="prototipo-app/docs/screenshots/00-modo-demo.jpg" width="320" alt="Prototipo en modo Propuesta: barra para preguntarle a Bigotes por texto, foto o voz">

*Prototipo navegable. El interruptor de arriba (tecla **D**) alterna entre la app como es hoy y la propuesta.*

## El problema

Vista desde fuera, como usuarios de la app, cada vertical de Rappi parece funcionar como un silo: lo que una persona compra o busca en el supermercado no parece cambiar lo que se le recomienda en licores, farmacia o restaurantes.

La señal existe: cada búsqueda y cada pedido dice algo de quien lo hace. Pero no se ve que cruce de un vertical a otro, y con ella se pueden perder oportunidades de venta cruzada y de frecuencia.

El proyecto no tiene acceso a datos internos: con ellos, Rappi puede confirmarlo o descartarlo. Detalle en [docs/contexto-y-problema.md](docs/contexto-y-problema.md).

## La propuesta

**Buscar dentro del vertical, entender a través de los verticales.**

- **La búsqueda sigue aislada por vertical.** Quien está en Licores ve resultados de Licores: así se cuida la precisión.
- **Los intereses se guardan como conceptos** comunes a todos los verticales (cerveza, snacks salados, pañales…).
- **Una recomendación cruzada sigue tres pasos:** concepto → complemento → búsqueda en el otro vertical.

| Lo que hace la persona | Concepto | Complemento | Dónde se busca | Qué ve |
|---|---|---|---|---|
| Pide cerveza bajo $3.000 en Licores | cerveza | snacks salados | otro vertical | «De otra tienda: ¿te tinca sumar snacks salados? Porque llevas cerveza» |
| Compra pañales en el supermercado | pañales | dermocosmética | el vertical con más surtido de ese concepto (p. ej., farmacia) | Productos para el cuidado de la piel, con la razón visible |

Ejemplos ilustrativos: el complemento y el vertical se eligen según el peso de la relación entre conceptos y el surtido real de cada vertical.

<img src="prototipo-app/docs/screenshots/40-bigotes-api.jpg" width="280" alt="Bigotes con la API: cervezas reales bajo $3.000 y snacks salados de otra tienda">

Las sugerencias siguen reglas pensadas para no perder la confianza del cliente:

- como máximo una sugerencia cruzada por respuesta, siempre con su razón visible;
- nunca productos sensibles por iniciativa propia (medicamentos, salud sexual, tabaco y vapeo);
- el alcohol siempre con el aviso +18;
- lo aprendido se muestra («Aprendiendo de ti») y se puede borrar («Olvidar»).

El panel de negocio muestra cómo se mediría el efecto (frecuencia, abandono, sugerencias aceptadas), pero con datos simulados. El efecto real solo se puede medir con datos de Rappi y un experimento A/B con grupo de control.

## Qué hay en el repositorio

| Carpeta | Qué es | Datos |
|---|---|---|
| [`rappi-scraper/`](rappi-scraper/) | Descarga el catálogo público de rappi.cl (tiendas, productos, menús y precios con historial) a Postgres + pgvector y arma los documentos de búsqueda por vertical. Se actualiza cada semana. | Reales (públicos) |
| [`rappi-ia/`](rappi-ia/) | Conceptos (capa 2), embeddings locales de texto e imagen, voz a texto con Whisper, búsqueda híbrida por vertical, agente Bigotes, eventos y métricas. API con FastAPI. | Catálogo real; usuarios simulados |
| [`prototipo-app/`](prototipo-app/) | Réplica navegable de la app (Vite + React) con modo «Rappi hoy» / «Propuesta». Funciona sin backend; con la API usa el catálogo real. | Capturas de la app; catálogo real opcional |
| [`dashboard-empresa/`](dashboard-empresa/) | Panel de negocio: demanda no satisfecha, tendencias, frecuencia, abandono, cruce entre verticales y salud del catálogo. | Simulados, salvo la pestaña Catálogo (real) |

**Bigotes** es el asistente del prototipo: la mochila de Rappi con bigote. Conversa por texto, voz o foto y busca en el vertical donde está la persona. Sugiere como máximo un complemento de otro vertical. Sin clave de API responde con plantillas; con clave, Claude solo redacta sobre lo que el código ya recuperó y verificó.

## Arquitectura

![Flujo de datos por etapas: Descarga, Postgres, IA offline, Consulta y Apps](docs/diagramas/rag-datos.png)

1. **Descarga (semanal).** `rappi refresh` lee las páginas públicas y guarda catálogo, menús y precios.
2. **Postgres + pgvector.** El catálogo (capa 1) y `search_documents`, una partición por vertical.
3. **IA offline.** Cada producto y plato recibe un concepto (capa 2), y los conceptos se enlazan con sus complementos. Cada documento recibe un embedding: un vector que representa el significado del texto, calculado con un modelo local multilingüe (e5). Cada vertical tiene su propio índice vectorial. Una evaluación calibra el umbral de «sin resultado».
4. **Consulta.** Búsqueda híbrida dentro del vertical: por palabras (léxica) y por significado (vectorial). Las dos listas se combinan según la posición de cada resultado (fusión RRF) y se refuerzan los resultados del concepto pedido. Bigotes arma la respuesta y la sugerencia cruzada.
5. **Apps.** La API (puerto 8000) atiende al prototipo (5174) y al panel (5175). Los eventos del prototipo vuelven a la base marcados como tales.

Versiones interactivas (GitHub no las muestra: descargar y abrir en el navegador): [flujo de datos](docs/diagramas/rag-datos.html) · [arquitectura por carriles](docs/diagramas/arquitectura-ia.html) ([PNG](docs/diagramas/arquitectura-ia.png)) · [scraper](docs/diagramas/scraper-flujo.html) ([PNG](docs/diagramas/scraper-flujo.png)).

Diseño completo del RAG, el agente y el panel: [docs/diseno-ia.md](docs/diseno-ia.md).

## Resultados

Cifras verificadas el 28-09-2026 sobre la base completa. Cada una indica qué tipo de dato es: real, evaluación automática, estimación o simulación.

| Ámbito | Métrica | Valor | Tipo de dato | Fuente |
|---|---|---|---|---|
| Catálogo | Documentos de búsqueda | 240.200: 83.108 productos, 153.136 platos y 3.956 tiendas | Real (catálogo público) | Base `rappi`, 28-09-2026 |
| Catálogo | Documentos con embedding | 100% (`intfloat/multilingual-e5-base`, 768 dim, HNSW por vertical) | Real | Base `rappi`, 28-09-2026 |
| Catálogo | Grupos de tiendas (uno por marca y formato) | 797 descargados · 49 fallidos · 51 omitidos (marca ya descargada) | Real | Corrida 1 (tiendas) + recuperación del 28-09 |
| Catálogo | Restaurantes | 3.149 descargados · 408 fallidos · 1.298 omitidos | Real | Corrida 4 (restaurantes) + recuperación del 28-09 |
| Capa 2 | Taxonomía | 132 conceptos · 101 complementos curados · 824 categorías mapeadas | Taxonomía y complementos: curados a mano · mapa de categorías: generado con LLM (dos etiquetadores y un juez en los desacuerdos), versionado en `category_map.csv` | `make concepts`, 28-09-2026 |
| Capa 2 | Ítems con concepto | 96,7% a 100% según vertical ([tabla](#catálogo-por-vertical)) | Real | `make concepts`, 28-09-2026 |
| Capa 2 | Precisión de la asignación | ≈88% por categoría · ≈81% platos · 55% reglas por nombre | **Estimación**: jueces LLM sobre datos parciales | Muestra del 27-09, no versionada |
| Búsqueda | nDCG@10 | híbrido 0,889 · vectorial 0,825 · léxico 0,744 | Evaluación automática | `rappi-ia/data/eval/busqueda.md` (`make eval`, 28-09) |
| Búsqueda | «Sin resultado» | precisión 1,00 (0 falsas alarmas) · recall 0,33 (5 de 15) | Evaluación automática | `rappi-ia/data/eval/busqueda.md` (`make eval`, 28-09) |
| Calidad | Tests (pytest / Vitest) | scraper 86 · rappi-ia 152 · prototipo 108 · panel 80 | Verificación local, 28-09 | `make test` · `npm test`; [CI](.github/workflows/ci.yml): 4 jobs (scraper y rappi-ia contra Postgres + pgvector; prototipo y panel con lint, tests y build) |
| Calidad | Revisión adversarial automatizada (agentes de IA) | 3 pasadas, 66 hallazgos corregidos (27-09); nueva revisión de los cambios del 28-09 | Proceso | — |
| Panel | Usuarios, eventos y pedidos | 1.500 usuarios × 20 semanas (semilla 7) | **Simulado** | `rappi-ia/src/rappi_ia/events/synth.py` |

### Catálogo por vertical

Primera descarga completa del 24 al 27-09-2026 y recuperación de fallidos el 28-09-2026, con el arreglo del scraper.

| Vertical | Tiendas descargadas | Productos únicos | Con concepto |
|---|---:|---:|---:|
| Supermercado | 315 | 29.563 | 99,1% |
| Conveniencia | 45 | 8.501 | 99,8% |
| Turbo | 16 | 2.562 | 100% |
| Rappi Mall | 338 | 31.246 | 97,7% |
| Farmacia | 13 | 5.028 | 96,7% |
| Licores | 66 | 5.190 | 100% |
| Chocolatería | 24 | 1.018 | 100% |
| Restaurantes | 3.139 restaurantes con platos en la búsqueda | 153.136 platos | 97,9% |

- Una misma tienda puede figurar en más de un vertical.
- Los 3.149 restaurantes descargados son jobs de la corrida; los 3.139 son restaurantes distintos con platos en la base. Las dos cifras se cuentan distinto.
- Farmacia pasó de 5 tiendas y 550 productos a 13 y 5.028 con la recuperación.
- En tiendas es una muestra: la página pública muestra hasta 24 productos por sub-pasillo. Los restaurantes traen el menú completo.

### Búsqueda

96 consultas positivas en 6 verticales (supermercado, conveniencia, Rappi Mall, licores, chocolatería y restaurantes) y 15 negativas. Farmacia y Turbo todavía no se evalúan. La relevancia se juzga automáticamente por concepto. Set: [`queries.json`](rappi-ia/src/rappi_ia/eval/queries.json).

| Modo | P@10 | MRR | nDCG@10 |
|---|---:|---:|---:|
| Léxico | 0,735 | 0,842 | 0,744 |
| Vectorial | 0,818 | 0,887 | 0,825 |
| **Híbrido** | **0,884** | **0,922** | **0,889** |

P@10: proporción de resultados relevantes entre los 10 primeros. MRR: qué tan arriba aparece el primer resultado relevante (1 = el primero). nDCG@10: calidad del orden de los 10 primeros (1 = orden ideal).

- **Por tipo de consulta** (nDCG@10 del híbrido): exactas 0,968; sin tildes 0,993; necesidades en lenguaje natural («algo para el carrete») 0,674, frente a 0,532 del léxico.
- **Por vertical** (nDCG@10 del híbrido): chocolatería 0,959; restaurantes 0,944; conveniencia 0,897; Rappi Mall 0,884; supermercado 0,883; licores 0,835.
- **«Sin resultado»** (demanda no satisfecha): no dio falsas alarmas, pero detectó solo 5 de las 15 negativas. Con el catálogo completo, varias consultas «negativas» ya coinciden con todas sus palabras:
  - algunas son oferta real que no estaba en los datos parciales («kebab mixto»: 16 platos; «comida mexicana con tacos»: restaurantes mexicanos). Esa parte del set quedó desactualizada;
  - otras son coincidencias casuales («pizza familiar» → un horno para pizza en Rappi Mall; «neumáticos» → un renovador de neumáticos en conveniencia). Es un límite real de la regla léxica estricta.
- **Antes (27-09, datos parciales):** híbrido 0,898; «sin resultado» con precisión 0,91 y recall 0,67. No es comparable directamente: cambió el catálogo.

> [!IMPORTANT]
> **Qué no es evidencia**
>
> - **El panel de negocio.** Usuarios, eventos y pedidos son simulados (`source = 'synthetic'`). Muestran la mecánica, no un resultado. Por ejemplo, el simulador asume que quien usa más verticales se va menos, así que esa relación aparece por construcción. Solo la pestaña Catálogo usa datos reales.
> - **La ventaja del híbrido.** La relevancia se juzga por concepto y el híbrido recibe un refuerzo por ese mismo concepto: su ventaja sobre léxico y vectorial está sobreestimada. Falta un juicio humano.
> - **La precisión de la capa 2.** Es una estimación con jueces LLM sobre datos parciales, con una muestra no versionada.
> - **«No está en el catálogo».** No significa «Rappi no lo vende»: en tiendas el catálogo es una muestra.

## Verlo funcionando

### Sin base de datos (unos 2 minutos)

Requiere Node 22.22+ o 24.15+. Desde la raíz del repositorio, cada uno en su terminal:

```bash
cd prototipo-app && npm ci && npm run dev       # http://localhost:5174
```

```bash
cd dashboard-empresa && npm ci && npm run dev   # http://localhost:5175
```

- **Prototipo:** la tecla **D** (o Account → Modo demo en el celular) alterna «Rappi hoy» y «Propuesta». Sin la API, Bigotes responde con reglas locales sobre los datos de las capturas.
- **Panel:** sin la API usa respuestas guardadas (`src/fixtures/`) y lo avisa («Modo sin conexión (datos guardados)»). Cada bloque indica si su dato es simulado o real.

### Correr la demo completa (catálogo real)

Requiere la base `rappi` con el catálogo (se restaura desde un respaldo) y la capa de IA instalada: ver [docs/instalacion.md](docs/instalacion.md). Luego, desde la raíz, cada uno en su terminal:

```bash
cd rappi-ia && make serve             # API en http://localhost:8000 (docs en /docs; carga los modelos antes de aceptar peticiones: esperar a «Application startup complete»)
cd prototipo-app && npm run dev       # http://localhost:5174
cd dashboard-empresa && npm run dev   # http://localhost:5175
```

Con la API, Bigotes busca en el catálogo real con precios vigentes, sugiere complementos de otro vertical, transcribe la voz (Whisper) y reconoce fotos (CLIP). La API no tiene autenticación y por defecto escucha solo en el equipo local. `make serve-lan` la abre a la red local para probar desde un iPhone: solo en una red de confianza.

### Actualización semanal

`make schedule` en `rappi-scraper/` programa la tarea (con launchd, el programador de tareas de macOS; domingos 03:00): primero la descarga y después `make post-refresh` de rappi-ia (conceptos, embeddings, evaluación, datos simulados y purga). Nunca corren dos a la vez. Si hay un `rappi refresh` lanzado a mano, `cd rappi-ia && ./scripts/despues-del-refresh.sh` espera a que termine y corre `make post-refresh` (este sí recalibra τ). Detalle en [docs/instalacion.md](docs/instalacion.md).

## Stack

| Capa | Tecnología |
|---|---|
| Descarga | Python 3.13, `requests`, `psycopg` 3; launchd para la tarea semanal (macOS) |
| Base de datos | PostgreSQL 17 + pgvector (un índice HNSW por vertical); `unaccent` para buscar sin tildes |
| IA (modelos locales) | `intfloat/multilingual-e5-base` (texto), CLIP ViT-B/32 con codificador multilingüe (imágenes), Whisper con `faster-whisper` (voz). Claude es opcional y solo redacta |
| API | FastAPI + Uvicorn |
| Apps | React 19 + Vite; el panel dibuja sus gráficos en SVG, sin librerías |
| Calidad | pytest, Ruff, Vitest, ESLint; GitHub Actions con 4 jobs: Python contra Postgres + pgvector; lint, tests y build de las apps |

## Estructura del repositorio

```text
.
├── rappi-scraper/          descarga del catálogo público → Postgres + pgvector (comando `rappi`)
│   ├── src/rappi_scraper/  scraping, orquestación y base (incluye las migraciones de toda la base)
│   ├── tests/              unitarios, integración y páginas reales guardadas
│   └── scripts/            tarea semanal (launchd)
├── rappi-ia/               conceptos, embeddings, búsqueda, Bigotes, métricas y API (comando `rappi-ia`)
│   ├── src/rappi_ia/
│   ├── tests/
│   └── scripts/
├── prototipo-app/          réplica navegable de la app con Bigotes (Vite + React)
│   ├── src/
│   ├── design/             ficha del personaje Bigotes
│   └── docs/screenshots/
├── dashboard-empresa/      panel de negocio (Vite + React)
│   ├── src/
│   └── docs/screenshots/
├── docs/                   contexto, diseño, decisiones, instalación, diagramas y SQL
│   ├── diagramas/          PNG y versiones interactivas (HTML)
│   ├── diagramas-fuente/   fuentes JSON de los diagramas
│   └── sql/                cómo conectarse y consultas de ejemplo
├── .github/workflows/      CI
└── CLAUDE.md               convenciones para asistentes de código
```

**Fuera del repositorio:** la base Postgres `rappi` (local; se traspasa con un respaldo `.dump`), `rappi-scraper/data/` (respaldos, reportes de cada corrida, logs y exportaciones CSV) y `rappi-ia/data/` (reporte de evaluación y logs). Los datos descargados no se versionan.

## Documentación

Índice completo, con qué leer según lo que buscas: [docs/README.md](docs/README.md).

## Uso responsable de los datos

- **Fuentes:** solo páginas públicas de rappi.cl sin barreras técnicas, sus sitemaps públicos y el JSON público de metadatos de tiendas.
- **Sin accesos especiales:** no usa APIs internas, no inicia sesión y no evade protecciones.
- **Ritmo:** una descarga a la vez, con pausas de 1,5 a 3 s entre solicitudes, y una actualización por semana.
- **Sin datos personales:** el catálogo no los contiene. Los usuarios del panel son simulados o del prototipo (id seudónimo), y las consultas se guardan con los datos personales redactados.
- **Fines:** investigación y demostración. Los datos descargados no se publican ni están en el repositorio. Un uso comercial requeriría autorización de Rappi.
- **Contenido de terceros:** fotos, descripciones y marcas pertenecen a Rappi y a los comercios.
- **Alcance:** solo Rappi. Otras apps de delivery (Uber Eats, PedidosYa) están fuera de alcance.

## Límites

- **Cobertura parcial en tiendas:** hasta 24 productos por sub-pasillo en la página pública, y una sucursal por marca o formato. Sirve para saber qué hay, no para comparar todas las sucursales.
- **Fallidos:** tras la recuperación, 49 grupos de tiendas y 408 restaurantes siguen sin descargarse.
- **Evaluación automática y parcial:** no hay juicio humano y no cubre farmacia ni Turbo. Además, el refuerzo por concepto favorece al híbrido.
- **«Sin resultado»:** detecta 5 de 15 negativas. Parte del set quedó desactualizado y la regla léxica estricta acepta coincidencias casuales.
- **Capa 2:** la asignación por reglas de nombre es la parte más débil (55% estimado).
- **Panel simulado:** muestra cómo se mediría, no el efecto.
- **Demo local:** la API no tiene autenticación. La instalación está pensada para macOS (Homebrew, launchd).
- **Cambios del sitio:** si rappi.cl cambia su frontend, hay que ajustar los parsers. El reporte de calidad de cada corrida marca con ⚠ las respuestas anómalas; con una página nueva guardada, los tests muestran qué cambió.

## Estado y próximos pasos

**Hecho**

- Catálogo público completo (24 al 27-09-2026) y recuperación de fallidos (28-09-2026).
- Capa 2 de conceptos, embeddings al 100% y búsqueda híbrida evaluada.
- Bigotes con API (texto, voz y foto) y prototipo con modo «Rappi hoy» / «Propuesta».
- Panel de negocio con datos simulados rotulados y la pestaña Catálogo real.
- Actualización semanal automática y CI con 4 jobs.
- Mejoras del 28-09-2026:
  - una página de pasillo sin datos ya no bota la tienda entera;
  - la tarea semanal libera su candado aunque la corten con una señal;
  - embeddings e índices vectoriales que se calculan más rápido.
- Revisión adversarial automatizada, con agentes de IA: 3 pasadas con 66 hallazgos corregidos (27-09) y una revisión de los cambios del 28-09.

**Siguiente**

1. Evaluar farmacia y Turbo, y renovar las consultas negativas del set.
2. Mejorar la regla de «sin resultado».
3. Medir cuánto aporta el refuerzo por concepto (comparando con y sin él) y sumar juicio humano.
4. Etiquetar los ítems de baja confianza de la capa 2.
5. Revisar las cadenas de restaurantes sin menú.

## Autor

[yungzyx](https://github.com/yungzyx). Desarrollo asistido por IA (Claude Code).

Repositorio privado y sin licencia de código abierto: incluye capturas y material de terceros.
