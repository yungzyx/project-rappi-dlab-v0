# Contexto y problema

> Por qué existe este proyecto, qué queremos responder y qué decisiones salen de eso.
> Última actualización: 30-09-2026. Ecosistema y modelo de datos: [ecosistema-rappi.md](ecosistema-rappi.md) · Diseño del RAG, el agente y el panel: [diseno-ia.md](diseno-ia.md) · Registro de decisiones: [decisiones.md](decisiones.md) · Resultados: [README → Resultados](../README.md#resultados).

## 1. El problema

**Desde fuera, cada vertical de Rappi parece funcionar como un silo: lo que un usuario hace en uno no parece mejorar lo que se le recomienda en los otros.** Lo que alguien compra o mira en supermercado no parece cambiar lo que se le sugiere en restaurantes, farmacia o Rappi Mall.

Es una observación hecha desde fuera, como usuarios de la app. No hay información pública que la confirme o la desmienta (ver [ecosistema-rappi.md](ecosistema-rappi.md#cómo-se-conectan)). Con sus datos internos, Rappi puede medirla directamente.

Para trabajar sobre esa observación (entenderla, medir su efecto o construir algo que la aproveche) falta lo más básico: **no existe una fuente estructurada que diga qué contenido hay en cada vertical**, cuánto se repite entre verticales y en qué se diferencian. Esa información está repartida en miles de páginas públicas de rappi.cl, no en un formato que se pueda consultar.

Sin ese mapa de contenido no se puede:

- saber qué ofrece realmente cada vertical (productos, marcas, categorías, platos, precios);
- ver dónde se cruzan los verticales (el mismo producto en supermercado, Turbo y licores);
- darle a un agente LLM una base confiable para buscar y responder dentro de cada vertical.

## 2. Qué queremos lograr

1. **Mapa de contenido por vertical:** una base de datos con el contenido público de Rappi Chile, organizada por vertical.
2. **Análisis inicial y cruce de información:** cuánto contenido hay por vertical, qué se repite entre verticales, cómo varían los precios entre cadenas y en el tiempo.
3. **Base para un RAG / búsqueda semántica:** que un agente LLM pueda buscar por significado ("algo liviano para almorzar", "pañales talla G baratos") **dentro de un vertical a la vez**.
4. **Romper el silo en las recomendaciones:** que lo que alguien hace en un vertical informe las sugerencias de los otros, sin mezclar los índices de búsqueda.

### Cómo lo aborda este prototipo

**Buscar dentro del vertical; entender al usuario a través de los verticales.**

- La búsqueda sigue aislada por vertical: quien está en Licores quiere resultados de Licores.
- Los intereses del usuario se guardan como **conceptos** comunes a todos los verticales (cerveza, snacks, pañales).
- La recomendación cruzada va de concepto → complemento → búsqueda en el índice del otro vertical. Por ejemplo, quien lleva cerveza en Licores ve snacks de Express, marcados "De Express" y con su razón visible.

Detalle en [diseno-ia.md](diseno-ia.md#0-la-regla-que-ordena-todo).

<img src="../prototipo-app/docs/screenshots/22-para-ti-vertical.jpg" alt="Prototipo: en Licores, la sección Para ti, de otras tiendas muestra productos del supermercado porque al usuario le gusta la cerveza" width="280">

*Prototipo en modo local (datos del prototipo, sin API): en Licores, "Para ti, de otras tiendas" sugiere productos del supermercado "porque te gusta la cerveza". Con la API, la fila se llena con productos reales de otro vertical.*

## 3. Preguntas que la base debe poder responder

- ¿Qué contenido hay en cada vertical? (tiendas, productos únicos, marcas, categorías, platos)
- ¿Qué productos aparecen en más de un vertical y en cuáles?
- ¿Cómo cambia el precio del mismo producto entre cadenas, ciudades y corridas?
- Dada una necesidad en lenguaje natural, ¿qué opciones existen **en este vertical**?

## 4. Decisiones que salen del problema

| Decisión | Por qué |
|---|---|
| **Búsqueda e índices aislados por vertical** (una partición por vertical; toda búsqueda exige `vertical`) | Precisión: quien está en Licores quiere resultados de Licores. Es una **regla de búsqueda**, no un límite del modelo: los intereses del usuario sí cruzan verticales, a través de conceptos ([diseno-ia.md](diseno-ia.md)). |
| **Catálogo compartido para análisis** (un producto = un `master_product_id` en todo Rappi) | Permite cruzar verticales en SQL sin romper el aislamiento de la búsqueda. |
| **Catálogo separado de precios** | En la primera prueba (scraper CSV, sep-2026), 88.627 filas eran solo 7.458 productos únicos: las sucursales repiten el catálogo. El contenido (lo que se busca) es único; el precio es por tienda. |
| **Una sucursal por marca/formato** | Suficiente para saber *qué hay*; bajar todas las sucursales multiplica el tiempo sin aportar contenido nuevo. |
| **Corridas semanales con historial** | Detectar productos nuevos, retirados y cambios de precio. |
| **Uso responsable de fuentes públicas** | Solo páginas públicas sin barreras técnicas, sitemaps públicos y el JSON público de metadatos de tiendas. Sin APIs internas, login ni evasión de protecciones. Detalle en §7. |
| **Postgres + pgvector** | Una sola base para análisis (SQL) y búsqueda semántica (vectores). |
| **Solo Rappi Chile** | Otras apps de delivery quedan fuera de alcance ([ecosistema-rappi.md](ecosistema-rappi.md#4-alcance-solo-rappi)). |

Registro completo, con fechas: [decisiones.md](decisiones.md).

## 5. Lo que ya sabemos del contenido

> Snapshot del 26-09-2026 (descubrimiento, antes de la descarga completa); estado actual en [README → Resultados](../README.md#resultados).

- **8 verticales activos:** supermercado, conveniencia, Turbo, Rappi Mall (tecnología, belleza, hogar, deportes, librería, moda…), farmacia, licores, chocolatería y restaurantes.
- **Tiendas descubiertas** (14 ciudades): supermercado 463, Rappi Mall 506, licores 90, conveniencia 84, farmacia 66, chocolatería 51, Turbo 17. Una misma tienda puede aparecer en varios verticales.
- **Restaurantes:** 3.157 locales de 722 cadenas (se descarga una sucursal por cadena) y 4.133 independientes: 4.855 restaurantes en la cola de descarga.
- **Cobertura en tiendas:** las páginas públicas muestran hasta 24 productos por sub-pasillo; en las pruebas se obtuvo entre 8% y 58% de lo que declara cada tienda. Los restaurantes sí muestran el menú completo.
- **Jumbo y Tottus** no estaban activos en Rappi en septiembre de 2026.

## 6. Fases

Estado al 30-09-2026:

| Fase | Qué es | Estado |
|---|---|---|
| **1. Datos** | Scraper → Postgres: catálogo, menús, precios e historial por vertical (`rappi-scraper/`) | **Hecha.** Primera descarga completa del 24 al 27-09-2026, recuperación de fallidos el 28-09 y primera descarga semanal automática el 29 y 30-09 (`make schedule`). Cifras en [README → Resultados](../README.md#resultados) |
| **Prototipo** | App navegable con el asistente Bigotes y recomendaciones entre verticales (`prototipo-app/`) | **Listo para demo.** Con la API usa el catálogo real, voz y foto; sin ella, reglas locales |
| **2. RAG** | Conceptos (capa 2), embeddings de texto e imagen, búsqueda híbrida por vertical y evaluación (`rappi-ia/`) | **Construido.** Todos los documentos de búsqueda con embedding de texto. Evaluación en [README → Resultados](../README.md#resultados) |
| **3. Agente** | Bigotes en el backend y API: herramientas de búsqueda, reglas de conducta, voz y foto; LLM opcional | **Construido** |
| **4. Panel empresa** | Tendencias, demanda no satisfecha, frecuencia y abandono (`dashboard-empresa/`) | **Construido.** Usuarios, eventos y pedidos **simulados**; la pestaña Catálogo usa datos reales |
| **Cierre** | CI, documentación y validación final (etapa 8 de [diseno-ia.md](diseno-ia.md#7-etapas)) | **Hecha.** CI en verde y corrida post-refresh sobre el catálogo completo (30-09-2026) |

## 7. Límites y riesgos

- **Cobertura parcial en tiendas:** las páginas públicas muestran hasta 24 productos por sub-pasillo. Por eso "no está en el catálogo" no significa "Rappi no lo vende".
- **Uso responsable de los datos:**
  - **Fuentes:** solo páginas públicas sin barreras técnicas, los sitemaps públicos y el JSON público de metadatos de tiendas. Sin APIs internas, sin login y sin evadir protecciones.
  - **Ritmo:** una descarga a la vez, con pausas de 1,5 a 3 s entre solicitudes, y actualización semanal.
  - **Sin datos personales.**
  - **Fines:** investigación y demostración. Las descripciones, imágenes y marcas pertenecen a Rappi y a los comercios; un uso comercial requeriría autorización.
  - **Proyecto independiente:** no está afiliado a Rappi ni cuenta con su respaldo. Las marcas pertenecen a sus dueños.
- **Métricas con salvedades:** la relevancia de la búsqueda se juzga automáticamente por concepto, y sin el refuerzo por concepto el híbrido no se distingue del vectorial (0,860 frente a 0,846). Falta el juicio humano. La precisión de los conceptos es una estimación con jueces LLM sobre datos parciales. Detalle en [README → Resultados](../README.md#resultados).
- **Datos simulados:** el panel usa usuarios, eventos y pedidos simulados. Muestra la mecánica, no es evidencia.
- **Cambios del sitio:** si rappi.cl cambia su frontend, hay que ajustar los parsers. El reporte de calidad de cada corrida marca con ⚠ las respuestas anómalas; con una página nueva guardada, los tests muestran qué cambió.

## 8. Preguntas abiertas

- **¿Quién lo usaría y dónde?** (equipos internos de Rappi, usuarios finales, análisis de mercado). Define la interfaz y las condiciones de uso de los datos.
- **¿Se confirma el silo con datos internos?** Con eventos reales se puede medir qué hace un mismo usuario en distintos verticales y si las sugerencias cruzadas suben la frecuencia. Eso se valida con un grupo de control ([diseno-ia.md §5](diseno-ia.md#5-panel-para-la-empresa-vale-la-pena)).
- **¿Mejora de verdad el refuerzo por concepto?** Hay que juzgar a mano la muestra de 200 pares (`rappi-ia eval-sample`) y medirlo con `rappi-ia eval-human`.

Las preguntas ya resueltas (modelos, áreas iniciales, taxonomía, datos simulados) están en [decisiones.md](decisiones.md).
