# Instalación y operación

Cómo montar el proyecto completo en un Mac (Apple Silicon, macOS con [Homebrew](https://brew.sh)) y dejarlo actualizándose solo cada semana.

Después de clonar (paso 2), **todos los comandos parten de la raíz del repositorio**.

## Qué viaja por dónde

| Qué | Cómo llega |
|---|---|
| Código (scraper, rappi-ia, prototipo, panel, docs) | Este repositorio (privado): `gh repo clone` |
| Base de datos (catálogo, precios, menús, conceptos, embeddings) | Un respaldo de Postgres (`.dump`) hecho en otro equipo, o una descarga nueva. **No va al repositorio:** contiene datos de rappi.cl y de sus comercios, que se usan solo con fines de investigación y demostración |
| Configuración (`.env`) | Se crea sola desde `.env.example` al instalar. `ANTHROPIC_API_KEY` es opcional y se agrega a mano |
| Modelos de IA (e5, CLIP, Whisper; ~2 GB) | Se descargan de Hugging Face la primera vez que se usan |
| `node_modules`, `.venv` | Se instalan con los comandos de abajo; no se copian entre equipos |

## 1. Requisitos

```bash
brew install git gh python@3.13 node
python3.13 --version   # 3.13.x (el `python3` de macOS es 3.9 y no sirve; los Makefiles usan python3.13)
node --version         # 22.22+ o 24.15+
gh auth login          # GitHub.com → HTTPS → "Authenticate Git with your GitHub credentials": Yes
```

## 2. Código

```bash
gh repo clone yungzyx/rappi-dlab
cd rappi-dlab
```

Si este equipo va a correr la actualización semanal, clona el repositorio **fuera** de Documentos, Escritorio y Descargas (por ejemplo, directamente en tu carpeta de usuario). macOS no deja que las tareas programadas (launchd) lean esas carpetas, y la actualización fallaría sin avisar.

## 3. Base de datos

```bash
cd rappi-scraper
make db        # Postgres 17 + pgvector (Homebrew), bases rappi y rappi_test
make install   # .venv del scraper y .env
```

`postgresql@17` no deja sus comandos (`psql`, `pg_restore`…) en el PATH. Para dejarlos siempre disponibles:

```bash
echo 'export PATH="$(brew --prefix)/opt/postgresql@17/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
```

**Desde un respaldo** (recomendado). En el equipo de origen, `make backup` en `rappi-scraper/` deja `data/backups/rappi_<fecha>.dump`. Cópialo a este equipo y, desde `rappi-scraper/`:

```bash
dropdb --if-exists rappi && createdb rappi
pg_restore --no-owner -d rappi ruta/al/rappi_<fecha>.dump
.venv/bin/rappi migrate    # migraciones nuevas, si las hay
.venv/bin/rappi status     # corridas y resumen por vertical
make test
```

**Opcional:** la restauración reconstruye los índices vectoriales (HNSW), y lo hace más rápido con más memoria de mantenimiento. Para darle 1 GB solo a esa sesión de Postgres, usa este `pg_restore` en lugar del de arriba:

```bash
PGOPTIONS='-c maintenance_work_mem=1GB' pg_restore --no-owner -d rappi ruta/al/rappi_<fecha>.dump
```

No cambia la configuración de Postgres. Si el equipo tiene poca memoria, usa un valor menor.

**Sin respaldo:** `.venv/bin/rappi refresh` descubre y descarga todo desde cero. Son días de descarga (la primera descarga completa tomó del 24 al 27-09-2026), porque va una página a la vez con pausas de 1,5–3 s. Se puede cortar y retomar con el mismo comando.

## 4. Capa de IA

```bash
cd rappi-ia
make install install-ml db-test migrate   # .venv, modelos locales (~1 GB de paquetes), base de tests
make test
caffeinate -i make post-refresh           # conceptos, embeddings, evaluación y datos simulados al día con la base
```

- **τ:** `make post-refresh` también recalibra τ en `src/rappi_ia/eval/thresholds.json`. Si cambia, revisar y hacer commit.
- **Evaluación:** el reporte queda en `data/eval/busqueda.md` (dentro de `rappi-ia/`).
- **Memoria de los índices:** `make embed` (parte de `post-refresh`) construye un índice HNSW por vertical con 1 GB de `maintenance_work_mem`, solo durante esa transacción. Se ajusta con `HNSW_MAINTENANCE_WORK_MEM` en `rappi-ia/.env` (ver `.env.example`); bájalo si el equipo tiene poca memoria.

## 5. Prototipo y panel

```bash
(cd prototipo-app && npm ci)
(cd dashboard-empresa && npm ci)
```

Para correr la demo, ver el [README](../README.md). Para abrirla desde un iPhone:

- la API se levanta con `make serve-lan` en `rappi-ia/` (solo en una red de confianza: no tiene autenticación);
- el prototipo apunta a ella con `VITE_API_URL` en `prototipo-app/.env.local`.

## 6. Actualización semanal

Va en **un solo** equipo: uno que quede siempre encendido. Programarla en dos equipos duplicaría las descargas sobre rappi.cl.

```bash
cd rappi-scraper
make schedule          # domingos 03:00: descarga y, al terminar, capa de IA
make schedule-status   # ¿está activa? ¿cómo terminó la última vez?
```

- **Qué corre:** `rappi-scraper/scripts/refresh-semanal.sh`.
  - Primero `rappi refresh`: tiendas, restaurantes, búsqueda, reportes y respaldo en `data/backups/` (quedan los últimos 4).
  - Si termina bien, `make post-refresh` de rappi-ia: purga (primero, para cumplir la retención aunque falle otro paso), conceptos, embeddings, evaluación, datos simulados y otra purga.
  - Nunca corren dos a la vez. El candado que lo impide se borra aunque la tarea se corte con una señal (Ctrl-C, cerrar la terminal).
- **τ:** la evaluación semanal no guarda τ, porque `thresholds.json` está en el repositorio. Para recalibrar: `make eval` a mano en `rappi-ia/` y commit.
- **Dormido o apagado:** si a esa hora el equipo estaba **dormido**, la tarea corre al despertar; si estaba **apagado**, esa semana se salta. Por eso conviene:
  - que no se duerma (Ajustes del Sistema → Energía → evitar el reposo automático);
  - que se encienda solo tras un corte de luz (misma pantalla); `sudo pmset -a autorestart 1 sleep 0` deja ambas cosas;
  - que quede con la sesión iniciada, porque launchd corre la tarea en la sesión del usuario.
- **FileVault:** en el Mac mini se mantiene activo ([decisiones.md](decisiones.md#operación)). Tras un corte de luz el equipo se reenciende pero espera la clave: hasta escribirla no corren Postgres ni la tarea, y si pasa el domingo 03:00 esa semana se salta.
- **Después de la primera semana:** `make schedule-status` debe mostrar `last exit code = 0` y, en «Últimas ejecuciones», una línea `exit=0` por semana (sale de `rappi-scraper/data/logs/ultimo-estado.txt`; «omitida» si otra descarga estaba en curso). La salida completa queda en `rappi-scraper/data/logs/launchd.*.log` y el reporte de calidad en `rappi-scraper/data/reports/`.
- **`rappi refresh` lanzado a mano:** `./scripts/despues-del-refresh.sh` en `rappi-ia/` espera a que termine y corre `make post-refresh`. A diferencia de la tarea semanal, recalibra τ en `thresholds.json`: si cambia, revisar y hacer commit.
- **Fotos:** `make images` en `rappi-ia/`, a mano y sin una descarga en curso (son decenas de miles de descargas).

## Operación

- **Jobs fallidos en una corrida** (el reporte los lista; a veces Rappi entrega páginas incompletas por un rato):

  ```bash
  cd rappi-scraper
  .venv/bin/rappi retry-failed --kind stores
  .venv/bin/rappi retry-failed --kind restaurants
  ./scripts/refresh-semanal.sh
  ```

  El script retoma solo lo reencolado, arma la búsqueda, respalda y actualiza la capa de IA. Así se recuperaron el 28-09-2026 los fallidos de la primera descarga completa; farmacia, por ejemplo, pasó de 5 a 13 tiendas descargadas.
- **Respaldo a mano:** `make backup` en `rappi-scraper/`.
- **Mover la carpeta del proyecto** rompe los `.venv` (guardan rutas absolutas): recréalos con `make install` en `rappi-scraper/` y `make install install-ml` en `rappi-ia/`. No la muevas con una descarga en curso.
- **Ver la base desde otro equipo**, sin abrir Postgres a la red:
  - en el equipo de la base, activa Ajustes del Sistema → General → Compartir → **Sesión remota** (SSH);
  - en TablePlus, crea una conexión **Over SSH** con ese equipo como servidor y la base en `127.0.0.1:5432`, `rappi`;
  - como comando de inicio, `SET default_transaction_read_only = on;`.

  Consultas de ejemplo: [sql/](sql/).
