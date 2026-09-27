"""Configuración de rappi-ia: rutas, base de datos, modelos y API (todo sobreescribible con variables de entorno)."""

import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"  # cachés y reportes locales (fuera de git)

load_dotenv(PROJECT_ROOT / ".env")

# Modelos locales. Cambiar el modelo no rompe nada: cada vector guarda `embedding_model`.
TEXT_EMBEDDING_MODEL = os.environ.get("TEXT_EMBEDDING_MODEL", "intfloat/multilingual-e5-base")
IMAGE_EMBEDDING_MODEL = os.environ.get("IMAGE_EMBEDDING_MODEL", "clip-ViT-B-32")
# Codificador de texto multilingüe entrenado para el mismo espacio que CLIP ViT-B/32 (consultas en español → imágenes).
IMAGE_TEXT_EMBEDDING_MODEL = os.environ.get(
    "IMAGE_TEXT_EMBEDDING_MODEL", "sentence-transformers/clip-ViT-B-32-multilingual-v1"
)
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")

# LLM opcional: sin ANTHROPIC_API_KEY, Bigotes responde con plantillas.
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY") or None
BIGOTES_LLM_MODEL = os.environ.get("BIGOTES_LLM_MODEL", "claude-sonnet-5")

# Red local (iPhone): solo con API_ALLOW_LAN=1 (`make serve-lan`). La API no tiene autenticación.
API_ALLOW_LAN = os.environ.get("API_ALLOW_LAN") == "1"
API_CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get("API_CORS_ORIGINS", "http://localhost:5174,http://localhost:5175").split(",")
    if o.strip()
]
