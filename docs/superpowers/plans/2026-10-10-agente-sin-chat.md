# Agente sin chat, voz ni foto, y con nombres neutros (plan de implementación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lo que el producto ya no tiene (chatear con el agente, mandarle audios o fotos) sale del código y de la documentación vigente. En el código el agente usa nombres neutros (`agent`, `rappi_agent`), y su nombre visible («Mochi») queda en un solo lugar del backend y uno de la app.

**Architecture:** Es una limpieza en cuatro pasos.
1. Borrar voz, foto e imágenes del backend.
2. Renombrar el agente y sus rutas en el backend (`/chat` → `/agent/ask`, `/mochi/*` → `/agent/*`), con el nombre visible en `config.AGENT_NAME`.
3. Renombrar en la app (cliente, componentes, CSS, orígenes de eventos), con `AGENT_NAME` en una constante.
4. Ajustar el panel, la documentación vigente, los diagramas y `mvp-check`.

**Tech Stack:** Python 3.13 + FastAPI (rappi-ia); React 19 + Vite + Vitest (prototipo-app, dashboard-empresa); Archify para los diagramas.

**Contexto (decisiones del usuario, 10-10-2026):**
- **Qué se va:** la voz, la foto y la idea de «conversar» o «chatear». Las respuestas del agente a preguntas y chips se quedan, presentadas como búsqueda con el agente.
- **Nombres:** en el código, nombres neutros (`rappi_agent`/`agent`), porque el nombre de la mascota puede cambiar. En la app se sigue viendo «Mochi».
- **Documentación:** se limpia la vigente y el código. Las filas fechadas de `docs/decisiones.md` y los specs y planes en `docs/superpowers/` quedan como historial.

## Global Constraints

- **Nada se borra de forma permanente en la base.** La tabla `image_embeddings`, sus filas y la restricción de `app_events.modality` no cambian. No hay migraciones nuevas.
- **La API y la app dejan de usar voz y foto.** `modality` solo acepta `texto`.
- **Sin cambio de conducta para quien usa la app**, salvo los nombres. Las respuestas, las guardias, las ofertas y la búsqueda siguen igual. Los tests de conducta existentes se renombran, no se debilitan.
- **Historial de eventos intacto:**
  - Tipo `chat` → `ask` y orígenes `mochi-<momento>` → `agent-<momento>` en los eventos nuevos.
  - Las métricas del panel (`analytics/queries.py`) y el perfil (`events/store.py`, `WEIGHTS`) cuentan los dos nombres.
  - `EVENT_TYPES` acepta los dos tipos, para no rechazar lotes viejos.
- **Nombre visible:**
  - backend: `config.AGENT_NAME`, con «Mochi» por defecto y sobreescribible con la variable `AGENT_NAME`; reemplaza `ASSISTANT_NAME` de `agent/compose.py`;
  - app: `src/agent/name.js` exporta `AGENT_NAME = 'Mochi'`;
  - ningún texto visible escribe «Mochi» a mano.
- **Lo que no se toca:**
  - el chat del repartidor en el seguimiento (es de la app de Rappi, no del agente) se queda;
  - el componente de la mascota `Mascot` y su sprite `mochi-poses.webp` se quedan (el arte es de la mascota).
- **Tests verdes en cada tarea:**
  - en rappi-ia, `make test`, `make lint` y `make contract`;
  - en prototipo-app y dashboard-empresa, `npm test` y `npm run lint`;
  - al final, `make mvp-check`.
- **Idioma:** código en inglés; textos visibles y documentación en español.

## Review Focus

1. **Un cliente viejo** (una pestaña abierta antes del cambio) que manda a `/chat` o un evento `chat` no rompe la API. `/chat` responde 404 limpio y el evento viejo se guarda; nunca un 500 ni un lote rechazado. Tests en la tarea 2.
2. **El nombre visible sale de un solo lugar:** cambiar `AGENT_NAME` cambia todos los textos. Tests en las tareas 2 y 3.
3. **Las métricas del panel no se cortan:** un día con eventos `chat` viejos y `ask` nuevos se cuenta entero. Test en la tarea 2.
4. **Ninguna ruta, módulo, extra, comando ni documento vigente sigue nombrando voz, foto, Whisper o CLIP** (salvo el historial). Lo verifica un grep en la tarea 4.
5. **Arranque sin modelos de imagen ni audio:** `make mvp` y la API en modo completo arrancan sin pedir CLIP ni Whisper. Tarea 1.

---

