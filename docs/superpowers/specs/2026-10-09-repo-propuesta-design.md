# Repo enfocado en el prototipo final y repo de historial

> Especificación · 09-10-2026 · Estado: **aprobada en conversación**

## 1. Para qué

`rappi-dlab` pasa a contar **una propuesta**: el prototipo final (Bigotes en la Home, buscador con Bigotes, pasaporte
con el juego de verticales y ronda mientras llega el pedido) y lo que lo alimenta (catálogo real, búsqueda y capa de
datos, API de Bigotes). Lo que quedó atrás (panel de negocio, presentación vieja, modos y versiones anteriores, el juego
como repo aparte) se conserva completo en un repo de historial, `rappi-evolucion-proyecto`.

### Criterios de éxito

1. `rappi-evolucion-proyecto` (privado) tiene todo el historial de `rappi-dlab` (todas las ramas, incluidas las de los
   PRs abiertos), el juego con su historial en `juego-verticales/`, etiquetas por etapa y un `EVOLUCION.md`.
2. `main` de `rappi-dlab` tiene el prototipo final y el juego (PRs #37, #39, #40, #41 y #38 fusionados, CI en verde).
3. Tras la limpieza (en un PR para revisión): sin `dashboard-empresa`, sin su paso en el CI, sin menciones al panel en
   docs ni en CLAUDE.md; los grafos (mapa de conceptos, mapa multivertical) en `docs/mapas/` y los diagramas
   regenerados sin el panel.
4. El README raíz se lee como propuesta: qué es, problema, propuesta, cómo funciona, resultados, grafos y diagramas,
   cómo probarlo, real vs. simulado, estructura, historial. `docs/README.md` es un índice en cuatro bloques
   (Propuesta, Cómo funciona, Resultados, Operación).
5. Ningún enlace interno roto; las suites de prototipo-app, rappi-ia y rappi-scraper en verde (CI).

## 2. Fuera de alcance

- Quitar las rutas `/analytics/*` de rappi-ia (solo las usaba el panel): quedan como pendiente.
- La carpeta del escritorio «Rappi - Presentación gerente».
- Datos descargados: nunca van a ninguno de los dos repos.
