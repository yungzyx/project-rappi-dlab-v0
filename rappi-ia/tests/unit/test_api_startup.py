import logging

from fastapi.testclient import TestClient

from rappi_ia.api import app as api
from rappi_ia.api import services


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
