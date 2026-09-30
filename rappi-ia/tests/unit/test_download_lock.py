from argparse import Namespace

import pytest
from rappi_scraper import lock
from rappi_scraper.lock import download_lock

from rappi_ia import cli


def test_embed_images_waits_for_the_scraper(tmp_path, monkeypatch):
    """`make images` son miles de descargas del CDN de Rappi: nunca junto a una descarga del scraper."""
    monkeypatch.setattr(lock, "LOCK_FILE", tmp_path / "scraper.lock")
    args = Namespace(limit=None, vertical=None, forzar=False)
    with download_lock(), pytest.raises(SystemExit):
        cli.cmd_embed_images(None, args)  # se niega antes de tocar la base o cargar CLIP
