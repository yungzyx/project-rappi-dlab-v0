"""Contrato API-app: las respuestas reales de la API sobre el catálogo de prueba son los ejemplos que usa la app.

Cada `Example` de `CONTRACT` se pide con servicios livianos (embeddings falsos y redacción por plantilla) sobre el
catálogo de `seed_demo`; su estado y su cuerpo se comparan con `prototipo-app/src/api/fixtures/<nombre>.json`. Los
tests de la app leen esos mismos archivos: si la API cambia una respuesta, este test falla en el CI hasta que se corra
`make contract`, y el cambio queda a la vista en el diff de la app. Un archivo sin su `Example` también falla.

Las métricas del uso del MVP en el panel (`PANEL_METRICS`) siguen la misma regla en `dashboard-empresa/src/fixtures/`:
`prototype` sale de un recorrido por la API y `synthetic` de una simulación chica con semilla fija. Cada archivo lleva
su `guardado` ({origen, fecha}), que el panel muestra cuando usa la respuesta guardada; la fecha es la de la última vez
que se escribió y no cuenta en la comparación. Las demás respuestas del panel (los fixtures de 1.500 usuarios,
`PANEL_SHAPE`) las guarda `npm run fixtures` desde una API en marcha, y aquí solo se revisa su forma: las mismas claves
y tipos que la API sobre el catálogo de prueba.
"""

import json
import os
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest

from owner_client import OwnerClient
from rappi_ia import config
from rappi_ia.agent.compose import TemplateComposer
from rappi_ia.agent.rappi_agent import RappiAgent
from rappi_ia.api import app as api
from rappi_ia.api.services import Services
from rappi_ia.demo.seed import seed_demo
from rappi_ia.embeddings.base import HashEmbedder
from rappi_ia.events.synth import generate

FIXTURES = Path(__file__).resolve().parents[3] / "prototipo-app" / "src" / "api" / "fixtures"
PANEL_FIXTURES = Path(__file__).resolve().parents[3] / "dashboard-empresa" / "src" / "fixtures"
PANEL_METRICS = ("offers", "game", "unmet")
# Las métricas de /analytics que guarda `npm run fixtures` (dashboard-empresa/scripts/update-fixtures.mjs).
PANEL_SHAPE = (
    "kpis",
    "weekly",
    "opportunities",
    "trends",
    "funnel",
    "cohorts",
    "rhythm",
    "at-risk",
    "suggestions",
    "services",
    "multi-vertical",
    "affinity",
    "assortment",
)
PANEL_ORIGINS = {
    "prototype": "make contract · recorrido corto sobre el catálogo de prueba inventado",
    "synthetic": "make contract · simulación chica con semilla fija (40 personas, 8 semanas)",
}


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
    Example(
        "agent-ask-dato",
        "POST",
        "/agent/ask",
        {"message": "pizza", "vertical": "restaurants", "user_id": "u-contrato-dato", "session_id": "s-contrato-dato"},
    ),
    Example("recommendations", "GET", "/recommendations?user_id=u-contrato&vertical=restaurants"),
    Example("agent-plans", "GET", "/agent/plans"),
    Example("agent-plans-afin", "GET", "/agent/plans?user_id=u-afin"),
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
    Example(
        "agent-offer-vertical-por-probar-afin",
        "POST",
        "/agent/offer",
        {"moment": "vertical_por_probar", "user_id": "u-afin", "context": {"stamped": []}},
    ),
    # La escalera de un perfil elegido, sin persona: lo que usa la demo.
    Example("agent-offer-perfil", "POST", "/agent/offer", {"moment": "perfil", "context": {"perfil": "asiatico"}}),
    Example("profile-gustos", "GET", "/profile/u-gustos/gustos"),
    Example("game-cards", "GET", "/game/cards?vertical=supermercado"),
    Example("game-challenge", "GET", "/game/challenge?vertical=supermercado&seed=0"),
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
    # Se reclama el id viejo de un navegador (de antes de la sesión firmada): la respuesta no cambia en cada corrida.
    # El token sale del secreto de los tests (tests/conftest.py), que no sirve fuera de ellos.
    Example("session", "POST", "/session", {"legacy_user_id": "proto-0123456789abcdef"}),
)


