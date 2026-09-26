"""Respaldo de la base con `pg_dump` (formato custom) y rotación de respaldos antiguos."""

import logging
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from ..config import DATA_DIR

log = logging.getLogger(__name__)

BACKUPS_DIR = DATA_DIR / "backups"
KEEP_BACKUPS = 4  # con corridas semanales: el último mes

# postgresql@17 de Homebrew no queda en el PATH (y launchd no carga el PATH del usuario).
_PG_DUMP_CANDIDATES = (
    "/opt/homebrew/opt/postgresql@17/bin/pg_dump",  # Apple Silicon
    "/usr/local/opt/postgresql@17/bin/pg_dump",  # Intel
)


def find_pg_dump() -> str:
    for candidate in (os.environ.get("PG_DUMP"), shutil.which("pg_dump"), *_PG_DUMP_CANDIDATES):
        if candidate and Path(candidate).exists():
            return candidate
    raise RuntimeError("No se encontró pg_dump (instala postgresql@17 o define PG_DUMP en .env)")


def rotate_backups(backups_dir: Path, keep: int) -> list[Path]:
    """Borra los respaldos `rappi_*.dump` más antiguos, dejando los `keep` más nuevos. Devuelve los borrados."""
    dumps = sorted(backups_dir.glob("rappi_*.dump"), key=lambda p: p.stat().st_mtime, reverse=True)
    removed = dumps[keep:]
    for path in removed:
        path.unlink()
    return removed


def backup_database(database_url: str, backups_dir: Path = BACKUPS_DIR, keep: int = KEEP_BACKUPS) -> Path:
    backups_dir.mkdir(parents=True, exist_ok=True)
    target = backups_dir / f"rappi_{datetime.now():%Y%m%d-%H%M%S}.dump"
    subprocess.run(
        [find_pg_dump(), "--format=custom", "--no-owner", f"--file={target}", f"--dbname={database_url}"],
        check=True,
    )
    removed = rotate_backups(backups_dir, keep)
    log.info("Respaldo en %s (%d antiguos borrados)", target, len(removed))
    return target
