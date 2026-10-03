# Documentación

Índice de la documentación de rappi-dlab. La presentación del proyecto está en el [README principal](../README.md).

Las cifras vigentes están en [README.md#resultados](../README.md#resultados). Si un documento muestra otra cifra, manda el README.

## Qué leer

| Si quieres… | Lee | Tiempo |
|---|---|---|
| Entender el problema y por qué existe el proyecto | [contexto-y-problema.md](contexto-y-problema.md) | 5 min |
| Ver el sistema de un vistazo | [Diagramas](#diagramas) | 2 min |
| Entender el diseño del RAG, el agente Bigotes y el panel | [diseno-ia.md](diseno-ia.md) | 20 min |
| Conocer el modelo de datos (capas 1 a 3) | [ecosistema-rappi.md §3](ecosistema-rappi.md#3-modelo-de-datos-del-ecosistema-propuesta) | 5 min |
| Instalar el proyecto y dejarlo actualizándose cada semana | [instalacion.md](instalacion.md) | 10 min de lectura |
| Consultar la base con SQL | [sql/README.md](sql/README.md) y [consultas.sql](sql/consultas.sql) | 5 min |
| Saber qué se decidió y por qué | [decisiones.md](decisiones.md) | 5 min |
| Usar o modificar el scraper | [rappi-scraper/README.md](../rappi-scraper/README.md) | 10 min |
| Conocer la capa de IA, su API y cómo se evalúa | [rappi-ia/README.md](../rappi-ia/README.md) | 10 min |
| Mostrar el MVP a alguien del negocio (guion de 10 minutos) | [demo.md](demo.md) | 3 min |
| Probar el prototipo de la app | [prototipo-app/README.md](../prototipo-app/README.md) | 5 min |
| Entender el panel de negocio | [dashboard-empresa/README.md](../dashboard-empresa/README.md) | 5 min |
| Trabajar en el código con un asistente de IA | [CLAUDE.md](../CLAUDE.md) | 2 min |

Los tiempos son de lectura y aproximados.

## Diagramas

GitHub muestra los PNG. Las versiones interactivas (HTML) hay que descargarlas y abrirlas en el navegador.

| Diagrama | Qué muestra | Imagen | Interactivo |
|---|---|---|---|
| Flujo de datos | Las etapas de punta a punta: Descarga → Postgres → IA offline → Consulta → Apps | [rag-datos.png](diagramas/rag-datos.png) | [rag-datos.html](diagramas/rag-datos.html) |
| Arquitectura de la IA | Catálogo, agente Bigotes y panel en cuatro carriles: datos offline, conversación online, entre verticales y negocio | [arquitectura-ia.png](diagramas/arquitectura-ia.png) | [arquitectura-ia.html](diagramas/arquitectura-ia.html) |
| Scraper | Cómo `rappi refresh` descubre, descarga y guarda el catálogo en Postgres + pgvector | [scraper-flujo.png](diagramas/scraper-flujo.png) | [scraper-flujo.html](diagramas/scraper-flujo.html) |

Las fuentes JSON de los diagramas están en [diagramas-fuente/](diagramas-fuente/).

## Reportes generados (fuera de git)

Se generan en cada equipo y no se versionan:

| Reporte | Dónde | Cómo se genera |
|---|---|---|
| Evaluación de la búsqueda | `rappi-ia/data/eval/busqueda.md` | `make eval` en `rappi-ia/` (también guarda τ; solo el reporte: `make eval EVAL_ARGS=`). La copia versionada que respalda las cifras del README está en [resultados/](resultados/) |
| Calidad de cada corrida del scraper | `rappi-scraper/data/reports/` | Al terminar cada corrida, o con `rappi report` |
| Logs de las corridas | `rappi-scraper/data/logs/` y `rappi-ia/data/logs/` | Automático |

## Documentos históricos

Reflejan el estado a su fecha y no se actualizan con cada corrida.

| Documento | Fecha | Qué conserva |
|---|---|---|
| [ecosistema-rappi.md](ecosistema-rappi.md) §1 y §2 | Research con fuentes públicas al 26-09-2026 | Los servicios de Rappi en Chile y cómo modelan sus datos otras super-apps comparables. El modelo de datos (§3) sigue vigente |
| Resultados con datos parciales | 27-09-2026 | Búsqueda híbrida con nDCG@10 de 0,898 y «sin resultado» con precisión 0,91 y recall 0,67. Los reemplazan los vigentes, del 30-09-2026 ([README.md#resultados](../README.md#resultados)) |
| Scraper original a CSV (`rappi-csv`) | Anterior a la base de datos | Sección [«Legado»](../rappi-scraper/README.md#legado-scraper-original-a-csv-rappi-csv) al final del README del scraper. Hoy lo cubren la base y `rappi export-csv` |
