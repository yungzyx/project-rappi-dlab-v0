"""Contrato API-app: las respuestas reales de la API sobre el catálogo de prueba son los ejemplos que usa la app.

Cada `Example` de `CONTRACT` se pide con servicios livianos (embeddings falsos y redacción por plantilla) sobre el
catálogo de `seed_demo`; su estado y su cuerpo se comparan con `prototipo-app/src/api/fixtures/<nombre>.json`. Los
tests de la app leen esos mismos archivos: si la API cambia una respuesta, este test falla en el CI hasta que se corra
`make contract`, y el cambio queda a la vista en el diff de la app. Un archivo sin su `Example` también falla.
"""

import json
import os
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from rappi_ia.agent.compose import TemplateComposer
from rappi_ia.agent.rappi_agent import RappiAgent
from rappi_ia.api import app as api
from rappi_ia.api.services import Services
from rappi_ia.demo.seed import seed_demo
from rappi_ia.embeddings.base import HashEmbedder

FIXTURES = Path(__file__).resolve().parents[3] / "prototipo-app" / "src" / "api" / "fixtures"


@dataclass(frozen=True)
class Example:
    """Una petición a la API cuya respuesta es el ejemplo `<name>.json` que usa la app.

    Con `status=204` no hay cuerpo que guardar: el ejemplo es solo el estado. Cada test parte de una base nueva: un
    ejemplo que lee lo que otro guardó nombra a ese otro en `after`, y el test lo pide antes.
    """

    name: str
    method: str
    path: str  # con su query string, si la tiene
    body: dict | None = None
    status: int = 200
    after: str | None = None  # el Example que se pide antes: cada test parte de una base nueva


# Las etapas siguientes agregan aquí los endpoints que la app consume.
CONTRACT: tuple[Example, ...] = (
    Example("health", "GET", "/health"),
    Example("catalog-vertical-stores", "GET", "/catalog/verticals/supermercado/stores"),
    Example("catalog-store", "GET", "/catalog/stores/9101"),
    Example("catalog-store-page-2", "GET", "/catalog/stores/9101?page=2"),
    Example("catalog-product", "GET", "/catalog/products/catalog_item/91001"),
    Example("catalog-restaurants", "GET", "/catalog/restaurants"),
    Example("catalog-menu", "GET", "/catalog/restaurants/9801/menu"),
    Example("catalog-deals", "GET", "/catalog/deals"),
    Example("catalog-home", "GET", "/catalog/home"),
    Example("search-grouped", "GET", "/search?q=cerveza"),
    Example("search-grouped-unmet", "GET", "/search?q=xyzzy"),
    Example(
        "agent-ask",
        "POST",
        "/agent/ask",
        {"message": "pizza", "vertical": "restaurants", "user_id": "u-contrato", "session_id": "s-contrato"},
    ),
    Example("recommendations", "GET", "/recommendations?user_id=u-contrato&vertical=restaurants"),
    Example("agent-plans", "GET", "/agent/plans"),
    Example("agent-offer-plan", "POST", "/agent/offer", {"moment": "plan", "context": {"occasion": "carrete"}}),
    Example(
        "agent-offer-carrito",
        "POST",
        "/agent/offer",
        {"moment": "carrito", "context": {"product": {"entity_type": "catalog_item", "entity_id": "94001"}}},
    ),
    Example(
        "agent-offer-carrito-nada",
        "POST",
        "/agent/offer",
        {"moment": "carrito", "context": {"product": {"entity_type": "catalog_item", "entity_id": "91007"}}},
        status=204,
    ),
    Example(
        "agent-offer-checkout",
        "POST",
        "/agent/offer",
        {
            "moment": "checkout",
            "context": {
                "cart": [
                    {"entity_type": "catalog_item", "entity_id": "94005"},
                    {"entity_type": "catalog_item", "entity_id": "91003"},
                ]
            },
        },
    ),
    Example(
        "agent-offer-sin-resultado",
        "POST",
        "/agent/offer",
        {"moment": "sin_resultado", "context": {"query": "pizza hawaiana"}},
    ),
    Example(
        "agent-offer-proximo-pedido",
        "POST",
        "/agent/offer",
        {"moment": "proximo_pedido", "context": {"items": [{"entity_type": "menu_item", "entity_id": "98001"}]}},
    ),
    Example(
        "agent-offer-vertical-por-probar",
        "POST",
        "/agent/offer",
        {"moment": "vertical_por_probar", "context": {"stamped": ["supermercado"]}},
    ),
    Example("game-cards", "GET", "/game/cards?vertical=supermercado"),
    Example(
        "game-state-put",
        "PUT",
        "/game/state/u-contrato",
        {
            "state": {
                "version": 1,
                "xp": 10,
                "discovered": {"supermercado": ["supermercado-01"]},
                "correct": {},
                "answered": {},
                "cards": ["supermercado-01"],
                "opened": [],
                "daily": {"date": "2026-10-10", "discovered": 1, "correct": 0, "opened": 0, "done": False},
                "streak": {"count": 0, "lastDate": None},
                "seenIntro": True,
                "visited": ["supermercado"],
            }
        },
    ),
    Example("game-state", "GET", "/game/state/u-contrato", after="game-state-put"),
)


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
    api.app.dependency_overrides[api.get_services] = lambda: Services(
        RappiAgent(embedder, TemplateComposer()), embedder
    )
    test_client = TestClient(api.app)
    # Un perfil con un interés (pizza) para que /recommendations tenga filas que mostrar.
    interest = {
        "type": "search",
        "session_id": "s-contrato",
        "vertical": "restaurants",
        "concept_id": "pizza",
        "query": "pizza",
    }
    assert test_client.post("/events", json={"user_id": "u-contrato", "events": [interest]}).status_code == 200
    yield test_client
    api.app.dependency_overrides.clear()


