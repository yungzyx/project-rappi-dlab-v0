"""Servicios compartidos por la API, cargados una vez. Cada capacidad es opcional: si falta un modelo o un extra,
la API sigue funcionando y /health lo informa (lo que falte no tiene respaldo local en la app)."""

import logging
import os
import threading
from dataclasses import dataclass, field
from functools import cache

from ..agent.compose import TemplateComposer, default_composer
from ..agent.rappi_agent import RappiAgent
from ..embeddings.base import TextEmbedder

log = logging.getLogger(__name__)


@dataclass
class Services:
    agent: RappiAgent
    embedder: TextEmbedder | None = None
    missing: dict[str, str] = field(default_factory=dict)

    @property
    def capabilities(self) -> dict:
        return {
            "busqueda_semantica": self.embedder.model_name if self.embedder else None,
            "redaccion": self.agent.composer.name,
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
    embedder = None
    if not light:
        try:
            from ..embeddings.models import text_embedder

            embedder = text_embedder()
        except ImportError as exc:
            missing["ml"] = f"falta el extra ml ({exc.name})"
        except OSError as exc:  # p. ej. un modelo de .env que no está en caché, con HF_HUB_OFFLINE=1 (make serve)
            missing["ml"] = f"no se pudo cargar el modelo: {exc}"
        except Exception as exc:  # torch o MPS: la API arranca igual, sin búsqueda semántica
            log.exception("No se pudo cargar el modelo de texto")
            missing["ml"] = f"no se pudo cargar el modelo: {exc}"
    else:
        missing["modelos"] = "RAPPI_IA_LIGHT=1"
    try:
        composer = default_composer()
    except Exception as exc:  # el cliente de Claude: la API arranca igual y redacta con plantillas
        log.exception("No se pudo crear el redactor con Claude")
        missing["redaccion"] = f"no se pudo crear el redactor con Claude: {type(exc).__name__}"
        composer = TemplateComposer()
    agent = RappiAgent(embedder, composer)
    log.info("Servicios listos: %s", {k: v for k, v in Services(agent, embedder).capabilities.items() if v})
    return Services(agent, embedder, missing)
