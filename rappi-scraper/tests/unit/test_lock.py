import pytest

from rappi_scraper import cli, lock
from rappi_scraper.lock import DownloadInProgress, download_lock


def test_only_one_download_at_a_time(tmp_path):
    path = tmp_path / "scraper.lock"
    with download_lock(path), pytest.raises(DownloadInProgress), download_lock(path):
        pass
    with download_lock(path):  # al terminar, el candado queda libre
        pass


def test_download_commands_refuse_to_start_while_another_download_runs(tmp_path, monkeypatch):
    """Un scrape-stores a mano no se cruza con la tarea del domingo (el pgrep del script no lo veía)."""
    monkeypatch.setattr(lock, "LOCK_FILE", tmp_path / "scraper.lock")
    with download_lock(), pytest.raises(SystemExit, match="Ya hay una descarga en curso"):
        cli.main(["scrape-stores"])
