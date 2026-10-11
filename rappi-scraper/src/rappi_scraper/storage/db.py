"""Conexión a Postgres y runner de migraciones (`storage/migrations/*.sql`, en orden)."""

import logging
import os
from pathlib import Path

import psycopg

from .. import config  # noqa: F401  (carga .env antes de leer DATABASE_URL)

log = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


class PendingMigrations(RuntimeError):
    """La base no tiene todas las migraciones del repositorio (p. ej. tras un `git pull`)."""


def database_url(env_var: str = "DATABASE_URL") -> str:
    url = os.environ.get(env_var)
    if not url:
        raise RuntimeError(f"Falta {env_var} (ver .env.example)")
    return url


def connect(url: str | None = None) -> psycopg.Connection:
    """Con timeout al conectar y keepalives: la conexión del scraper vive días, y sin ellos una caída de red o un NAT
    que la olvida la dejaba colgada en vez de fallar."""
    return psycopg.connect(url or database_url(), connect_timeout=10, keepalives=1, keepalives_idle=60)


def migrate(conn: psycopg.Connection) -> list[str]:
    """Aplica las migraciones pendientes. Devuelve los nombres aplicados."""
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations "
        "(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
    )
    applied = {row[0] for row in conn.execute("SELECT name FROM schema_migrations")}
    newly_applied = []
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        if path.name in applied:
            continue
        with conn.transaction():
            conn.execute(path.read_text(encoding="utf-8"))
            conn.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (path.name,))
        log.info("Migración aplicada: %s", path.name)
        newly_applied.append(path.name)
    conn.commit()
    return newly_applied


def check_migrations(conn: psycopg.Connection) -> None:
    """Falla si la base no tiene todas las migraciones del repositorio: el código puede depender de ellas (la vista de
    vigencia de la 019) y `refresh` descargaba todo antes de caerse al armar la búsqueda."""
    applied = set()
    if conn.execute("SELECT to_regclass('schema_migrations')").fetchone()[0] is not None:
        applied = {row[0] for row in conn.execute("SELECT name FROM schema_migrations")}
    pending = [path.name for path in sorted(MIGRATIONS_DIR.glob("*.sql")) if path.name not in applied]
    if pending:
        raise PendingMigrations(f"Hay migraciones pendientes ({', '.join(pending)}): corre `rappi migrate` antes.")