def render(body: dict) -> str:
    return json.dumps(body, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def check_example(example: Example, reply, directory: Path, *, write: bool) -> None:
    """Compara el estado y el cuerpo de `reply` con el ejemplo de `directory`; con `write`, reescribe el cuerpo."""
    assert reply.status_code == example.status, reply.text
    if example.status == 204:
        return
    rendered = render(reply.json())
    file = directory / f"{example.name}.json"

    if write:
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(rendered, encoding="utf-8")
        return

    current = file.read_text(encoding="utf-8") if file.exists() else None
    if current != rendered:
        pytest.fail(
            f"La respuesta de {example.path} cambió: corre `make contract` en rappi-ia y revisa el cambio en la app"
        )


def fixtures_without_example(directory: Path) -> list[str]:
    """Los ejemplos de `directory` que ningún `Example` de `CONTRACT` escribe ni compara."""
    names = {example.name for example in CONTRACT}
    return sorted(file.stem for file in directory.glob("*.json") if file.stem not in names)


def response(status: int, body: dict | None = None) -> SimpleNamespace:
    """Una respuesta ya hecha, para probar la comparación sin pedir nada a la API."""
    return SimpleNamespace(status_code=status, text=json.dumps(body), json=lambda: body)


@pytest.mark.parametrize("example", CONTRACT, ids=lambda example: example.name)
def test_contract_examples_are_up_to_date(client, example):
    if example.after:
        before = next(e for e in CONTRACT if e.name == example.after)
        assert client.request(before.method, before.path, json=before.body).status_code == before.status
    reply = client.request(example.method, example.path, json=example.body)
    check_example(example, reply, FIXTURES, write=os.environ.get("RAPPI_CONTRACT_WRITE") == "1")


def test_a_changed_body_fails_pointing_to_make_contract(tmp_path):
    (tmp_path / "ruta.json").write_text(render({"a": 1}), encoding="utf-8")
    example = Example("ruta", "GET", "/ruta")

    check_example(example, response(200, {"a": 1}), tmp_path, write=False)
    with pytest.raises(pytest.fail.Exception, match="La respuesta de /ruta cambió: corre `make contract`"):
        check_example(example, response(200, {"a": 2}), tmp_path, write=False)


def test_a_different_status_fails_even_when_writing(tmp_path):
    example = Example("ruta", "GET", "/ruta")

    with pytest.raises(AssertionError):
        check_example(example, response(500, {"detail": "error"}), tmp_path, write=True)
    assert list(tmp_path.iterdir()) == []


def test_a_204_example_is_only_the_status_and_writes_no_file(tmp_path):
    example = Example("aviso", "POST", "/aviso", body={"x": 1}, status=204)

    check_example(example, response(204), tmp_path, write=True)
    check_example(example, response(204), tmp_path, write=False)
    assert list(tmp_path.iterdir()) == []
    with pytest.raises(AssertionError):
        check_example(example, response(200, {}), tmp_path, write=False)


def test_every_fixture_has_an_example():
    assert fixtures_without_example(FIXTURES) == [], "Hay respuestas de ejemplo sin su Example en CONTRACT: bórralas"


def test_an_orphan_fixture_is_reported(tmp_path):
    for example in CONTRACT:
        (tmp_path / f"{example.name}.json").write_text("{}\n", encoding="utf-8")
    assert fixtures_without_example(tmp_path) == []

    (tmp_path / "orphan.json").write_text("{}\n", encoding="utf-8")

    assert fixtures_without_example(tmp_path) == ["orphan"]


def test_health_example_counts_every_seeded_document(client, db):
    body = client.get("/health").json()

    seeded = db.execute("SELECT count(*) FROM search_documents").fetchone()[0]
    assert body["ok"] is True
    assert seeded > 0
    assert body["documentos"] == seeded
