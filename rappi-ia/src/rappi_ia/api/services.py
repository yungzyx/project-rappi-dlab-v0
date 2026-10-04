"""Servicios compartidos por la API, cargados una vez. Cada capacidad es opcional: si falta un modelo o un extra,
la API sigue funcionando y /health lo informa (el prototipo usa su cerebro local para lo que falte)."""

import logging
import os
import threading
from dataclasses import dataclass, field
from functools import cache

from ..agent.bigotes import Bigotes
from ..agent.compose import default_composer
from ..embeddings.base import TextEmbedder

log = logging.getLogger(__name__)


@dataclass
class Services:
    bigotes: Bigotes
    embedder: TextEmbedder | None = None
    photo_reader: object | None = None
    image_model: str | None = None
    transcriber: object | None = None
    missing: dict[str, str] = field(default_factory=dict)

    @property
    def capabilities(self) -> dict:
        return {
            "busqueda_semantica": self.embedder.model_name if self.embedder else None,
            "fotos": self.photo_reader is not None,
            "voz": self.transcriber is not None,
            "redaccion": self.bigotes.composer.name,
            "faltantes": self.missing,
        }


_LOCK = threading.Lock()


def services() -> Services:
    """Carga una sola vez aunque lleguen varias peticiones a la vez (FastAPI atiende en hilos)."""
    with _LOCK:
        return _load_services()


@cache
def _load_services() -> Services:
    """`RAPPI_IA_LIGHT=1` evita cargar modelos (tests, o un Mac sin el extra `ml`)."""
    light = os.environ.get("RAPPI_IA_LIGHT") == "1"
    missing: dict[str, str] = {}
    embedder = photo_reader = transcriber = image_model = None
    if not light:
        try:
            from ..embeddings.models import clip_embedder, text_embedder

            embedder = text_embedder()
            from ..agent.photo import PhotoReader

            clip = clip_embedder()
            photo_reader, image_model = PhotoReader(clip), clip.model_name
        except ImportError as exc:
            missing["ml"] = f"falta el extra ml ({exc.name})"
        except OSError as exc:  # p. ej. un modelo de .env que no está en caché, con HF_HUB_OFFLINE=1 (make serve)
            missing["ml"] = f"no se pudo cargar el modelo: {exc}"
        try:
            from ..agent.audio import transcriber as load_transcriber

            transcriber = load_transcriber()
        except ImportError as exc:
            missing["audio"] = f"falta el extra audio ({exc.name})"
        except OSError as exc:
            missing["audio"] = f"no se pudo cargar el modelo: {exc}"
    else:
        missing["modelos"] = "RAPPI_IA_LIGHT=1"
    bigotes = Bigotes(embedder, default_composer())
    log.info("Servicios listos: %s", {k: v for k, v in Services(bigotes, embedder).capabilities.items() if v})
    return Services(bigotes, embedder, photo_reader, image_model, transcriber, missing)