### Task 1: Fuera la voz, la foto y las imágenes del backend

**Files:**
- Delete:
  - `rappi-ia/src/rappi_ia/agent/audio.py`, `agent/photo.py` y `embeddings/images.py`;
  - sus tests.
- Modify:
  - `rappi-ia/src/rappi_ia/api/app.py` (sin `/chat/voice` ni `/chat/photo`; `modality` solo `texto`);
  - `api/services.py` (sin cargar CLIP ni Whisper; capacidades sin `fotos` ni `voz`);
  - `embeddings/models.py`, `cli.py` (sin `embed-images`), `config.py`;
  - `rappi-ia/Makefile` (sin `images`);
  - `rappi-ia/pyproject.toml`: el extra `ml` queda solo con lo del modelo de texto; sale el extra `audio`; se actualiza `requirements.lock.txt` si hace falta, sin subir versiones;
  - `rappi-scraper/src/rappi_scraper/lock.py` (comentarios);
  - la ayuda de `install-ml`;
  - `prototipo-app/src/api/fixtures/health.json`, con `make contract`.

- [ ] **Step 1: Tests que fallan.**
  - `test_voice_and_photo_routes_are_gone` (404)
  - `test_health_lists_no_voice_or_photo_capability`
  - `test_services_load_without_image_or_audio_models`
  - `test_events_accept_only_text_modality`: `voz` da 422 y `texto` se guarda.
- [ ] **Step 2: Correrlos.** Expected: FAIL.
- [ ] **Step 3: Borrar y ajustar.** Correr `make test`, `make lint` y `make contract`. Revisar con `grep -rn -i "whisper\|clip\|chat/voice\|chat/photo\|embed-images\|make images" rappi-ia rappi-scraper --include=*.py --include=Makefile --include=*.toml`: solo debe quedar la migración histórica.
- [ ] **Step 4: Commit:** `refactor: el agente ya no recibe voz ni fotos`

### Task 2: El agente con nombres neutros en el backend

**Files:**
- Rename: `rappi-ia/src/rappi_ia/agent/bigotes.py` → `agent/rappi_agent.py` (clase `Bigotes` → `RappiAgent`; actualizar los imports y los tests).
- Modify:
  - `api/app.py`: `/chat` → `/agent/ask` (misma entrada y salida; `ChatIn` → `AskIn`; el evento que registra pasa a ser de tipo `ask`);
  - `api/mochi.py` → `api/agent.py`: `/mochi/offer` → `/agent/offer` y `/mochi/plans` → `/agent/plans`;
  - `agent/compose.py`: sin `ASSISTANT_NAME`, usa `config.AGENT_NAME`;
  - `config.py`: `AGENT_NAME = os.environ.get("AGENT_NAME", "Mochi")`;
  - `events/store.py`: `EVENT_TYPES` suma `ask` y conserva `chat`; `WEIGHTS` igual para los dos;
  - `analytics/queries.py`: cada `'chat'` pasa a `('chat', 'ask')`;
  - `events/synth.py`: genera `ask`;
  - `offers/engine.py`: textos con `AGENT_NAME` si nombran al agente;
  - `rappi-ia/tests/integration/test_contract.py`: los ejemplos pasan a `agent-ask`, `agent-offer-<momento>` y `agent-plans`; se borran los JSON viejos de `prototipo-app/src/api/fixtures/`.

- [ ] **Step 1: Tests que fallan.**
  - `test_ask_endpoint_answers_like_chat_did`
  - `test_old_chat_route_is_a_clean_404`
  - `test_agent_offer_and_plans_routes`
  - `test_agent_name_comes_from_config`: con `AGENT_NAME=Lupe`, el saludo dice Lupe.
  - `test_old_chat_events_are_still_accepted_and_counted`: un lote con `chat` y `ask` se guarda entero y las métricas los suman.
- [ ] **Step 2: Correrlos.** Expected: FAIL.
- [ ] **Step 3: Implementar.** Correr `make test`, `make lint` y `make contract` (y revisar los JSON nuevos). `grep -rni "bigotes\|mochi" rappi-ia/src` solo debe dejar el `"Mochi"` por defecto de `config.py`.
- [ ] **Step 4: Commit:** `refactor: el agente usa nombres neutros (/agent/ask, /agent/offer) y su nombre visible vive en la configuración`

### Task 3: La app con nombres neutros y el nombre visible en una constante

