"""`migrate` con candado y checksum: dos a la vez no chocan, un DDL que espera una fila tomada falla rápido y una
migración editada después de aplicarse se nota."""

import logging
import threading
import time

import psycopg
import pytest

from rappi_scraper.storage import db as db_module
from rappi_scraper.storage.db import MIGRATIONS_DIR, check_migrations, connect, database_url, migrate


@pytest.fixture
def empty(db):
    """`rappi_test` sin nada: ni tablas ni `schema_migrations`."""
    db.execute("DROP SCHEMA IF EXISTS capa CASCADE")
    db.execute("DROP SCHEMA public CASCADE")
    db.execute("CREATE SCHEMA public")
    db.commit()
    return db


@pytest.fixture
def extra_migration(tmp_path, monkeypatch):
    """Las migraciones del repositorio más una nueva (`999_prueba.sql`) con el SQL que se le pase."""

    def add(text: str) -> str:
        for path in MIGRATIONS_DIR.glob("*.sql"):
            (tmp_path / path.name).symlink_to(path)
        (tmp_path / "999_prueba.sql").write_text(text, encoding="utf-8")
        monkeypatch.setattr(db_module, "MIGRATIONS_DIR", tmp_path)
        return "999_prueba.sql"

    return add


def test_concurrent_migrate_applies_each_file_once(empty):
    url = database_url("DATABASE_URL_TEST")
    start = threading.Barrier(2)
    results, errors = [], []

    def run():
        try:
            with connect(url) as conn:
                start.wait()
                results.append(migrate(conn))
        except Exception as exc:  # el test quiere ver cualquier error de los hilos
            errors.append(exc)

    threads = [threading.Thread(target=run) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=120)

    files = sorted(path.name for path in MIGRATIONS_DIR.glob("*.sql"))
    assert errors == []
    assert sorted(results, key=len) == [[], files]  # uno aplica todo; el otro espera y no encuentra nada pendiente
    rows = empty.execute("SELECT name, checksum FROM schema_migrations ORDER BY name").fetchall()
    assert [name for name, _ in rows] == files
    assert all(checksum for _, checksum in rows)


def test_migration_behind_row_lock_fails_fast(db, extra_migration, monkeypatch):
    name = extra_migration("ALTER TABLE menu_items ADD COLUMN prueba int;")
    monkeypatch.setattr(db_module.config, "MIGRATE_LOCK_TIMEOUT", "300ms")
    with connect(database_url("DATABASE_URL_TEST")) as other:
        other.execute("LOCK TABLE menu_items IN ROW EXCLUSIVE MODE")  # lo que toma un UPDATE abierto
        started = time.monotonic()
        with pytest.raises(psycopg.errors.LockNotAvailable):
            migrate(db)
        elapsed = time.monotonic() - started
        other.rollback()

    assert elapsed < 5
    assert db.execute("SELECT count(*) FROM schema_migrations WHERE name = %s", (name,)).fetchone()[0] == 0
    assert db.execute("SHOW lock_timeout").fetchone()[0] == "0"  # devuelve la sesión como la recibió
    assert migrate(db) == [name]  # soltó el candado: con la fila libre, la siguiente pasada la aplica


def test_checksum_mismatch_warns(db, caplog):
    first = sorted(MIGRATIONS_DIR.glob("*.sql"))[0].name
    db.execute("UPDATE schema_migrations SET checksum = NULL WHERE name <> %s", (first,))
    db.execute("UPDATE schema_migrations SET checksum = 'otro' WHERE name = %s", (first,))
    db.commit()

    with caplog.at_level(logging.WARNING):
        migrate(db)  # completa las filas viejas sin checksum, sin aviso
        assert caplog.records == []
        check_migrations(db)

    assert [r.getMessage() for r in caplog.records] == [f"La migración {first} cambió después de aplicarse"]
    missing = db.execute("SELECT count(*) FROM schema_migrations WHERE checksum IS NULL").fetchone()[0]
    assert missing == 0
