"""Dependencias que comparten la app y sus routers (la conexión, los servicios, el vertical del backend y la limpieza
de las entradas): viven aparte para que `app.py` incluya los routers (`catalog.py`, `agent.py`) sin que ellos tengan
que importar `app`."""

from collections.abc import Iterator

from psycopg import Connection
from pydantic import BaseModel, model_validator
from rappi_scraper.storage.search import VERTICALS

from ..agent.rappi_agent import PROTOTYPE_VERTICALS
from ..db import connect
from .services import Services, services

FROM_PROTOTYPE = {v: k for k, v in PROTOTYPE_VERTICALS.items() if k != "turbo"}


def get_conn() -> Iterator[Connection]:
    """Falla rápido si Postgres no responde o una consulta se atasca (la app muestra «Sin conexión»)."""
    with connect(connect_timeout=3, options="-c statement_timeout=20s") as conn:
        yield conn


def backend_vertical(vertical: str | None) -> str | None:
    """Acepta el código del backend ('licores') o el id del prototipo ('liquor'). Otro valor ('pet', que no es un
    vertical del catálogo) se trata como "sin vertical": el agente lo deduce del mensaje."""
    if vertical is None:
        return None
    code = FROM_PROTOTYPE.get(vertical, vertical)
    return code if code in VERTICALS else None


def get_services() -> Services:
    return services()


def _no_nul(value):
    """Postgres no acepta \x00 en texto ni en JSON, ni UTF-8 inválido (un surrogate suelto): se limpia en vez de
    devolver un 500."""
    if isinstance(value, str):
        return value.replace("\x00", "").encode("utf-8", "replace").decode("utf-8")
    if isinstance(value, dict):
        return {_no_nul(k): _no_nul(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_no_nul(v) for v in value]
    return value


class Clean(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def strip_nul(cls, data):
        try:
            return _no_nul(data)
        except RecursionError as exc:  # JSON anidado miles de niveles
            raise ValueError("JSON demasiado anidado") from exc
