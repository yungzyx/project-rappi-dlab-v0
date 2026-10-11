"""Configuración de rappi-ia: rutas, base de datos, modelos y API (todo sobreescribible con variables de entorno)."""

import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"  # cachés y reportes locales (fuera de git)

load_dotenv(PROJECT_ROOT / ".env")

# Modelo local de texto. Cambiar el modelo no rompe nada: cada vector guarda `embedding_model`.
TEXT_EMBEDDING_MODEL = os.environ.get("TEXT_EMBEDDING_MODEL", "intfloat/multilingual-e5-base")

# Memoria para construir los índices HNSW (SET LOCAL, solo esa transacción). Con los 64 MB por defecto de Postgres
# el grafo de la partición restaurantes (~151k × 768) no cabe y pgvector lo construye mucho más lento.
HNSW_MAINTENANCE_WORK_MEM = os.environ.get("HNSW_MAINTENANCE_WORK_MEM", "1GB")

# Nombre con que el agente se presenta ante la persona. Es el único lugar del backend donde vive.
AGENT_NAME = os.environ.get("AGENT_NAME", "Mochi")

# Productos que un concepto necesita en una vertical para que el juego diga que «pertenece» a ella.
GAME_MIN_ITEMS = int(os.environ.get("GAME_MIN_ITEMS", "20"))

# LLM opcional: sin ANTHROPIC_API_KEY, el agente responde con plantillas.
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY") or None
AGENT_LLM_MODEL = os.environ.get("AGENT_LLM_MODEL", "claude-sonnet-5")
# Tope de redacciones con Claude por día de Santiago, en cada proceso de la API: alcanzado, responden las plantillas.
# 0 = nunca llama a Claude.
LLM_DAILY_CALL_CAP = int(os.environ.get("LLM_DAILY_CALL_CAP", "300"))

# Entorno de la API: `local` (la demo en este Mac, por defecto) o `production` (un servidor detrás de un proxy).
API_ENV = os.environ.get("API_ENV", "local")
if API_ENV not in ("local", "production"):
    raise RuntimeError(f"API_ENV debe ser 'local' o 'production' (vale {API_ENV!r})")
API_PRODUCTION = API_ENV == "production"


def _flag(name: str, default: bool) -> bool:
    """Un interruptor «1»/«0» de la API; sin la variable vale `default`."""
    value = os.environ.get(name)
    return default if value is None or value == "" else value == "1"


# El panel (`/analytics/*`) y la documentación (`/docs`, `/openapi.json`) están encendidos en local y apagados en
# producción: ahí el panel y el esquema no son parte del producto. Cada uno se enciende o apaga con su variable.
API_ENABLE_ANALYTICS = _flag("API_ENABLE_ANALYTICS", not API_PRODUCTION)
API_DOCS = _flag("API_DOCS", not API_PRODUCTION)

# Red local (iPhone): solo con API_ALLOW_LAN=1 (`make serve-lan`). La API no tiene autenticación. En producción
# se ignora, igual que el patrón de `localhost:51xx`: los orígenes son exactamente los de API_CORS_ORIGINS (el sitio
# público; el beacon de eventos también compara con esa lista, aunque el sitio sirva la API en el mismo origen).
API_ALLOW_LAN = os.environ.get("API_ALLOW_LAN") == "1" and not API_PRODUCTION
API_CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "API_CORS_ORIGINS", "" if API_PRODUCTION else "http://localhost:5174,http://localhost:5175"
    ).split(",")
    if o.strip()
]

# Tope por consulta de la API (statement_timeout), en milisegundos: lo que espera una pantalla de la app, y el panel,
# cuyas métricas recorren todos los eventos. Una consulta que lo pasa responde 504 («La consulta tardó demasiado»).
API_TIMEOUT_INTERACTIVE_MS = int(os.environ.get("API_TIMEOUT_INTERACTIVE_MS", "5000"))
API_TIMEOUT_ANALYTICS_MS = int(os.environ.get("API_TIMEOUT_ANALYTICS_MS", "30000"))

# Conexiones de la API a Postgres: un pool por proceso. Un request que no consigue una en API_POOL_TIMEOUT_S segundos
# responde 503 («Hay mucha gente ahora…»).
API_POOL_MIN = int(os.environ.get("API_POOL_MIN", "2"))
API_POOL_MAX = int(os.environ.get("API_POOL_MAX", "10"))
API_POOL_TIMEOUT_S = float(os.environ.get("API_POOL_TIMEOUT_S", "3"))

# Cupos: cuántos requests de cada ruta cara se atienden a la vez en un proceso; el siguiente recibe 503 al tiro (con
# Retry-After), sin ocupar una conexión ni un hilo mientras espera.
API_MAX_CONCURRENT_ASK = int(os.environ.get("API_MAX_CONCURRENT_ASK", "4"))
API_MAX_CONCURRENT_SEARCH = int(os.environ.get("API_MAX_CONCURRENT_SEARCH", "8"))
API_MAX_CONCURRENT_OFFER = int(os.environ.get("API_MAX_CONCURRENT_OFFER", "4"))
API_MAX_CONCURRENT_ORDERS = int(os.environ.get("API_MAX_CONCURRENT_ORDERS", "4"))
API_MAX_CONCURRENT_ANALYTICS = int(os.environ.get("API_MAX_CONCURRENT_ANALYTICS", "2"))

# Cuerpo máximo de un request (413 si se pasa): el mismo orden que el beacon de eventos (512 KB).
API_MAX_BODY_BYTES = int(os.environ.get("API_MAX_BODY_BYTES", "524288"))

# Requests por minuto de cada IP (429 si se pasa), y de esos, cuántos pueden escribir (POST, PUT, PATCH, DELETE).
# 0 = sin tope. Se cuenta en memoria del proceso: vale con un solo worker. La IP es la del cliente que ve uvicorn (tras
# un proxy, con --proxy-headers). En local, este Mac (127.0.0.1) no tiene tope.
API_RATE_PER_MIN = int(os.environ.get("API_RATE_PER_MIN", "120"))
API_RATE_WRITE_PER_MIN = int(os.environ.get("API_RATE_WRITE_PER_MIN", "60"))

# `rappi-ia purge` borra a las personas del prototipo sin actividad (eventos, pedidos ni juego) en estos días.
PROTOTYPE_USER_RETENTION_DAYS = int(os.environ.get("PROTOTYPE_USER_RETENTION_DAYS", "180"))

# Ciudad fija de la demo (Santiago): «Cerca de ti» mide la distancia a este punto de Providencia.
MVP_HOME_LAT = float(os.environ.get("MVP_HOME_LAT", "-33.4263"))
MVP_HOME_LNG = float(os.environ.get("MVP_HOME_LNG", "-70.6106"))

# Jev (TypeSafe «System One»): juez opcional del proceso semanal. Sin TYPESAFE_API_KEY no se llama a Jev.
TYPESAFE_API_KEY = os.environ.get("TYPESAFE_API_KEY") or None
JEV_MODEL = os.environ.get("JEV_MODEL", "jev-1.13.0")
JEV_MAX_REQUESTS = int(os.environ.get("JEV_MAX_REQUESTS", "3000"))  # tope de llamadas por corrida (incluye reintentos)
JEV_PARALLEL = int(os.environ.get("JEV_PARALLEL", "16"))
# Precio vigente de Jev en US$ por millón de tokens de entrada (la salida no se cobra): el piloto estima su costo.
JEV_PRICE_PER_MTOK_INPUT = float(os.environ.get("JEV_PRICE_PER_MTOK_INPUT", "0.042"))
