"""Conexión a Postgres. El esquema y sus migraciones son de rappi-scraper (un solo historial para toda la base).

`migrate` toma un candado de Postgres: dos a la vez se ponen en fila. En producción (API_ENV=production) solo migra
`rappi-ia deploy-migrate`, que respalda antes; ni la API ni `make serve` migran al arrancar."""

import os

import psycopg
from psycopg import sql
from rappi_scraper.storage.db import changed_migrations, migrate

from . import config  # carga .env antes de leer DATABASE_URL

__all__ = ["changed_migrations", "connect", "database_url", "migrate", "set_index_build_memory"]


def database_url(env_var: str = "DATABASE_URL") -> str:
    url = os.environ.get(env_var)
    if not url:
        raise RuntimeError(f"Falta {env_var} (ver .env.example)")
    return url


def connect(url: str | None = None, **options) -> psycopg.Connection:
    """`options` van a psycopg.connect (p. ej. `connect_timeout`)."""
    return psycopg.connect(url or database_url(), **options)


def set_index_build_memory(conn: psycopg.Connection) -> None:
    """Memoria para construir un índice HNSW, solo en la transacción en curso (SET LOCAL: al terminarla vuelve sola
    al valor normal). Va justo antes del CREATE INDEX, sin commit entre medio."""
    memory = sql.Literal(config.HNSW_MAINTENANCE_WORK_MEM)
    conn.execute(sql.SQL("SET LOCAL maintenance_work_mem = {}").format(memory))
