# Repo enfocado y repo de historial: plan

**Goal:** Historial completo en `rappi-evolucion-proyecto`; `rappi-dlab` con el prototipo final fusionado y limpio, contado como propuesta.

**Spec:** [docs/superpowers/specs/2026-10-09-repo-propuesta-design.md](../specs/2026-10-09-repo-propuesta-design.md).

## Global Constraints

- Nada se borra sin estar antes en `rappi-evolucion-proyecto`. Datos descargados nunca a GitHub.
- Fusiones con merge commit, en orden, cada una con CI en verde. La limpieza va en un PR que **no** se fusiona sin revisión del usuario.
- Docs en español; código en inglés.

## Review Focus

1. Ramas de PR del espejo: `refs/pull/*` no se pueden empujar; las ramas `feat/*` sí deben estar todas.
2. Conflictos al fusionar #38 tras la pila (README, diagramas): resolver conservando las cifras de #38 y los textos del prototipo final.
3. Enlaces relativos rotos tras mover o borrar archivos.
4. CI: el workflow no debe referirse a `dashboard-empresa`.
5. Diagramas: deben validar en Archify («showcase», 0 errores) tras quitar el panel.

### Task 1: Repo de historial
- [ ] Crear `yungzyx/rappi-evolucion-proyecto` privado; `git clone --mirror` de rappi-dlab, sin `refs/pull/*`, `push --mirror`.
- [ ] En un clon: `git subtree add --prefix=juego-verticales <rappi-juego-verticales> main`; `EVOLUCION.md`; etiquetas por etapa; push.
- [ ] Verificar: mismas ramas y mismo `main` que rappi-dlab; `juego-verticales/` con su historial; etiquetas en GitHub.

### Task 2: Fusionar la pila
- [ ] #37 → main; retarget #39, #40, #41 a main y fusionarlos en orden; #38 al final (resolver conflictos). CI en verde antes de cada fusión.
- [ ] Verificar: `main` contiene `prototipo-app/src/screens/game/GameScreen.jsx` y el CI de main en verde.

### Task 3: Limpieza como propuesta (PR)
- [ ] Rama `chore/repo-propuesta` desde main: mover grafos a `docs/mapas/`, `git rm -r dashboard-empresa`, quitar su paso del CI.
- [ ] Reescribir README raíz y `docs/README.md`; quitar el panel de los docs y de CLAUDE.md; regenerar diagramas con Archify.
- [ ] Verificar: sin `dashboard-empresa` en ningún archivo; enlaces relativos existen; `npm test`/`lint` del prototipo; `make lint` de rappi-ia y rappi-scraper; diagramas validan; CI del PR en verde.
- [ ] Abrir el PR y dejarlo para revisión del usuario.
