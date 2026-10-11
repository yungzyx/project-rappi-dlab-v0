"""`rappi-ia deploy-migrate`: en un despliegue, migrar es un paso aparte que respalda antes (si hay algo que aplicar),
carga las tarjetas del juego y, con `DB_API_ROLE`, da los permisos del rol de la API. En producción, ni la API ni los
objetivos de servidor migran al arrancar."""

import os
import subprocess

import pytest
from rappi_scraper.storage import db as scraper_db

from rappi_ia import cli
from rappi_ia.concepts.pipeline import build_concepts
from rappi_ia.config import PROJECT_ROOT
from rappi_ia.demo import doctor

PROBE = "999_prueba.sql"


@pytest.fixture
def ready(db):
    """Base migrada con conceptos (las tarjetas del juego se ligan a ellos), como una base restaurada de un respaldo."""
    build_concepts(db)
    db.commit()
    return db


@pytest.fixture
def add_pending(tmp_path, monkeypatch):
    """Suma a las migraciones del repositorio una nueva sin aplicar, que crea la tabla `deploy_probe`."""
    monkeypatch.delenv("DB_API_ROLE", raising=False)

    def add() -> None:
        folder = tmp_path / "migrations"
        folder.mkdir()
        for path in scraper_db.MIGRATIONS_DIR.glob("*.sql"):
            (folder / path.name).symlink_to(path)
        (folder / PROBE).write_text("CREATE TABLE deploy_probe (id int);", encoding="utf-8")
        monkeypatch.setattr(scraper_db, "MIGRATIONS_DIR", folder)
        monkeypatch.setattr(doctor, "MIGRATIONS_DIR", folder)

    return add


@pytest.fixture
def pending(add_pending):
    add_pending()


def _probe_exists(conn) -> bool:
    return conn.execute("SELECT to_regclass('deploy_probe')").fetchone()[0] is not None


def _applied(conn, name: str) -> bool:
    return conn.execute("SELECT count(*) FROM schema_migrations WHERE name = %s", (name,)).fetchone()[0] == 1


def test_deploy_migrate_backs_up_only_when_pending(ready, add_pending, tmp_path, capsys):
    backups = []

    def backup():
        backups.append(_probe_exists(ready))  # el respaldo va antes de migrar
        return tmp_path / "pre-migracion_prueba.dump"

    cli.deploy_migrate(ready, backup)  # nada pendiente: no respalda
    assert backups == []
    assert "Sin migraciones pendientes" in capsys.readouterr().out

    add_pending()
    cli.deploy_migrate(ready, backup)

    out = capsys.readouterr().out
    assert backups == [False]
    assert _probe_exists(ready) and _applied(ready, PROBE)
    assert "pre-migracion_prueba.dump" in out
    assert PROBE in out
    assert "Tarjetas del juego: 108" in out
    assert ready.execute("SELECT count(*) FROM knowledge_cards").fetchone()[0] == 108


def test_without_backup_flag_migrates_without_backing_up(ready, pending, capsys):
    cli.deploy_migrate(ready, None)

    assert _applied(ready, PROBE)
    assert "sin respaldo" in capsys.readouterr().out


def test_failed_backup_blocks_migration(ready, pending, capsys):
    def backup():
        raise RuntimeError("pg_dump falló con código 1")

    with pytest.raises(SystemExit) as stopped:
        cli.deploy_migrate(ready, backup)

    assert stopped.value.code not in (0, None)
    assert "No se pudo respaldar la base (pg_dump falló con código 1): no migro." in str(stopped.value.code)
    assert not _probe_exists(ready) and not _applied(ready, PROBE)


def test_api_role_applies_the_grants_file(ready, pending, tmp_path, monkeypatch, capsys):
    me = ready.execute("SELECT current_user").fetchone()[0]
    grants = tmp_path / "grants.sql"
    grants.write_text("CREATE TABLE grants_probe (); GRANT SELECT ON grants_probe TO {api_role};", encoding="utf-8")
    monkeypatch.setenv("DB_API_ROLE", me)

    cli.deploy_migrate(ready, None, grants_file=grants)

    acl = ready.execute("SELECT relacl::text FROM pg_class WHERE relname = 'grants_probe'").fetchone()[0]
    assert acl is not None and me in acl
    assert f"Permisos del rol de la API ({me})" in capsys.readouterr().out


def test_api_role_without_grants_file_stops_before_migrating(ready, pending, tmp_path, monkeypatch):
    monkeypatch.setenv("DB_API_ROLE", "rappi_api")
    missing = tmp_path / "no-existe.sql"

    with pytest.raises(SystemExit) as stopped:
        cli.deploy_migrate(ready, lambda: pytest.fail("no respalda si no va a poder terminar"), grants_file=missing)

    assert "DB_API_ROLE" in str(stopped.value.code) and str(missing) in str(stopped.value.code)
    assert not _applied(ready, PROBE)


def _dry_run(target: str, **env) -> str:
    environment = {k: v for k, v in os.environ.items() if k != "API_ENV"} | env
    return subprocess.run(
        ["make", "-n", "-C", str(PROJECT_ROOT), target], capture_output=True, text=True, check=True, env=environment
    ).stdout


@pytest.mark.parametrize("target", ["serve", "serve-lan"])
def test_production_start_does_not_migrate(target, tmp_path):
    production = _dry_run(target, API_ENV="production")
    assert "uvicorn" in production
    for step in ("check-migrations", "rappi_ia migrate", "rappi_ia knowledge"):
        assert step not in production

    dotenv = tmp_path / ".env"
    dotenv.write_text('API_ENV="production"\n', encoding="utf-8")
    assert "rappi_ia migrate" not in _dry_run(target, DOTENV=str(dotenv))  # también si va en .env

    local = _dry_run(target, API_ENV="local", DOTENV=str(tmp_path / "sin-env"))  # en local siguen migrando
    assert local.index("rappi_ia check-migrations") < local.index("rappi_ia migrate") < local.index("uvicorn")
