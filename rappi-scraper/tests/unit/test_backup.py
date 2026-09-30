import os
import subprocess

import pytest

from rappi_scraper.storage import backup


def _touch(path, mtime):
    path.write_bytes(b"x")
    os.utime(path, (mtime, mtime))


def test_rotate_backups_keeps_newest(tmp_path):
    for i in range(6):
        _touch(tmp_path / f"rappi_2026090{i}.dump", mtime=1_000 + i)
    (tmp_path / "otro.txt").write_text("no se toca")

    removed = backup.rotate_backups(tmp_path, keep=4)

    assert sorted(p.name for p in removed) == ["rappi_20260900.dump", "rappi_20260901.dump"]
    assert sorted(p.name for p in tmp_path.glob("rappi_*.dump")) == [f"rappi_2026090{i}.dump" for i in range(2, 6)]
    assert (tmp_path / "otro.txt").exists()


def test_find_pg_dump_prefers_env(monkeypatch, tmp_path):
    fake = tmp_path / "pg_dump"
    fake.write_text("")
    monkeypatch.setenv("PG_DUMP", str(fake))
    assert backup.find_pg_dump() == str(fake)


def test_find_pg_dump_errors_when_missing(monkeypatch):
    monkeypatch.delenv("PG_DUMP", raising=False)
    monkeypatch.setattr(backup.shutil, "which", lambda _name: None)
    monkeypatch.setattr(backup, "_PG_DUMP_CANDIDATES", ("/no/existe/pg_dump",))
    with pytest.raises(RuntimeError):
        backup.find_pg_dump()


def _fake_tools(monkeypatch, dump_fails=False, list_fails=False):
    """pg_dump escribe el archivo (a medias si falla); pg_restore --list lo valida."""
    calls = []

    def fake_run(cmd, check, **kwargs):
        calls.append(cmd)
        if cmd[0].endswith("pg_dump"):
            target = next(a for a in cmd if a.startswith("--file=")).removeprefix("--file=")
            with open(target, "wb") as f:
                f.write(b"PGDMP a medias")
            if dump_fails:
                raise subprocess.CalledProcessError(1, cmd)
        elif list_fails:
            raise subprocess.CalledProcessError(1, cmd)

    monkeypatch.setattr(backup, "find_pg_dump", lambda: "/bin/pg_dump")
    monkeypatch.setattr(backup.subprocess, "run", fake_run)
    return calls


def test_backup_database_runs_pg_dump_and_rotates(monkeypatch, tmp_path):
    calls = _fake_tools(monkeypatch)

    path = backup.backup_database("postgresql:///rappi", backups_dir=tmp_path, keep=4)

    assert path.exists() and path.name.startswith("rappi_") and path.suffix == ".dump"
    assert calls[0][:3] == ["/bin/pg_dump", "--format=custom", "--no-owner"]
    assert "--dbname=postgresql:///rappi" in calls[0]
    assert calls[1][:2] == ["/bin/pg_restore", "--list"]  # se valida antes de darlo por bueno
    assert list(tmp_path.glob("*.part")) == []


@pytest.mark.parametrize("failure", ["dump_fails", "list_fails"])
def test_a_broken_dump_never_replaces_a_good_one(monkeypatch, tmp_path, failure):
    """Un pg_dump cortado (disco lleno, corte de luz) o ilegible no cuenta como respaldo ni expulsa uno sano."""
    for i in range(4):
        _touch(tmp_path / f"rappi_2026090{i}.dump", mtime=1_000 + i)
    _fake_tools(monkeypatch, **{failure: True})

    with pytest.raises(subprocess.CalledProcessError):
        backup.backup_database("postgresql:///rappi", backups_dir=tmp_path, keep=4)

    assert sorted(p.name for p in tmp_path.iterdir()) == [f"rappi_2026090{i}.dump" for i in range(4)]
