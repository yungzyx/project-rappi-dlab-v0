"""Configuración: URLs de Rappi, ritmo de requests y rutas del proyecto.

El ritmo de requests se puede ajustar con variables de entorno (o en `.env`) sin tocar código:
RAPPI_DELAY_MIN, RAPPI_DELAY_MAX, RAPPI_TIMEOUT, RAPPI_MAX_RETRIES, RAPPI_RETRY_BACKOFF.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Rutas absolutas desde la raíz del proyecto: funcionan sin importar desde dónde se ejecute.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
EXPORT_DIR = DATA_DIR / "exports"

load_dotenv(PROJECT_ROOT / ".env")


def _env_float(name: str, default: float) -> float:
    return float(os.environ.get(name, default))


BASE_URL = "https://www.rappi.cl"
STORES_METADATA_URL = (
    "https://cpgs-br.s3.amazonaws.com/web-assets/public/indexedData/country/cl/storefronts-metadata.json"
)
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

# Ritmo prudente: pausa aleatoria entre requests (segundos) y reintentos ante 429/5xx.
REQUEST_DELAY_RANGE = (_env_float("RAPPI_DELAY_MIN", 1.5), _env_float("RAPPI_DELAY_MAX", 3.0))
TIMEOUT_SECONDS = _env_float("RAPPI_TIMEOUT", 30)
MAX_RETRIES = int(_env_float("RAPPI_MAX_RETRIES", 3))
RETRY_BACKOFF_SECONDS = _env_float("RAPPI_RETRY_BACKOFF", 10)

# Si una sucursal no está disponible, cuántas otras de la misma marca probar.
MAX_BRANCH_ATTEMPTS = 3

# Intentos por job: 1 + una pasada automática de reintento al final de la corrida
# (cubre errores transitorios de Rappi como 502 o páginas incompletas).
MAX_JOB_ATTEMPTS = 2
# Jobs seguidos que fallan sin respuesta útil de rappi.cl (403, 429, red, página de desafío): la corrida se detiene.
MAX_CONSECUTIVE_FAILURES = 10
# Los jobs de esa racha vuelven a la cola mientras lleven menos de 4 intentos: así resisten un bloqueo en la pasada de
# reintento y otro la semana siguiente. Si la misma racha se repite semana tras semana es un error fijo de esos jobs,
# no un bloqueo: quedan 'failed' y la corrida sigue.
MAX_BLOCKED_JOB_ATTEMPTS = MAX_JOB_ATTEMPTS + 2

# Rappi redirige aquí cuando la tienda no despacha a la ubicación configurada.
UNAVAILABLE_PATH_PREFIX = "/tiendas/tipo/"
# Rappi redirige a /restaurantes?restaurantNotFound=true cuando el restaurante ya no existe (cerró o se dio de baja).
RESTAURANT_NOT_FOUND_QUERY = "restaurantNotFound=true"
