import logging
import subprocess
import sys

import pytest
from fastapi.testclient import TestClient

from rappi_ia.api import app as api
from rappi_ia.api import services
from rappi_ia.db import database_url


def test_startup_loads_services_before_first_request(monkeypatch, caplog):
    """uvicorn solo anuncia «startup complete» con los modelos cargados: la primera petición no paga la carga."""
    monkeypatch.setenv("RAPPI_IA_LIGHT", "1")
    services._load_services.cache_clear()
    try:
        with caplog.at_level(logging.INFO, logger="uvicorn.error"), TestClient(api.app):
            assert services._load_services.cache_info().currsize == 1
        assert "Servicios cargados en" in caplog.text  # en la salida de uvicorn, no en un logger sin handler
    finally:
        services._load_services.cache_clear()


@pytest.mark.parametrize("module", ["rappi_ia.api.deps", "rappi_ia.api.catalog", "rappi_ia.api.app"])
def test_each_api_module_imports_on_its_own(module):
    """El router del catálogo y la app se importan en cualquier orden: `api.catalog` se importaba solo después de
    `api.app` (una importación circular), y el próximo router habría repetido el truco."""
    result = subprocess.run([sys.executable, "-c", f"import {module}"], capture_output=True, text=True, check=False)

    assert result.returncode == 0, result.stderr


def test_api_connections_fail_fast(monkeypatch):
    """Postgres caído o una consulta atascada no dejan a la API (ni al presentador) esperando minutos."""
    try:
        url = database_url("DATABASE_URL_TEST")
    except RuntimeError:
        pytest.skip("DATABASE_URL_TEST no configurada")
    monkeypatch.setenv("DATABASE_URL", url)

    connections = api.get_conn()
    conn = next(connections)
    try:
        assert conn.execute("SHOW statement_timeout").fetchone()[0] == "20s"
        assert "connect_timeout=3" in conn.info.dsn
    finally:
        connections.close()


class _FakeModel:
    model_name = "falso"


def _not_cached():
    # Lo que lanza huggingface_hub (LocalEntryNotFoundError, un FileNotFoundError) con HF_HUB_OFFLINE=1
    raise FileNotFoundError("Cannot find an appropriate cached snapshot folder: outgoing traffic has been disabled")


def test_a_text_model_missing_from_the_cache_does_not_stop_the_api(monkeypatch):
    """`make serve` pone HF_HUB_OFFLINE=1 mirando el modelo por defecto: con otro TEXT_EMBEDDING_MODEL en .env que
    no está en caché, la API arranca sin búsqueda semántica y /health lo informa."""
    monkeypatch.delenv("RAPPI_IA_LIGHT", raising=False)
    monkeypatch.setattr("rappi_ia.embeddings.models.text_embedder", _not_cached)
    services._load_services.cache_clear()
    try:
        loaded = services._load_services()
    finally:
        services._load_services.cache_clear()

    assert "outgoing traffic has been disabled" in loaded.missing["ml"]
    assert loaded.embedder is None


def test_services_load_without_image_or_audio_models(monkeypatch):
    """Solo se carga el modelo de texto: sin CLIP, sin Whisper y sin Pillow la API arranca completa."""
    monkeypatch.delenv("RAPPI_IA_LIGHT", raising=False)
    monkeypatch.setattr("rappi_ia.embeddings.models.text_embedder", _FakeModel)
    for module in ("faster_whisper", "PIL", "av"):
        monkeypatch.setitem(sys.modules, module, None)  # importarlos fallaría
    services._load_services.cache_clear()
    try:
        loaded = services._load_services()
    finally:
        services._load_services.cache_clear()

    assert loaded.missing == {}
    assert loaded.embedder is not None
    assert set(loaded.capabilities) == {"busqueda_semantica", "redaccion", "faltantes"}
    assert not hasattr(loaded, "transcriber") and not hasattr(loaded, "photo_reader")