GAME_STATE = {
    "version": 1,
    "xp": 0,
    "discovered": {},
    "correct": {},
    "answered": {},
    "cards": [],
    "opened": [],
    "daily": {"date": "2026-10-10", "discovered": 0, "correct": 0, "opened": 0, "done": False},
    "streak": {"count": 0, "lastDate": None},
    "seenIntro": True,
    "visited": [],
}


@pytest.fixture
def client(db, monkeypatch):
    seed_demo(db)
    monkeypatch.setattr(config, "GAME_MIN_ITEMS", 1)  # el catálogo de prueba es chico: sus conceptos tienen 1 a 7 ítems
    # /health estima los documentos con las estadísticas de Postgres: si el autovacuum analizara solo algunas
    # particiones, la cifra saldría parcial. Con pocas filas ANALYZE las lee todas y la estimación es exacta.
    db.execute("ANALYZE search_documents")
    db.commit()
    embedder = HashEmbedder()

    def conn_override():
        yield db

    @contextmanager
    def shared_connection():  # el recálculo de segmentos después de un pedido, con la conexión del test
        yield db

    api.app.dependency_overrides[api.get_conn] = conn_override
    api.app.dependency_overrides[api.get_connector] = lambda: shared_connection
    api.app.dependency_overrides[api.get_services] = lambda: Services(
        RappiAgent(embedder, TemplateComposer()), embedder
    )
    test_client = OwnerClient(api.app)
    # Un perfil con un interés (pizza) para que /recommendations tenga filas que mostrar.
    interest = {
        "type": "search",
        "session_id": "s-contrato",
        "vertical": "restaurants",
        "concept_id": "pizza",
        "query": "pizza",
    }
    assert test_client.post("/events", json={"user_id": "u-contrato", "events": [interest]}).status_code == 200
    # Una persona con gustos (chocolate y carne) para los ejemplos que se ordenan por afinidad. Los eventos de
    # `/events` no traen hora: se guardan con la de ahora, y su puntaje (sin decaimiento) es el mismo cada vez.
    liked = [
        {"type": "cart_add", "session_id": "s-afin", "concept_id": c, "cart_id": f"c-afin-{c}"}
        for c in ("chocolates", "carnes")
    ]
    assert test_client.post("/events", json={"user_id": "u-afin", "events": liked}).status_code == 200
    # Una persona con un perfil de gusto (lo asiático), para `profile-gustos`: busca ramen y pide sushi dos veces. Cada
    # pedido recalcula sus segmentos. La búsqueda no dice si encontró algo (`unmet`): no cambia el uso del MVP.
    ramen = {"type": "search", "session_id": "s-gustos-1", "concept_id": "asiatica", "query": "ramen", "results": 3}
    assert test_client.post("/events", json={"user_id": "u-gustos", "events": [ramen]}).status_code == 200
    for n, roll in enumerate(("98005", "98006"), start=2):
        line = {"entity_type": "menu_item", "entity_id": roll, "concept_id": "sushi"}
        order = {"user_id": "u-gustos", "session_id": f"s-gustos-{n}", "cart_id": f"c-gustos-{n}"}
        assert (
            test_client.post("/orders", json={**order, "vertical": "restaurants", "lines": [line]}).status_code == 200
        )
    # Ya descubrió el dato de la pizza: `agent-ask` (pizza) es la respuesta sin «¿Sabías que…?», y `agent-ask-dato`
    # (otro usuario, sin progreso) la que lo trae. `game-state-put` reemplaza este estado, así que no lo afecta.
    discovered = {**GAME_STATE, "discovered": {"restaurantes": ["restaurantes-01"]}, "cards": ["restaurantes-01"]}
    assert test_client.put("/game/state/u-contrato", json={"state": discovered}).status_code == 200
    # Una persona de antes de la identidad firmada, para el ejemplo de `/session`.
    db.execute("INSERT INTO app_users (user_id, source) VALUES ('proto-0123456789abcdef', 'prototype')")
    db.commit()
    yield test_client
    api.app.dependency_overrides.clear()


