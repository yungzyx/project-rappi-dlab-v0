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
