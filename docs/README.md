# Documentación

Índice de la documentación de rappi-dlab. La propuesta del proyecto está en el [README principal](../README.md); las cifras vigentes, en [README.md#resultados](../README.md#resultados) (si un documento muestra otra cifra, manda el README).

## 1. Propuesta

| Si quieres… | Lee | Tiempo |
|---|---|---|
| Entender el problema y por qué existe el proyecto | [contexto-y-problema.md](contexto-y-problema.md) | 5 min |
| Ver el prototipo final: Mochi, buscador, pasaporte y juego | [prototipo-app/README.md](../prototipo-app/README.md) | 5 min |
| Mostrarlo a alguien del negocio (guion de 10 minutos) | [demo.md](demo.md) | 3 min |
| Saber qué se decidió y por qué | [decisiones.md](decisiones.md) | 5 min |
| Ver cómo llegó a ser lo que es (todas las etapas) | [rappi-evolucion-proyecto](https://github.com/yungzyx/rappi-evolucion-proyecto) | 5 min |

## 2. Cómo funciona

| Si quieres… | Lee | Tiempo |
|---|---|---|
| Ver el sistema de un vistazo | [Diagramas y mapas](#diagramas-y-mapas) | 2 min |
| Entender el diseño del RAG y del agente Mochi | [diseno-ia.md](diseno-ia.md) | 20 min |
| Conocer el modelo de datos (capas 1 a 3) | [ecosistema-rappi.md §3](ecosistema-rappi.md#3-modelo-de-datos-del-ecosistema-propuesta) | 5 min |
| Usar desde otra herramienta lo que la base le suma al catálogo (atributos, marcas, grafo, segmentos) | [capa-de-datos.md](capa-de-datos.md) | 8 min |
| Conocer la capa de IA, su API y cómo se evalúa | [rappi-ia/README.md](../rappi-ia/README.md) | 10 min |
| Usar o modificar el scraper | [rappi-scraper/README.md](../rappi-scraper/README.md) | 10 min |
| Diseño del juego de verticales dentro del prototipo | [especificación](superpowers/specs/2026-10-09-juego-en-prototipo-design.md) | 5 min |

### Diagramas y mapas

GitHub muestra las imágenes; las versiones interactivas (HTML) hay que descargarlas y abrirlas en el navegador.

| Qué | Qué muestra | Imagen | Interactivo |
|---|---|---|---|
| Flujo de datos | Las etapas de punta a punta: descarga → Postgres → IA offline → consulta → prototipo | [rag-datos.png](diagramas/rag-datos.png) | [rag-datos.html](diagramas/rag-datos.html) |
| Arquitectura de la IA | Catálogo y agente Mochi por carriles: datos offline, conversación online y entre verticales | [arquitectura-ia.png](diagramas/arquitectura-ia.png) | [arquitectura-ia.html](diagramas/arquitectura-ia.html) |
| Scraper | Cómo `rappi refresh` descubre, descarga y guarda el catálogo | [scraper-flujo.png](diagramas/scraper-flujo.png) | [scraper-flujo.html](diagramas/scraper-flujo.html) |
| Mapa multivertical | Qué productos y conceptos comparten las verticales, con complementos, sustitutos y «nunca junto»; se regenera con `rappi-ia multivertical` | [mapa-conceptos.jpg](mapas/mapa-conceptos.jpg) | [mapa-multivertical.html](mapas/mapa-multivertical.html) |

Las fuentes JSON de los diagramas están en [diagramas-fuente/](diagramas-fuente/) (se regeneran con la skill Archify).

## 3. Resultados

| Si quieres… | Lee |
|---|---|
| Las cifras vigentes, con qué tipo de dato es cada una | [README.md#resultados](../README.md#resultados) |
| Los reportes de evaluación de la búsqueda, uno por fecha | [resultados/](resultados/) (`busqueda-*.md`) |
| La precisión medida de conceptos, atributos y marcas | [resultados/capas-precision-2026-10-06.md](resultados/capas-precision-2026-10-06.md) y [la muestra nueva](resultados/capas-precision-2026-10-06-nueva-muestra.md) |

## 4. Operación

| Si quieres… | Lee | Tiempo |
|---|---|---|
| Instalar el proyecto y dejarlo actualizándose cada semana | [instalacion.md](instalacion.md) | 10 min de lectura |
| Consultar la base con SQL | [sql/README.md](sql/README.md) y [consultas.sql](sql/consultas.sql) | 5 min |
| Probar a Mochi (API) como usuario y dejar cada fallo como test | [pruebas-de-usuario.md](pruebas-de-usuario.md) | 3 min |
| Trabajar en el código con un asistente de IA | [CLAUDE.md](../CLAUDE.md) | 2 min |
| Usar el panel de negocio (herramienta para más adelante, datos simulados) | [dashboard-empresa/README.md](../dashboard-empresa/README.md) | 5 min |

### Reportes generados (fuera de git)

| Reporte | Dónde | Cómo se genera |
|---|---|---|
| Evaluación de la búsqueda | `rappi-ia/data/eval/busqueda.md` | `make eval` en `rappi-ia/` (también guarda τ; solo el reporte: `make eval EVAL_ARGS=`). La copia versionada está en [resultados/](resultados/) |
| Calidad de cada corrida del scraper | `rappi-scraper/data/reports/` | Al terminar cada corrida, o con `rappi report` |
| Logs de las corridas | `rappi-scraper/data/logs/` y `rappi-ia/data/logs/` | Automático |

## Documentos históricos

Reflejan el estado a su fecha y no se actualizan con cada corrida.

| Documento | Fecha | Qué conserva |
|---|---|---|
| [ecosistema-rappi.md](ecosistema-rappi.md) §1 y §2 | Research con fuentes públicas al 26-09-2026 | Los servicios de Rappi en Chile y cómo modelan sus datos otras super-apps comparables. El modelo de datos (§3) sigue vigente |
| Scraper original a CSV (`rappi-csv`) | Anterior a la base de datos | Sección [«Legado»](../rappi-scraper/README.md#legado-scraper-original-a-csv-rappi-csv) del README del scraper |
| Presentación al gerente, chat escrito y modos anteriores del prototipo | 30-09 al 09-10-2026 | En [rappi-evolucion-proyecto](https://github.com/yungzyx/rappi-evolucion-proyecto), con una etiqueta por etapa |