def render(body: dict) -> str:
    return json.dumps(body, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def check_example(example: Example, reply, directory: Path, *, write: bool, origin: str | None = None) -> None:
    """Compara el estado y el cuerpo de `reply` con el ejemplo de `directory`; con `write`, reescribe el cuerpo.

    Con `origin`, el ejemplo lleva además `guardado` = {origen, fecha}: el origen se compara y la fecha (la de la
    última escritura) no, para que el test no falle con el solo paso de los días.
    """
    assert reply.status_code == example.status, reply.text
    if example.status == 204:
        return
    body = reply.json()
    file = directory / f"{example.name}.json"

    if write:
        if origin:
            body = {**body, "guardado": {"origen": origin, "fecha": date.today().isoformat()}}
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(render(body), encoding="utf-8")
        return

    rendered = render({**body, "guardado": {"origen": origin}} if origin else body)
    current = file.read_text(encoding="utf-8") if file.exists() else None
    if origin and current:
        saved = json.loads(current)
        stamp = saved.get("guardado", {}).pop("fecha", None)
        try:
            date.fromisoformat(stamp)
        except (TypeError, ValueError):
            pytest.fail(f"{file.name} no trae la fecha de `guardado`: corre `make contract` en rappi-ia")
        current = render(saved)
    if current != rendered:
        pytest.fail(
            f"La respuesta de {example.path} cambió: corre `make contract` en rappi-ia y revisa el cambio en la app"
            " o en el panel"
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
        before = {e.name: e for e in CONTRACT}.get(example.after)
        assert before, f"El Example {example.name} pide antes a «{example.after}», que no está en CONTRACT"
        assert client.request(before.method, before.path, json=before.body).status_code == before.status
    reply = client.request(example.method, example.path, json=example.body)
    check_example(example, reply, FIXTURES, write=os.environ.get("RAPPI_CONTRACT_WRITE") == "1")


def prototype_journey(client) -> None:
    """Lo que manda la app en un recorrido corto: acepta un plan, ve una oferta en el carro, termina una ronda del
    juego con dos tarjetas nuevas y busca algo que no hay."""
    plan = client.post("/agent/offer", json={"moment": "plan", "context": {"occasion": "carrete"}}).json()
    cart = client.post(
        "/agent/offer",
        json={"moment": "carrito", "context": {"product": {"entity_type": "catalog_item", "entity_id": "94001"}}},
    ).json()
    cards = [card["id"] for card in client.get("/game/cards?vertical=supermercado").json()["cards"][:2]]
    search = client.get("/search?q=xyzzy&current=supermercado").json()
    assert len(cards) == 2 and search["unmet"]

    def offered(kind, offer):
        product = offer["products"][0]
        return {
            "type": kind,
            "session_id": "s-panel",
            "vertical": offer["prototype_vertical"],
            "concept_id": product["concept"],
            "payload": {"origen": f"agent-{offer['moment']}"},
        }

    game = {"vertical_juego": "supermercado"}
    sent = [
        offered("suggestion_shown", plan),
        offered("suggestion_accepted", plan),
        offered("suggestion_shown", cart),
        {
            "type": "game_round_finished",
            "session_id": "s-panel",
            "payload": {**game, "estrellas": 2, "aciertos": 4, "preguntas": 5},
        },
        *({"type": "game_card_discovered", "session_id": "s-panel", "payload": {**game, "tarjeta": c}} for c in cards),
        {
            "type": "search",
            "session_id": "s-panel",
            "vertical": "grocery",
            "query": "xyzzy",
            "results": 0,
            "unmet": search["unmet"],
        },
    ]
    assert client.post("/events", json={"user_id": "u-panel", "events": sent}).json() == {"guardados": len(sent)}


@pytest.mark.parametrize("source", ["prototype", "synthetic"])
@pytest.mark.parametrize("name", PANEL_METRICS)
def test_panel_examples_are_up_to_date(client, db, name, source):
    if source == "prototype":
        prototype_journey(client)
    else:
        generate(db, users=40, weeks=8, seed=11, until=date(2026, 10, 4))
    example = Example(f"{name}.{source}", "GET", f"/analytics/{name}?source={source}")
    reply = client.request(example.method, example.path)
    write = os.environ.get("RAPPI_CONTRACT_WRITE") == "1"
    check_example(example, reply, PANEL_FIXTURES, write=write, origin=PANEL_ORIGINS[source])


def shape_differences(live, saved, path="data") -> list[str]:
    """Dónde difieren las claves o los tipos de `live` y `saved`. Un None o una lista vacía no dicen nada."""
    if live is None or saved is None:
        return []
    numbers = (int, float)
    if isinstance(live, bool) or isinstance(saved, bool):
        return (
            []
            if isinstance(live, bool) and isinstance(saved, bool)
            else [f"{path}: {type(live).__name__} y {type(saved).__name__}"]
        )
    if isinstance(live, numbers) and isinstance(saved, numbers):
        return []
    if isinstance(live, dict) and isinstance(saved, dict):
        if live.keys() != saved.keys():
            only_live, only_saved = sorted(live.keys() - saved.keys()), sorted(saved.keys() - live.keys())
            return [f"{path}: claves distintas (solo en la API: {only_live}; solo en lo guardado: {only_saved})"]
        return [d for key in live for d in shape_differences(live[key], saved[key], f"{path}.{key}")]
    if isinstance(live, list) and isinstance(saved, list):
        return [d for row in live for guarded in saved for d in shape_differences(row, guarded, f"{path}[]")][:5]
    if type(live) is not type(saved):
        return [f"{path}: {type(live).__name__} y {type(saved).__name__}"]
    return []


@pytest.mark.parametrize("source", ["prototype", "synthetic"])
@pytest.mark.parametrize("name", PANEL_SHAPE)
def test_panel_saved_responses_keep_the_api_shape(client, db, name, source):
    """Los fixtures de 1.500 usuarios del panel (modo sin conexión y tests) tienen las claves y tipos de la API."""
    if source == "prototype":
        prototype_journey(client)
    else:
        generate(db, users=40, weeks=8, seed=11, until=date(2026, 10, 4))
    live = client.get(f"/analytics/{name}?source={source}")
    saved = json.loads((PANEL_FIXTURES / f"{name}.{source}.json").read_text(encoding="utf-8"))

    assert live.status_code == 200, live.text
    assert shape_differences(live.json()["data"], saved["data"]) == []


def test_panel_saved_catalog_keeps_the_api_shape(client):
    live = client.get("/analytics/catalog")
    saved = json.loads((PANEL_FIXTURES / "catalog.json").read_text(encoding="utf-8"))

    assert live.status_code == 200, live.text
    assert shape_differences(live.json()["data"], saved["data"]) == []


def test_the_shape_check_sees_a_renamed_key_or_a_changed_type():
    saved = {"filas": [{"a": 1, "b": "x"}], "n": 3}

    assert shape_differences({"filas": [{"a": 2.5, "b": "y"}], "n": 7}, saved) == []
    assert shape_differences({"filas": [], "n": None}, saved) == []
    assert "claves distintas" in shape_differences({"filas": [{"a": 1, "c": "x"}], "n": 3}, saved)[0]
    assert shape_differences({"filas": [{"a": "1", "b": "x"}], "n": 3}, saved) == ["data.filas[].a: str y int"]


def test_a_changed_body_fails_pointing_to_make_contract(tmp_path):
    (tmp_path / "ruta.json").write_text(render({"a": 1}), encoding="utf-8")
    example = Example("ruta", "GET", "/ruta")

    check_example(example, response(200, {"a": 1}), tmp_path, write=False)
    with pytest.raises(
        pytest.fail.Exception,
        match="La respuesta de /ruta cambió: corre `make contract` en rappi-ia y revisa el cambio en la app"
        " o en el panel",
    ):
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
