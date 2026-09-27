#!/bin/zsh
# Espera a que termine `rappi refresh` (scraper) y actualiza la capa de IA con el catálogo nuevo:
# conceptos (con kNN), embeddings de texto, evaluación de la búsqueda y datos simulados del panel.
# Uso:  ./scripts/despues-del-refresh.sh            (en otra pestaña de la Terminal; se puede cerrar con Ctrl+C)
# Las imágenes NO se descargan aquí: son ~30.000 fotos (horas). Para eso: make images (después, con calma).
set -euo pipefail
cd "$(dirname "$0")/.."
LOG="data/logs/despues-del-refresh_$(date +%Y%m%d-%H%M%S).log"
mkdir -p data/logs
echo "Log: $LOG"
# "python -m rappi_scraper refresh" (Terminal) o ".venv/bin/rappi refresh" (launchd, los domingos).
while pgrep -f "rappi(_scraper)? refresh" >/dev/null; do
  echo "$(date +%H:%M) el scraper sigue descargando; reviso de nuevo en 10 min…" | tee -a "$LOG"
  sleep 600
done
echo "$(date +%H:%M) refresh terminado: actualizando rappi-ia" | tee -a "$LOG"
caffeinate -i make post-refresh 2>&1 | tee -a "$LOG"
