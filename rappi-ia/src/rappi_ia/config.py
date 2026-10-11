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

# Red local (iPhone): solo con API_ALLOW_LAN=1 (`make serve-lan`). La API no tiene autenticación.
API_ALLOW_LAN = os.environ.get("API_ALLOW_LAN") == "1"
API_CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get("API_CORS_ORIGINS", "http://localhost:5174,http://localhost:5175").split(",")
    if o.strip()
]

# Ciudad fija de la demo (Santiago): «Cerca de ti» mide la distancia a este punto de Providencia.
MVP_HOME_LAT = float(os.environ.get("MVP_HOME_LAT", "-33.4263"))
MVP_HOME_LNG = float(os.environ.get("MVP_HOME_LNG", "-70.6106"))
