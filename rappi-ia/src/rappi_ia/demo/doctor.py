"""Chequeo de la base antes de levantar el MVP (`rappi-ia doctor`): solo lee, nunca escribe."""

import psycopg

from ..db import connect


def check_database(url: str) -> tuple[bool, str]:
    """Devuelve si la base está lista y un mensaje en español que dice qué falta o qué hay."""
    try:
        conn = connect(url, connect_timeout=3)
    except psycopg.Error as exc:
        reason = (str(exc).strip().splitlines() or [type(exc).__name__])[0]
        return False, (
            f"No puedo conectar con Postgres ({reason}). Revisa que esté corriendo y que DATABASE_URL apunte "
            "a la base rappi (ver docs/instalacion.md)."
        )
    with conn:
        conn.read_only = True
        try:
            rows = conn.execute("SELECT vertical, count(*) FROM search_documents GROUP BY vertical").fetchall()
        except psycopg.errors.UndefinedTable:
            return False, (
                "La base no tiene catálogo: faltan las tablas. Corre `rappi-ia migrate` y carga el catálogo "
                "(ver docs/instalacion.md, sección 3)."
            )
    if not rows:
        return False, (
            "La base no tiene catálogo: no hay documentos de búsqueda. Restaura un respaldo o descarga el "
            "catálogo y arma la búsqueda (ver docs/instalacion.md, sección 3)."
        )
    documents = sum(count for _, count in rows)
    return True, f"Base lista: {documents} documentos en {len(rows)} verticales"
