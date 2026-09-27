"""Conexión a Postgres. El esquema y sus migraciones son de rappi-scraper (un solo historial para toda la base)."""

import os

import psycopg
from rappi_scraper.storage.db import migrate

from . import config  # noqa: F401  (carga .env antes de leer DATABASE_URL)

__all__ = ["connect", "database_url", "migrate"]


def database_url(env_var: str = "DATABASE_URL") -> str:
    url = os.environ.get(env_var)
    if not url:
        raise RuntimeError(f"Falta {env_var} (ver .env.example)")
    return url


def connect(url: str | None = None) -> psycopg.Connection:
    return psycopg.connect(url or database_url())
