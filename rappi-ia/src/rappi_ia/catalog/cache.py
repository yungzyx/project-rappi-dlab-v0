"""Caché en proceso de lo que solo cambia con el catálogo: la Home, las ofertas, las tiendas de una vertical, los datos
del juego y los conteos por vertical de la búsqueda.

El catálogo cambia una vez por semana (una descarga y su `make post-refresh`), pero esas pantallas lo recorrían en
cada request. Cada valor se guarda con la versión del catálogo (`catalog_version`, la última corrida terminada) y
vence a los `ttl_s` segundos: una corrida nueva lo invalida y lo que cambia sin corrida (`make post-refresh`,
`make layers`) se ve a lo más 10 minutos después. La versión se vuelve a preguntar a lo más cada VERSION_TTL_S
segundos: una búsqueda pide los conteos de 8 verticales y no hace 8 consultas para eso.

Los valores son compartidos entre requests: quien los recibe no los modifica.
"""

import threading
import time
from collections.abc import Callable

from psycopg import Connection

DEFAULT_TTL_S = 600
VERSION_TTL_S = 5

_lock = threading.Lock()
_values: dict[str, tuple[int, float, object]] = {}  # nombre → (versión, cuándo se guardó, valor)
_version: tuple[float, int] | None = None  # (cuándo se preguntó, versión)


def _now() -> float:
    return time.monotonic()


def catalog_version(conn: Connection) -> int:
    """La última corrida terminada de rappi-scraper (por la llave primaria); 0 sin ninguna."""
    return conn.execute("SELECT max(run_id) FROM scrape_runs WHERE status = 'done'").fetchone()[0] or 0


def _current_version(conn: Connection) -> int:
    global _version
    now = _now()
    with _lock:
        known = _version
    if known is not None and now - known[0] < VERSION_TTL_S:
        return known[1]
    version = catalog_version(conn)
    with _lock:
        _version = (now, version)
    return version


def cached[T](name: str, conn: Connection, fn: Callable[[], T], ttl_s: float = DEFAULT_TTL_S) -> T:
    """`fn()` guardado por `name` mientras la versión del catálogo sea la misma y no pasen `ttl_s` segundos. `name`
    lleva los parámetros que cambian el resultado («deals:licores:24»)."""
    version = _current_version(conn)
    now = _now()
    with _lock:
        entry = _values.get(name)
    if entry is not None and entry[0] == version and now - entry[1] < ttl_s:
        return entry[2]
    value = fn()
    with _lock:
        _values[name] = (version, now, value)
    return value


def clear() -> None:
    """Olvida todo (los tests: cada uno recrea la base)."""
    global _version
    with _lock:
        _values.clear()
        _version = None
