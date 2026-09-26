# Contexto y problema

> Por qué existe este proyecto, qué queremos responder y qué decisiones salen de eso.
> Última actualización: 26-09-2026. Research del ecosistema: [ecosistema-rappi.md](ecosistema-rappi.md).

## 1. El problema

**En Rappi, el comportamiento de un usuario dentro de un vertical no influye en las recomendaciones de los otros verticales.** Lo que alguien compra o mira en supermercados no cambia lo que se le recomienda en restaurantes, farmacia o Rappi Mall: cada vertical funciona como un silo.

Para trabajar sobre esa observación (entenderla, medir su efecto o construir algo que la aproveche) falta lo más básico: **no existe una fuente estructurada que diga qué contenido hay en cada vertical**, cuánto se repite entre verticales y en qué se diferencian. Rappi no lo publica en un formato consultable; solo está repartido en miles de páginas de su sitio.

Sin ese mapa de contenido no se puede:

- saber qué ofrece realmente cada vertical (productos, marcas, categorías, platos, precios);
- ver dónde se cruzan los verticales (el mismo producto en supermercado, Turbo y licores);
- darle a un agente LLM una base confiable para buscar y responder dentro de cada vertical.

## 2. Qué queremos lograr

1. **Mapa de contenido por vertical:** una base de datos con todo lo que se puede extraer públicamente de Rappi Chile, organizada por vertical.
2. **Análisis inicial y cruce de información:** cuánto contenido hay por vertical, qué se repite entre verticales, cómo varían los precios entre cadenas y en el tiempo.
3. **Base para un RAG / búsqueda semántica:** que un agente LLM pueda buscar por significado ("algo liviano para almorzar", "pañales talla G baratos") **dentro de un vertical a la vez**.

## 3. Preguntas que la base debe poder responder

- ¿Qué contenido hay en cada vertical? (tiendas, productos únicos, marcas, categorías, platos)
- ¿Qué productos aparecen en más de un vertical y en cuáles?
- ¿Cómo cambia el precio del mismo producto entre cadenas, ciudades y corridas?
- Dada una necesidad en lenguaje natural, ¿qué opciones existen **en este vertical**?

## 4. Decisiones que salen del problema

| Decisión | Por qué |
|---|---|
| **Búsqueda e índices aislados por vertical** (una partición por vertical; toda búsqueda exige `vertical`) | Replica el funcionamiento real de Rappi: un vertical no influye en otro. Evita que resultados de un vertical contaminen otro. |
| **Catálogo compartido para análisis** (un producto = un `master_product_id` en todo Rappi) | Permite cruzar verticales en SQL sin romper el aislamiento de la búsqueda. |
| **Catálogo separado de precios** | Las 88.627 filas del primer scraping eran solo 7.458 productos únicos: las sucursales repiten el catálogo. El contenido (lo que se busca) es único; el precio es por tienda. |
| **Una sucursal por marca/formato** | Suficiente para saber *qué hay*; bajar todas las sucursales multiplica el tiempo sin aportar contenido nuevo. |
| **Corridas periódicas con historial** | Detectar productos nuevos, retirados y cambios de precio. |
| **Solo páginas públicas, sin API interna** | Respeta `robots.txt` y no evade ninguna protección. |
| **Postgres + pgvector** | Una sola base para análisis (SQL) y búsqueda semántica (vectores). |
| **Solo Rappi, sin otras apps de delivery** (decidido 26-09-2026) | Uber Eats y PedidosYa exigirían evadir protección anti-bots; más riesgo legal y mantención sin una pregunta concreta que lo justifique. Detalle en [ecosistema-rappi.md](ecosistema-rappi.md#4-decisión-solo-rappi-por-ahora). |

## 5. Lo que ya sabemos del contenido

- **8 verticales activos:** supermercado, conveniencia, Turbo, Rappi Mall (tecnología, belleza, hogar, deportes, librería, moda…), farmacia, licores, chocolatería y restaurantes.
- **Tiendas descubiertas** (14 ciudades): supermercado 463, Rappi Mall 506, licores 90, conveniencia 84, farmacia 66, chocolatería 51, Turbo 17. Una misma tienda puede aparecer en varios verticales.
- **Restaurantes:** 6.697 locales, de los cuales 3.157 pertenecen a 722 cadenas (se descarga una sucursal por cadena) y 4.133 son independientes.
- **Cobertura en tiendas:** las páginas públicas muestran hasta 24 productos por sub-pasillo; en las pruebas se obtuvo entre 8% y 58% de lo que declara cada tienda. Los restaurantes sí muestran el menú completo.
- **Jumbo y Tottus** no estaban activos en Rappi en septiembre de 2026.

## 6. Fases

| Fase | Qué es | Estado |
|---|---|---|
| **1. Datos** | Scraper → Postgres: catálogo, menús, precios e historial por vertical (`rappi-scraper/`) | Código listo; descarga completa en curso |
| **2. RAG** | Embeddings, búsqueda híbrida (semántica + léxica) por vertical, generación con LLM, evaluación | Diseñado; pendiente de decisiones (ver abajo) |
| **3. Agente** | LLM con herramientas (búsqueda + consultas SQL exactas), si las preguntas reales lo requieren | Por definir |

## 7. Límites y riesgos

- **Cobertura parcial** en tiendas (tope de 24 productos por sub-pasillo en páginas públicas).
- **Legal:** los términos de uso de Rappi probablemente restringen la extracción automatizada; las descripciones e imágenes tienen derechos de autor. Bajo riesgo para análisis interno; para un producto comercial o de cara a usuarios, consultar con un abogado en Chile o evaluar un acuerdo de datos con Rappi.
- **Cambios del sitio:** si Rappi cambia su frontend, hay que ajustar los parsers (los tests con páginas guardadas lo detectan).

## 8. Preguntas abiertas

- **¿Quién va a usar el RAG / agente y dónde?** (equipo interno, usuarios finales, análisis de mercado). Define la interfaz y el nivel de riesgo legal.
- **¿Qué se quiere hacer con la observación de los silos?** (medirla, explicarla, proponer recomendaciones cruzadas…). Define qué análisis priorizar en la fase 2.
- **Áreas iniciales:** Marketing / contenido, Producto / growth y Data / BI (definido 26-09-2026).
- **Modelo de embeddings** (OpenAI, local, o comparar ambos) y **LLM** para redactar respuestas.
- **Set de evaluación:** 20–30 preguntas reales por vertical con su respuesta esperada.
