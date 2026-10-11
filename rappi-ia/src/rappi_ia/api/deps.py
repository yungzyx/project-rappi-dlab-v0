"""Dependencias que comparten la app y sus routers (la conexión, los servicios, el vertical del backend y la limpieza
de las entradas): viven aparte para que `app.py` incluya los routers (`catalog.py`, `agent.py`) sin que ellos tengan
que importar `app`."""

from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager

from fastapi import Depends
from psycopg import Connection
from pydantic import BaseModel, model_validator
from rappi_scraper.storage.search import VERTICALS

from .. import config
from ..agent.rappi_agent import PROTOTYPE_VERTICALS
from ..db import connect
from .services import Services, services

FROM_PROTOTYPE = {v: k for k, v in PROTOTYPE_VERTICALS.items() if k != "turbo"}


def get_conn() -> Iterator[Connection]:
    """Falla rápido si Postgres no responde (503, la app muestra «Sin conexión») o una consulta se atasca (504)."""
    with connect(connect_timeout=3) as conn:
        _statement_timeout(conn, config.API_TIMEOUT_INTERACTIVE_MS)
        yield conn


def get_analytics_conn(conn: Connection = Depends(get_conn)) -> Connection:
    """La del panel: sus métricas recorren todos los eventos y tienen más tiempo. Depende de `get_conn`, así un test que
    la reemplaza también reemplaza esta."""
    _statement_timeout(conn, config.API_TIMEOUT_ANALYTICS_MS)
    return conn


def _statement_timeout(conn: Connection, ms: int) -> None:
    """De sesión y confirmado, no `SET LOCAL`: un endpoint que confirma o deshace a mitad (registrar la consulta)
    seguiría sin tope en la transacción siguiente. Se fija en cada request, así sirve igual con un pool."""
    conn.execute("SELECT set_config('statement_timeout', %s, false)", (f"{ms}ms",))
    conn.commit()


def _own_connection() -> AbstractContextManager[Connection]:
    return connect(connect_timeout=3, options="-c statement_timeout=20s")


def get_connector() -> Callable[[], AbstractContextManager[Connection]]:
    """Abre conexiones fuera del request (una tarea en segundo plano corre después de cerrar la de `get_conn`). Los
    tests lo reemplazan para usar la conexión del test."""
    return _own_connection


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
