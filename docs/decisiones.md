# Decisiones del proyecto

> Registro fechado de las decisiones de rappi-dlab: qué se decidió y por qué, en una línea.
> Contexto: [contexto-y-problema.md](contexto-y-problema.md) · Diseño de la IA: [diseno-ia.md](diseno-ia.md) · Modelo de datos: [ecosistema-rappi.md](ecosistema-rappi.md) · Operación: [instalacion.md](instalacion.md) · Cifras: [README.md#resultados](../README.md#resultados).

## Alcance y uso responsable

| Fecha | Decisión | Motivo |
|---|---|---|
| 26-09-2026 | Solo Rappi Chile. Otras apps de delivery (Uber Eats, PedidosYa) quedan fuera de alcance. | El proyecto se enfoca en conectar entre sí los verticales de Rappi. |
| 26-09-2026 | Solo contenido público: páginas de rappi.cl sin barreras técnicas, sus sitemaps públicos y el JSON público de metadatos de tiendas. Sin APIs internas, login ni evasión de protecciones. | Leer solo lo que ve cualquier visitante del sitio. |
| 26-09-2026 | Una descarga a la vez, con pausas de 1,5–3 s entre páginas, y actualización semanal. | Carga mínima sobre el sitio. |
| 26-09-2026 | Sin datos personales: solo catálogo (tiendas, productos, platos y precios). | El proyecto no necesita datos de personas. |
| 26-09-2026 | Los datos descargados no se versionan (`rappi-scraper/data/` está ignorado); se traspasan con un respaldo de la base. | Tamaño y uso responsable de los datos. |
| 27-09-2026 | Sin datos internos de Rappi: lo que no tiene fuente pública se trabaja como supuesto y se marca como inferencia. | No se tiene acceso a datos internos. |
| 27-09-2026 | Las entidades internas (Pro, Ads, pagos, repartidores…) se modelan solo como diseño. | No se pueden obtener públicamente. |
| 28-09-2026 | Fines de investigación y demostración; un uso comercial requeriría autorización de Rappi. | Uso responsable del contenido público. |

## Catálogo y scraper

| Fecha | Decisión | Motivo |
|---|---|---|
| 26-09-2026 | Una sucursal por marca o formato (modo catálogo). | Basta para saber qué hay; bajar todas las sucursales multiplica el tiempo sin aportar contenido nuevo. |
| 26-09-2026 | Aceptar la cobertura parcial en tiendas: las páginas públicas muestran hasta 24 productos por sub-pasillo. | El resto solo se carga desde la API interna, que no se usa. |
| 26-09-2026 | Contenido separado de precios: un producto es un `master_product_id` en todo Rappi; el precio es por tienda y por corrida. | Las sucursales repiten el catálogo; el contenido es único. |
| 26-09-2026 | Corridas periódicas con historial de precios (un snapshot por corrida). | Detectar productos nuevos, retirados y cambios de precio. |
| 26-09-2026 | Corridas reanudables: cada corrida es una cola de jobs en la base, con reintento automático de los fallidos. | Una descarga completa dura días y puede cortarse. |
| 27-09-2026 | Un restaurante que redirige a "no encontrado" queda omitido, no fallido. | Ya no existe en Rappi; no es un cambio del sitio. |
| 27-09-2026 | Si falla el descubrimiento de una corrida nueva, la corrida se cierra como fallida. | No dejar corridas "en curso" a medias que bloqueen los pasos siguientes. |
| 28-09-2026 | Una página de pasillo o sub-pasillo ilegible se omite y se cuenta (`paginas_omitidas` en el reporte) sin descartar la tienda. Si no se pudo leer ningún pasillo, la tienda queda fallida. | Una página mala no debe botar todo lo recorrido; la salvaguarda evita tiendas "listas" solo con la portada. |
| 28-09-2026 | Un pasillo que redirige al listado de tiendas se trata como sucursal no disponible: se prueba la siguiente sucursal candidata y, si no queda ninguna, el job falla. | La redirección indica que la sucursal dejó de despachar a esa ubicación; omitir sus páginas dejaría un catálogo a medias. |
| 28-09-2026 | Los errores de lectura dicen qué página llegó en su lugar, sin ids. | Diagnóstico rápido, y el reporte sigue agrupando los errores por texto. |
| 28-09-2026 | Los jobs fallidos de la primera descarga se reintentan con el arreglo (`rappi retry-failed`). | Recuperar lo que se perdió por el error anterior: farmacia pasó de 5 a 13 tiendas descargadas. |

## Modelo de datos

| Fecha | Decisión | Motivo |
|---|---|---|
| 26-09-2026 | Postgres 17 + pgvector local. | Una sola base para análisis (SQL) y búsqueda semántica (vectores). |
| 26-09-2026 | Búsqueda aislada por vertical: `search_documents` tiene una partición por vertical y toda búsqueda exige `vertical`. | Precisión: quien está en Licores quiere resultados de Licores. |
| 26-09-2026 | Catálogo compartido para análisis entre verticales. | Cruzar verticales en SQL sin mezclar los índices de búsqueda. |
| 27-09-2026 | **Buscar dentro del vertical, entender a través de los verticales.** Los intereses del usuario se guardan como conceptos comunes (capa 2) y la recomendación cruzada va concepto → complemento → búsqueda en el otro vertical. | El silo es el problema que se quiere resolver, no un principio de diseño. El aislamiento es una regla de búsqueda, no un límite del modelo. |
| 27-09-2026 | Taxonomía de conceptos propia, enlazable a Google Product Taxonomy más adelante. | Estable frente a los pasillos y categorías de Rappi, que cambian (`category_map` hace el mapeo). |
| 27-09-2026 | `item_concepts` reemplaza a `dish_concepts`; los complementos van en `concept_edges` (curados o aprendidos por co-ocurrencia). | Un plato y un producto del súper se conectan al compartir concepto. |
| 27-09-2026 | Todo dato inferido guarda `method`, `confidence`, `model_version` y fecha. | Poder auditar y rehacer lo que generen reglas, embeddings o un LLM. |
| 27-09-2026 | Un solo historial de migraciones, en `rappi-scraper/src/rappi_scraper/storage/migrations/` (también las de rappi-ia). | Una base, un esquema versionado. |
| 27-09-2026 | La geografía (celdas H3) queda para después. | Ninguna vista actual la necesita. |

## Búsqueda e IA

| Fecha | Decisión | Motivo |
|---|---|---|
| 27-09-2026 | Modelos locales: `intfloat/multilingual-e5-base` para texto (768 dim.), CLIP ViT-B/32 con codificador multilingüe para imagen y Whisper (`faster-whisper`) para voz → texto. | Sin costo por uso, los datos no salen del equipo y se pueden cambiar (el caché se separa por modelo). |
| 27-09-2026 | El código decide y el LLM solo redacta: Claude es opcional y, sin clave, Bigotes responde con plantillas y las mismas reglas. | Evitar respuestas inventadas; la demo funciona sin clave. |
| 27-09-2026 | Jev (TypeSafe) queda como adaptador futuro para entender consultas. | Hoy basta con reglas + embeddings. |
| 27-09-2026 | Búsqueda híbrida: léxica + vectorial con fusión RRF (k = 60) y refuerzo por concepto. | Lo léxico acierta marcas y nombres exactos; lo vectorial, necesidades en lenguaje natural. |
| 27-09-2026 | Sin reranker por ahora. | Suma latencia y otro modelo; se agrega solo si la evaluación lo justifica. |
| 27-09-2026 | El precio no va en el texto que se embebe; se lee por SQL. | Cambia en cada corrida y obligaría a volver a embeber. |
| 27-09-2026 | Caché de embeddings por `content_hash`. | Un texto repetido se embebe una vez y solo se vuelve a embeber lo que cambia. |
| 27-09-2026 | "Sin resultado" con regla explícita: nada calza todas las palabras y, además, el concepto no tiene surtido en el vertical o el coseno queda bajo τ. | La búsqueda vectorial siempre devuelve vecinos. |
| 27-09-2026 | τ se calibra con el set de evaluación y queda versionado en `eval/thresholds.json`; la tarea semanal no lo sobrescribe. | Que un cambio de umbral se revise antes de aplicarse. |
| 27-09-2026 | Evaluar antes de elegir: set de consultas por vertical (positivas, negativas y sin tildes), comparando léxico, vectorial e híbrido. | El modo por defecto sale de la evaluación, no de una suposición. |
| 27-09-2026 | El precio mínimo es una columna indexada; con un tope de precio que deja pocos documentos, la búsqueda vectorial los revisa todos. | El índice HNSW con filtro cortaba antes y devolvía menos resultados sin avisar. |
| 28-09-2026 | Los textos por embeber se procesan ordenados por largo. | Lotes parejos y embeddings más rápidos, con el mismo resultado. |
| 28-09-2026 | Los índices HNSW se construyen con `maintenance_work_mem` configurable (`HNSW_MAINTENANCE_WORK_MEM`, 1 GB por defecto). | Con el valor por defecto de Postgres, el grafo de restaurantes no cabe en memoria y el índice tarda mucho más. |
| 28-09-2026 | El kNN de conceptos lee los vectores en binario y por bloques, no como texto. | Mucho menos memoria con el catálogo completo. |

## Agente Bigotes

| Fecha | Decisión | Motivo |
|---|---|---|
| 27-09-2026 | Solo habla de lo que existe: cada producto viene de una herramienta, los precios salen de SQL y un verificador rechaza lo que no se recuperó. | Confianza en las respuestas. |
| 27-09-2026 | Respeta el vertical: como máximo una sugerencia cruzada por respuesta, marcada "De otra tienda" y con su razón visible. | Ayudar sin invadir. |
| 27-09-2026 | Categorías sensibles nunca por iniciativa propia; en farmacia no sugiere medicamentos a partir de síntomas; productos +18 con recordatorio; tabaco y vapeo solo si se piden por nombre. | Cuidado del usuario y Ley 20.105 (publicidad del tabaco). |
| 27-09-2026 | Memoria transparente: intereses por concepto con decaimiento, visibles ("Aprendiendo de ti") y borrables ("Olvidar"). | El usuario controla lo que se aprende de él. |
| 27-09-2026 | Audio y fotos no se guardan; las consultas se guardan con datos personales redactados y su texto se borra a los 90 días. | Privacidad por diseño. |

## Datos simulados y panel

| Fecha | Decisión | Motivo |
|---|---|---|
| 26-09-2026 | Áreas iniciales: Marketing / contenido, Producto / growth y Data / BI. | Enfocar el diseño en preguntas concretas. |
| 27-09-2026 | Usuarios, eventos y pedidos simulados (generador con semilla) o del prototipo, siempre con `source`; nunca se mezclan con datos reales ni se presentan como evidencia. | No hay datos internos: el panel muestra la mecánica, no resultados. |
| 27-09-2026 | Las aristas aprendidas de datos simulados solo se ven en el panel; el agente no las usa. | No recomendar a partir de supuestos. |
| 27-09-2026 | Cualquier palanca del panel se valida con un grupo de control antes de escalar. | La comparación directa no mide el efecto causal. |

## Operación

| Fecha | Decisión | Motivo |
|---|---|---|
| 26-09-2026 | CI en GitHub Actions: lint y tests (unitarios e integración con Postgres + pgvector) en cada push. | Detectar regresiones antes de que lleguen a la descarga semanal. |
| 27-09-2026 | Actualización semanal (`make schedule`, domingos 03:00) en un solo equipo: descarga, respaldo rotativo (últimos 4) y capa de IA, con un candado que impide dos a la vez. | Dos descargas a la vez duplicarían la carga sobre rappi.cl; una sola mantiene el ritmo acordado. |
| 27-09-2026 | La descarga masiva de imágenes (`make images`) se corre a mano y nunca junto a una descarga. | Son decenas de miles de descargas. |
| 27-09-2026 | En el equipo que corre la tarea semanal, el proyecto va fuera de Documentos, Escritorio y Descargas. | macOS no deja que launchd lea esas carpetas. |
| 28-09-2026 | La tarea semanal borra su candado aunque la corten con una señal (por ejemplo, Ctrl-C). | No dejar candados huérfanos. |

## Repositorio y documentación

| Fecha | Decisión | Motivo |
|---|---|---|
| 28-09-2026 | Proyecto independiente: no está afiliado ni respaldado por Rappi; las marcas pertenecen a sus dueños. | Transparencia al presentarlo como propuesta. |
| 28-09-2026 | Repositorio privado; acceso de lectura para las personas invitadas. | Incluye contenido y marcas de terceros. |
| 28-09-2026 | Sin licencia open source. | Hay assets de terceros en el repositorio. |
| 28-09-2026 | Las decisiones viven en este documento; `CLAUDE.md` solo tiene las convenciones para asistentes de IA. | Un lugar para cada cosa. |
| 28-09-2026 | El scraper CSV original (`rappi-csv`, módulo `legacy`) se conserva y se documenta como "Legado" al final del README del scraper. | La base + `rappi export-csv` lo reemplazan, pero sigue sirviendo para `rappi import-csv`. |
| 28-09-2026 | Las métricas se publican con sus salvedades: relevancia juzgada automáticamente por concepto, ventaja del híbrido sobreestimada por el refuerzo de concepto y set de consultas negativas desactualizado con el catálogo completo. | No sobrestimar los resultados. Detalle en [README.md#resultados](../README.md#resultados). |

## Abiertas

- **Quién usaría el agente y dónde** (equipo interno, usuarios finales o análisis de mercado). Define la interfaz y el nivel de revisión que haría falta.
- **Set de consultas negativas:** varias ya tienen oferta real en el catálogo completo; hay que decidir cómo renovarlo.
- **Fallidos que quedan tras la recuperación** (49 grupos de tiendas y 408 restaurantes): revisar el reporte de calidad para separar cambios del sitio de sucursales dadas de baja.
