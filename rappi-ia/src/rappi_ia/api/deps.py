"""Dependencias que comparten la app y sus routers (la conexión y el vertical del backend): viven aparte para que
`app.py` incluya los routers (`catalog.py`) sin que ellos tengan que importar `app`."""

from collections.abc import Iterator

from psycopg import Connection
from rappi_scraper.storage.search import VERTICALS

from ..agent.bigotes import PROTOTYPE_VERTICALS
from ..db import connect

FROM_PROTOTYPE = {v: k for k, v in PROTOTYPE_VERTICALS.items() if k != "turbo"}


def get_conn() -> Iterator[Connection]:
    """Falla rápido si Postgres no responde o una consulta se atasca (el prototipo tiene su cerebro local)."""
    with connect(connect_timeout=3, options="-c statement_timeout=20s") as conn:
        yield conn


def backend_vertical(vertical: str | None) -> str | None:
    """Acepta el código del backend ('licores') o el id del prototipo ('liquor'). Otro valor ('pet', que no es un
    vertical del catálogo) se trata como "sin vertical": Bigotes lo deduce del mensaje."""
    if vertical is None:
        return None
    code = FROM_PROTOTYPE.get(vertical, vertical)
    return code if code in VERTICALS else None
