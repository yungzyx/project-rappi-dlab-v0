"""Linaje de las capas derivadas: cada corrida de `rappi-ia attributes|measures|…` queda en `layer_runs`."""

import hashlib
from pathlib import Path

from psycopg import Connection
from psycopg.types.json import Jsonb


def start_layer_run(conn: Connection, layer: str, rules_version: str) -> int:
    row = conn.execute(
        "INSERT INTO layer_runs (layer, rules_version) VALUES (%s, %s) RETURNING run_id", (layer, rules_version)
    ).fetchone()
    return row[0]


def finish_layer_run(conn: Connection, run_id: int, counts: dict, status: str = "done") -> None:
    conn.execute(
        "UPDATE layer_runs SET status = %s, counts = %s, finished_at = clock_timestamp() WHERE run_id = %s",
        (status, Jsonb(counts), run_id),
    )


def rules_version(version: str, *files: Path) -> str:
    """`version` más una huella del contenido de las reglas (TOML y código): dos corridas con la misma huella usaron
    exactamente las mismas reglas, aunque alguien olvide subir la fecha."""
    digest = hashlib.sha256()
    for path in files:
        digest.update(Path(path).read_bytes())
    return f"{version}+{digest.hexdigest()[:8]}"
