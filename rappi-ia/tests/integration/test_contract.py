"""Contrato API-app: las respuestas reales de la API sobre el catálogo de prueba son los ejemplos que usa la app.

Cada ruta de `CONTRACT` se pide con servicios livianos (embeddings falsos y redacción por plantilla) sobre el catálogo
de `seed_demo` y se compara con `prototipo-app/src/api/fixtures/<nombre>.json`. Los tests de la app leen esos mismos
archivos: si la API cambia una respuesta, este test falla en el CI hasta que se corra `make contract`, y el cambio
queda a la vista en el diff de la app.
"""

import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from rappi_ia.agent.bigotes import Bigotes
from rappi_ia.agent.compose import TemplateComposer
from rappi_ia.api import app as api
from rappi_ia.api.services import Services
from rappi_ia.demo.seed import seed_demo
from rappi_ia.embeddings.base import HashEmbedder

FIXTURES = Path(__file__).resolve().parents[3] / "prototipo-app" / "src" / "api" / "fixtures"

# nombre del ejemplo → (método, ruta). Las etapas siguientes agregan aquí los endpoints que la app consume.
CONTRACT: dict[str, tuple[str, str]] = {
    "health": ("GET", "/health"),
}


@pytest.fixture
def client(db):
    seed_demo(db)
    # /health estima los documentos con las estadísticas de Postgres: si el autovacuum analizara solo algunas
    # particiones, la cifra saldría parcial. Con pocas filas ANALYZE las lee todas y la estimación es exacta.
    db.execute("ANALYZE search_documents")
    db.commit()
    embedder = HashEmbedder()

    def conn_override():
        yield db

    api.app.dependency_overrides[api.get_conn] = conn_override
    api.app.dependency_overrides[api.get_services] = lambda: Services(Bigotes(embedder, TemplateComposer()), embedder)
    yield TestClient(api.app)
    api.app.dependency_overrides.clear()


def render(body: dict) -> str:
    return json.dumps(body, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


@pytest.mark.parametrize("name", CONTRACT)
def test_contract_examples_are_up_to_date(client, name):
    method, path = CONTRACT[name]
    response = client.request(method, path)
    assert response.status_code == 200, response.text
    rendered = render(response.json())
    example = FIXTURES / f"{name}.json"

    if os.environ.get("RAPPI_CONTRACT_WRITE") == "1":
        example.parent.mkdir(parents=True, exist_ok=True)
        example.write_text(rendered, encoding="utf-8")
        return

    current = example.read_text(encoding="utf-8") if example.exists() else None
    if current != rendered:
        pytest.fail(f"La respuesta de {path} cambió: corre `make contract` en rappi-ia y revisa el cambio en la app")


def test_health_example_counts_every_seeded_document(client, db):
    body = client.get("/health").json()

    seeded = db.execute("SELECT count(*) FROM search_documents").fetchone()[0]
    assert body["ok"] is True
    assert seeded > 0
    assert body["documentos"] == seeded