**Files:**
- Create: `prototipo-app/src/agent/name.js` (`export const AGENT_NAME = 'Mochi'`)
- Rename y modify:
  - `src/api/client.js`: `chat()` → `ask()` contra `/agent/ask`;
  - `src/api/mochi.js` → `src/api/agent.js`: `offer` y `plans` contra `/agent/offer` y `/agent/plans`; orígenes `agent-<momento>`; el origen de las sugerencias de una pregunta pasa de `chat` a `agent-ask`;
  - `src/components/assistant/ChatMessage.jsx` → `AgentMessage.jsx`;
  - `MochiPresence.jsx` → `AgentPresence.jsx` y `mochi-presence.css` → `agent-presence.css`;
  - `src/assistant/mochiAsk.js` → `agentAsk.js`;
  - `src/state/mochiQuiet.js` → `agentQuiet.js` (o donde esté), conservando las claves de localStorage existentes;
  - `src/screens/home/live/LiveBigotes.jsx` → `LiveAgent.jsx`;
  - las clases CSS `mochi-*` y `bigotes-*` pasan a `agent-*`;
  - `MOCHI_CART_EVENT` → `AGENT_CART_EVENT`;
  - los textos visibles con «Mochi» usan `AGENT_NAME`;
  - sus tests.
- Se quedan: `components/assistant/Mascot.jsx` y `assets/mochi-poses.webp` (el arte de la mascota), y el chat del repartidor en `TrackingScreen`.

- [ ] **Step 1: Tests que fallan.**
  - `'el nombre del agente sale de AGENT_NAME'`: con la constante cambiada vía un mock, el buscador, la puerta de conexión y el saludo muestran el nuevo nombre.
  - `'ask llama a /agent/ask'`
  - `'las ofertas usan /agent/offer y el origen agent-<momento>'`
- [ ] **Step 2: Correrlos.** Expected: FAIL.
- [ ] **Step 3: Renombrar** (con `git mv` para conservar el historial) y ajustar.
  - Correr `npm test` y `npm run lint`.
  - `grep -rn "Mochi" prototipo-app/src --include=*.js --include=*.jsx | grep -v "name.js\|\.test\."` debe salir vacío.
  - `grep -rni "bigotes\|mochi-\|chat" prototipo-app/src` solo debe dejar el chat del repartidor, `mochi-poses.webp` y `Mascot`.
- [ ] **Step 4: Commit:** `refactor: la app usa nombres neutros y el nombre de la mascota sale de una constante`

### Task 4: Panel, documentación, diagramas y mvp-check

**Files:**
- Modify:
  - `dashboard-empresa/src`: los textos que mencionan el chat dicen «preguntas al agente» o lo que corresponda;
  - `scripts/mvp-check.sh` y `prototipo-app/scripts/mvp-check.mjs`: el origen `agent-plan`; la consulta de la base acepta `mochi-plan` y `agent-plan`;
  - `prototipo-app/scripts/screenshots.mjs`, si usa nombres viejos;
  - la documentación vigente: `README.md`, `docs/README.md`, `docs/demo.md`, `docs/instalacion.md`, `docs/diseno-ia.md`, `docs/contexto-y-problema.md`, `docs/ecosistema-rappi.md`, `docs/capa-de-datos.md`, `docs/pruebas-de-usuario.md`, `CLAUDE.md`, `prototipo-app/README.md`, `rappi-ia/README.md`. Sin voz, foto ni chat del agente; los nombres de código nuevos; en `CLAUDE.md`, una línea que diga dónde vive el nombre visible del agente;
  - `docs/diagramas-fuente/arquitectura-ia.json` y `rag-datos.json`: sin voz, foto ni chat, regenerados con la skill Archify (HTML y PNG);
  - `docs/decisiones.md`: una fila nueva del 10-10 con el motivo; las filas viejas no se tocan.

- [ ] **Step 1: Ajustar el panel.** Correr `npm test` y `npm run lint` en dashboard-empresa.
- [ ] **Step 2: Documentación y diagramas** (Archify: `node bin/archify.mjs validate`/`deliver` según la skill).
- [ ] **Step 3: Verificar.**
  - `grep -rn -i "chat\|whisper\|clip\|voz\|foto" README.md docs/*.md CLAUDE.md prototipo-app/README.md rappi-ia/README.md docs/diagramas-fuente`: solo pueden quedar el chat del repartidor, «foto» de productos o platos, y nada del agente.
  - Correr `make mvp-check` y esperar «4 de 4 bien».
  - Correr todas las suites.
- [ ] **Step 4: Commit:** `docs: el agente sin chat, voz ni foto, y con su nombre en un solo lugar`
