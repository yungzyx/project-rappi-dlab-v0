# Instalación y operación

Cómo montar el proyecto completo en un Mac (Apple Silicon, macOS con [Homebrew](https://brew.sh)) y dejarlo actualizándose solo cada semana.

## Qué viaja por dónde

| Qué | Cómo llega |
|---|---|
| Código (scraper, rappi-ia, prototipo, panel, docs) | Este repositorio (privado): `gh repo clone` |
| Base de datos (catálogo, precios, menús, conceptos, embeddings) | Un respaldo de Postgres (`.dump`) desde otro Mac, o una descarga nueva. **No va al repositorio:** son datos de rappi.cl, de uso interno |
| Configuración (`.env`) | Se crea sola desde `.env.example` al instalar. `ANTHROPIC_API_KEY` es opcional y se agrega a mano |
| Modelos de IA (e5, CLIP, Whisper; ~2 GB) | Se descargan de Hugging Face la primera vez que se usan |
| `node_modules`, `.venv` | Se instalan con los comandos de abajo; no se copian entre Macs |

## 1. Requisitos

```bash
brew install git gh python@3.13 node
python3.13 --version   # 3.13.x (el `python3` de macOS es 3.9 y no sirve; los Makefiles usan python3.13)
node --version         # 22.22+ o 24.15+
gh auth login          # GitHub.com → HTTPS → "Authenticate Git with your GitHub credentials": Yes
```

## 2. Código

```bash
gh repo clone yungzyx/rappi-dlab ~/Rappi
```

Si ese Mac va a correr la actualización semanal, el proyecto debe estar **fuera** de Documentos, Escritorio y Descargas (por ejemplo `~/Rappi`). macOS no deja que las tareas programadas (launchd) lean esas carpetas, y la actualización fallaría sin avisar.

## 3. Base de datos

```bash
cd ~/Rappi/rappi-scraper
make db        # Postgres 17 + pgvector (Homebrew), bases rappi y rappi_test
make install   # .venv del scraper y .env
```

`postgresql@17` no deja sus comandos (`psql`, `pg_restore`…) en el PATH. Para dejarlos siempre disponibles:

```bash
echo 'export PATH="$(brew --prefix)/opt/postgresql@17/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
```

**Desde un respaldo** (recomendado). En el Mac de origen, `make backup` en `rappi-scraper/` deja `data/backups/rappi_<fecha>.dump`. Cópialo a este Mac y:

```bash
dropdb --if-exists rappi && createdb rappi
pg_restore --no-owner -d rappi ruta/al/rappi_<fecha>.dump
.venv/bin/rappi migrate    # migraciones nuevas, si las hay
.venv/bin/rappi status     # corridas y resumen por vertical
make test
```

**Sin respaldo:** `.venv/bin/rappi refresh` descubre y descarga todo desde cero. Son días de descarga; se puede cortar y retomar con el mismo comando.

## 4. Capa de IA

```bash
cd ~/Rappi/rappi-ia
make install install-ml db-test migrate   # .venv, modelos locales (~1 GB de paquetes), base de tests
make test
caffeinate -i make post-refresh           # conceptos, embeddings, evaluación y datos simulados al día con la base
```

`make post-refresh` también recalibra τ en `eval/thresholds.json`: si cambia, revisar y hacer commit.

## 5. Prototipo y panel

```bash
cd ~/Rappi/prototipo-app && npm ci
cd ~/Rappi/dashboard-empresa && npm ci
```

Para la demo, ver "Correr la demo completa" en el [README](../README.md). Para abrirla desde un iPhone, la API se levanta con `make serve-lan` (solo en una red de confianza: no tiene autenticación).

## 6. Actualización semanal

En **un solo** Mac, el que quede siempre prendido:

```bash
cd ~/Rappi/rappi-scraper
make schedule          # domingos 03:00: descarga y, al terminar, capa de IA
make schedule-status   # ¿está activa? ¿cómo terminó la última vez?
```

- **Qué corre:** `scripts/refresh-semanal.sh`. Primero `rappi refresh` (tiendas, restaurantes, búsqueda, reportes y respaldo en `data/backups/`, últimos 4). Si termina bien, `make post-refresh` de rappi-ia (conceptos, embeddings, evaluación, datos simulados y purga). Nunca corren dos a la vez.
- **τ:** la evaluación semanal no guarda τ, porque `eval/thresholds.json` está en el repositorio. Para recalibrar: `make eval` a mano y commit.
- **Dormido o apagado:** si a esa hora el Mac estaba **dormido**, la tarea corre al despertar; si estaba **apagado**, esa semana se salta. Por eso conviene:
  - que no se duerma (Ajustes del Sistema → Energía → evitar el reposo automático);
  - que se encienda solo tras un corte de luz (misma pantalla);
  - que quede con la sesión iniciada, porque launchd corre la tarea en la sesión del usuario.
- **Después de la primera semana:** `make schedule-status` debe mostrar `last exit code = 0`. La salida queda en `data/logs/launchd.*.log` y el reporte de calidad en `data/reports/`.
- **Fotos:** `make images` en rappi-ia, a mano y sin una descarga en curso (son decenas de miles de descargas).

## Operación

- **Jobs fallidos en una corrida** (el reporte los lista; a veces Rappi entrega páginas incompletas por un rato):

  ```bash
  cd ~/Rappi/rappi-scraper
  .venv/bin/rappi retry-failed --kind stores
  .venv/bin/rappi retry-failed --kind restaurants
  ./scripts/refresh-semanal.sh
  ```

  El script retoma solo lo reencolado, arma la búsqueda, respalda y actualiza la capa de IA.
- **Respaldo a mano:** `make backup` en `rappi-scraper/`.
- **Ver la base desde otro Mac**, sin abrir Postgres a la red: en el Mac de la base activa Ajustes del Sistema → General → Compartir → **Sesión remota** (SSH). En TablePlus, conexión **Over SSH** con ese Mac como servidor, y base en `127.0.0.1:5432`, `rappi`. Como comando de inicio, `SET default_transaction_read_only = on;`. Consultas de ejemplo: [docs/sql/](sql/).
