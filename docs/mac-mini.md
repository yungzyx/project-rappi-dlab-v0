# Instalar todo en el Mac mini

El Mac mini queda como **Mac principal**: descarga rappi.cl cada domingo, actualiza la capa de IA y sirve la API. El MacBook queda para desarrollar.

En el Mac mini el proyecto va en **`~/Rappi`**, no en `~/Documents`: macOS no deja que las tareas programadas (launchd) lean Documentos, Escritorio ni Descargas, y la actualización del domingo fallaría sin que nadie lo note.

## Qué viaja por dónde

| Qué | Cómo llega al Mac mini |
|---|---|
| Código (scraper, rappi-ia, prototipo, panel, docs) | GitHub (repositorio privado): `gh repo clone` |
| Base de datos (catálogo, precios, menús, conceptos, embeddings) | Un respaldo (`.dump`) por AirDrop o disco. **No va a GitHub** (datos de rappi.cl, uso interno) |
| Configuración (`.env`) | Se crea sola desde `.env.example` al instalar. `ANTHROPIC_API_KEY` es opcional y se agrega a mano |
| Modelos de IA (e5, CLIP, Whisper; ~2 GB) | Se descargan de Hugging Face la primera vez que se usan |
| `node_modules`, `.venv` | Se instalan con los comandos de abajo |

## 1. En el MacBook: respaldo

```bash
cd ~/Documents/LeRepo/Rappi/rappi-scraper && make backup
```

Deja `data/backups/rappi_<fecha>.dump` (~1 GB con conceptos y embeddings). Pásalo al Mac mini por AirDrop (llega a `~/Downloads`).

## 2. En el Mac mini: requisitos

Con [Homebrew](https://brew.sh) instalado:

```bash
brew install git gh python@3.13 node
python3.13 --version   # 3.13.x (el `python3` de macOS es 3.9 y no sirve; los Makefiles usan python3.13)
node --version         # 22.22+ o 24.15+
gh auth login          # GitHub.com → HTTPS → "Authenticate Git with your GitHub credentials": Yes
```

## 3. Código y base de datos

```bash
gh repo clone yungzyx/rappi-dlab ~/Rappi
cd ~/Rappi/rappi-scraper
make db        # Postgres 17 + pgvector (Homebrew), bases rappi y rappi_test
make install   # .venv del scraper y .env
```

`postgresql@17` no deja sus comandos (`psql`, `pg_restore`…) en el PATH. Para dejarlos siempre disponibles:

```bash
echo 'export PATH="$(brew --prefix)/opt/postgresql@17/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
```

Restaurar el respaldo (ajusta el nombre del archivo):

```bash
dropdb --if-exists rappi && createdb rappi
pg_restore --no-owner -d rappi ~/Downloads/rappi_20260927-231341.dump
.venv/bin/rappi migrate    # migraciones nuevas, si las hay
.venv/bin/rappi status     # debe mostrar las corridas terminadas
make test
```

## 4. Capa de IA

```bash
cd ~/Rappi/rappi-ia
make install install-ml db-test migrate   # .venv, modelos locales (~1 GB de paquetes), base de tests
make test
```

## 5. Recuperar lo que falló y poner todo al día

En la descarga del 27-09, Rappi entregó páginas incompletas el domingo en la tarde y 72 grupos de tiendas quedaron fallidos (entre ellos Cruz Verde, Farmacias Ahumada, Preunic y Farmacia Skol: por eso farmacia tiene pocos productos). Esas páginas hoy se leen bien. También quedaron ~560 restaurantes fallidos; los que ya no existen en Rappi ahora se marcan como omitidos.

```bash
cd ~/Rappi/rappi-scraper
.venv/bin/rappi retry-failed --kind stores
.venv/bin/rappi retry-failed --kind restaurants
./scripts/refresh-semanal.sh
```

El script retoma solo lo reencolado, arma la búsqueda, respalda y después actualiza la capa de IA: conceptos, embeddings (la primera vez son ~80 mil textos, unos 30 min), evaluación y datos simulados. En total son unas 3–4 horas. Si ya hay una descarga o una actualización en curso, no hace nada.

## 6. Prototipo y panel

```bash
cd ~/Rappi/prototipo-app && npm ci
cd ~/Rappi/dashboard-empresa && npm ci
```

Para la demo, ver "Correr la demo completa" en el [README](../README.md), con `~/Rappi` en vez de `~/Documents/LeRepo/Rappi`. Para abrirla desde el iPhone, la API se levanta con `make serve-lan` (solo en una red de confianza: no tiene autenticación).

## 7. Tarea semanal (solo en el Mac mini)

```bash
cd ~/Rappi/rappi-scraper
make schedule          # domingos 03:00: descarga y, al terminar, capa de IA
make schedule-status   # ¿está activa? ¿cómo terminó la última vez?
```

- **Qué corre:** `scripts/refresh-semanal.sh`. Primero `rappi refresh` (tiendas, restaurantes, búsqueda, reportes y respaldo en `data/backups/`, últimos 4). Si termina bien, `make post-refresh` de rappi-ia (conceptos, embeddings, evaluación, datos simulados y purga). Nunca corren dos a la vez.
- **τ:** la evaluación semanal no guarda τ, porque `eval/thresholds.json` está en git. Para recalibrar: `make eval` a mano y commit.
- **Dormido o apagado:** si a esa hora el Mac mini estaba **dormido**, la tarea corre al despertar; si estaba **apagado**, esa semana se salta. Por eso conviene:
  - que no se duerma (Ajustes del Sistema → Energía → evitar el reposo automático);
  - que se encienda solo tras un corte de luz (misma pantalla);
  - que quede con la sesión iniciada, porque launchd corre la tarea en tu sesión.
- **Revisar el primer lunes:** `make schedule-status` debe mostrar `last exit code = 0`. La salida queda en `data/logs/launchd.*.log` y el reporte en `data/reports/`.
- **Un solo Mac:** programar la tarea en **un solo** Mac. En el MacBook no se corre `make schedule`.
- **Fotos:** `make images` en rappi-ia, a mano y sin una descarga en curso (son decenas de miles de descargas).

## Ver la base del Mac mini desde el MacBook

Sin abrir Postgres a la red: en el Mac mini activa **Ajustes del Sistema → General → Compartir → Sesión remota** (SSH). En TablePlus, crea la conexión con **Over SSH**:

- **SSH:** servidor `mac-mini.local` (o su IP) y tu usuario del Mac mini.
- **Base:** host `127.0.0.1`, puerto `5432`, base `rappi`.

Como comando de inicio, `SET default_transaction_read_only = on;` para mirar sin riesgo. Consultas de ejemplo: [docs/sql/](sql/).
