# Evolución del proyecto

Este repo es el **historial completo** de [`rappi-dlab`](https://github.com/yungzyx/rappi-dlab), una propuesta independiente (no afiliada a Rappi). `rappi-dlab` quedó enfocado en el prototipo final y en lo que lo alimenta. Aquí se conserva todo lo anterior: cada etapa, las ramas de todos los PRs (incluidos los que seguían abiertos el 09-10-2026) y el juego de verticales, que tuvo su propio repo.

Para ver una etapa: `git checkout <etiqueta>`. Cada rama `feat/*`, `fix/*` y `docs/*` es la de su PR.

## Línea de tiempo

| Etiqueta | Fecha | Qué se agregó | Qué pasó después |
|---|---|---|---|
| `etapa-01-scraper` | 26-09-2026 | Scraper del catálogo público de Rappi Chile por vertical → Postgres + pgvector, con CI. | Sigue en `rappi-dlab`. |
| `etapa-02-auditoria-y-evaluacion` | 30-09-2026 | Auditoría en 4 bloques, operación en el Mac mini y evaluación honesta de la búsqueda (PRs #1 a #7). | Sigue. |
| `etapa-03-bigotes-multivertical` | 04-10-2026 | Bigotes recomienda entre verticales, mapa multivertical y revisión integral (PRs #8 a #13). | Sigue. |
| `etapa-04-chat-bigotes` | 04-10-2026 | Rondas de mejoras del chat de Bigotes con usuarios simulados (PRs #14 a #21). | El chat escrito se reemplazó por el buscador con Bigotes (etapa 08). |
| `etapa-05-base-real` | 05-10-2026 | Base real al día con el catálogo del 04-10 y correcciones de datos (PRs #22 a #28). | Sigue. |
| `etapa-06-capa-de-datos` | 06-10-2026 | Capa de datos (atributos, marcas, grafo, segmentos), precisión medida y mapa con sustitutos (PRs #29 a #35). | Sigue. |
| `etapa-07-bigotes-vivo` | 06-10-2026 | Tercer modo del prototipo: Bigotes de cuerpo entero en la Home, sin chat (PR #36). | Se unió con la Propuesta en el prototipo final (etapa 09). |
| `etapa-08-propuesta-buscador` | 09-10-2026 | La Propuesta sin chat escrito: buscador con Bigotes y prototipo de alta fidelidad (PRs #37 y #39). | Se unió con Bigotes vivo (etapa 09). |
| `etapa-09-prototipo-final` | 09-10-2026 | Dos modos: «Rappi hoy» y «Prototipo final»; la Home ya no sugiere productos; respuesta de Bigotes sin repetir (PR #40). | Base del prototipo actual. |
| `etapa-10-juego-en-prototipo` | 09-10-2026 | El juego de verticales dentro del prototipo final, con un solo pasaporte y una ronda mientras llega el pedido (PR #41). | Es el prototipo actual de `rappi-dlab`. |

## Lo que salió de `rappi-dlab`

- **Panel de negocio y presentación al gerente** (`dashboard-empresa/`): el panel mostraba con usuarios simulados el embudo de sugerencias, las decisiones de la semana y las oportunidades; la presentación contaba la propuesta con cifras. Están en todas las etapas de este repo.
- **Modos «Propuesta» y «Bigotes vivo»** del prototipo: ver etapas 07 y 08.
- **Chat escrito de Bigotes** (con voz y foto): ver etapa 04.

## El juego de verticales

`juego-verticales/` es el repo [`rappi-juego-verticales`](https://github.com/yungzyx/rappi-juego-verticales) (rama `feat/juego`), traído con su historial: un juego para celular que enseña las 8 verticales con rondas, sellos y cartas «¿Sabías que…?». Desde el 09-10-2026 vive dentro del prototipo final de `rappi-dlab`, donde su pasaporte es el pasaporte Rappi.
