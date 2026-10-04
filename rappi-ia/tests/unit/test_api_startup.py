import logging

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

    def embed_texts(self, texts):
        return [[0.0] for _ in texts]


def _not_cached():
    # Lo que lanza huggingface_hub (LocalEntryNotFoundError, un FileNotFoundError) con HF_HUB_OFFLINE=1
    raise FileNotFoundError("Cannot find an appropriate cached snapshot folder: outgoing traffic has been disabled")


@pytest.mark.parametrize(
    ("loader", "capability"),
    [("rappi_ia.agent.audio.transcriber", "audio"), ("rappi_ia.embeddings.models.text_embedder", "ml")],
)
def test_a_model_missing_from_the_cache_does_not_stop_the_api(monkeypatch, loader, capability):
    """`make serve` pone HF_HUB_OFFLINE=1 mirando los modelos por defecto: con otro WHISPER_MODEL o
    TEXT_EMBEDDING_MODEL en .env que no está en caché, la API arranca sin esa capacidad y /health lo informa."""
    monkeypatch.delenv("RAPPI_IA_LIGHT", raising=False)
    monkeypatch.setattr("rappi_ia.embeddings.models.text_embedder", _FakeModel)
    monkeypatch.setattr("rappi_ia.embeddings.models.clip_embedder", _FakeModel)
    monkeypatch.setattr("rappi_ia.agent.audio.transcriber", lambda: "transcriptor")
    monkeypatch.setattr(loader, _not_cached)
    services._load_services.cache_clear()
    try:
        loaded = services._load_services()
    finally:
        services._load_services.cache_clear()

    assert "outgoing traffic has been disabled" in loaded.missing[capability]
    assert (loaded.transcriber is None) == (capability == "audio")
    assert (loaded.embedder is None) == (capability == "ml")
