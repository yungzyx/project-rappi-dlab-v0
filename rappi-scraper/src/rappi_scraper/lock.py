"""Una descarga a la vez contra rappi.cl, para todos los comandos del scraper que descargan.

Un candado de archivo (`flock`) y no un PID: el sistema lo suelta solo si el proceso muere, incluso por un apagado,
y lo ven también los comandos lanzados a mano, que el `pgrep` de la tarea semanal no alcanzaba a ver.
"""

import fcntl
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from .config import DATA_DIR

LOCK_FILE = DATA_DIR / "scraper.lock"


class DownloadInProgress(RuntimeError):
    """Otra descarga (otra terminal o la tarea semanal) tiene el candado."""


@contextmanager
def download_lock(path: Path | None = None) -> Iterator[None]:
    path = path or LOCK_FILE
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise DownloadInProgress(
                "Ya hay una descarga en curso contra rappi.cl (otra terminal o la tarea semanal): "
                "espera a que termine."
            ) from None
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)
