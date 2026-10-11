"""`/game`: las tarjetas del juego y el progreso de cada persona, sobre el catálogo de prueba (`seed_demo`)."""

import copy

import pytest
from fastapi.testclient import TestClient

from rappi_ia.api import app as api
from rappi_ia.demo.seed import seed_demo
from rappi_ia.game import GAME_VERTICALS
from rappi_ia.game.cards import list_cards

STATE = {
    "version": 1,
    "xp": 30,
    "discovered": {"supermercado": ["supermercado-01"]},
    "correct": {"supermercado": 1},
    "answered": {"supermercado": 1},
    "cards": ["supermercado-01"],
    "opened": ["supermercado-01"],
    "daily": {"date": "2026-10-10", "discovered": 1, "correct": 1, "opened": 1, "done": False},
    "streak": {"count": 1, "lastDate": "2026-10-10"},
    "seenIntro": True,
    "visited": ["supermercado", "restaurantes"],
}


@pytest.fixture
def client(db):
    seed_demo(db)

    def conn_override():
        yield db

    api.app.dependency_overrides[api.get_conn] = conn_override
    yield TestClient(api.app)
    api.app.dependency_overrides.clear()


def put(client, user_id: str, state: dict):
    return client.put(f"/game/state/{user_id}", json={"state": state})


def test_cards_returns_all_108_in_file_order(client, db):
    reply = client.get("/game/cards")

    assert reply.status_code == 200
    cards = reply.json()["cards"]
    assert len(cards) == 108
    assert cards == list_cards(db)
    assert cards[0]["id"] == "supermercado-01" and cards[-1]["id"] == "viajes-12"
    assert {c["vertical"] for c in cards} == set(GAME_VERTICALS)


def test_cards_filters_by_vertical(client):
    cards = client.get("/game/cards", params={"vertical": "viajes"}).json()["cards"]

    assert len(cards) == 12
    assert {c["vertical"] for c in cards} == {"viajes"}


def test_cards_unknown_vertical_is_422(client):
    assert client.get("/game/cards", params={"vertical": "pet"}).status_code == 422


def test_state_is_204_before_saving(client):
    reply = client.get("/game/state/u-nuevo")

    assert reply.status_code == 204
    assert reply.content == b""


def test_put_then_get_returns_the_same_state(client):
    saved = put(client, "u-juego", STATE)

    assert saved.status_code == 200, saved.text
    assert saved.json() == {"state": STATE}
    assert client.get("/game/state/u-juego").json() == {"state": STATE}


def test_put_creates_a_prototype_user(client, db):
    assert put(client, "u-juego", STATE).status_code == 200

    assert db.execute("SELECT source FROM app_users WHERE user_id = 'u-juego'").fetchone() == ("prototype",)
    assert db.execute("SELECT count(*) FROM game_state WHERE user_id = 'u-juego'").fetchone() == (1,)


def test_put_drops_unknown_cards_and_verticals(client):
    state = copy.deepcopy(STATE)
    state["discovered"] = {"supermercado": ["supermercado-01", "supermercado-99"], "pet": ["pet-01"]}
    state["correct"] = {"supermercado": 1, "pet": 2}
    state["answered"] = {"supermercado": 1, "pet": 2}
    state["cards"] = ["supermercado-01", "nada-01"]
    state["opened"] = ["supermercado-99", "viajes-01"]
    state["visited"] = ["supermercado", "pet"]

    body = put(client, "u-juego", state).json()["state"]

    assert body["discovered"] == {"supermercado": ["supermercado-01"]}
    assert body["correct"] == {"supermercado": 1}
    assert body["answered"] == {"supermercado": 1}
    assert body["cards"] == ["supermercado-01"]
    assert body["opened"] == ["viajes-01"]
    assert body["visited"] == ["supermercado"]
    assert client.get("/game/state/u-juego").json()["state"] == body


def test_put_for_a_synthetic_user_is_400_and_writes_nothing(client, db):
    db.execute("INSERT INTO app_users (user_id, source) VALUES ('1', 'synthetic')")
    db.commit()

    reply = put(client, "1", STATE)

    assert reply.status_code == 400 and reply.json() == {"detail": "Solicitud no válida"}
    assert db.execute("SELECT count(*) FROM game_state").fetchone() == (0,)
    assert db.execute("SELECT source FROM app_users WHERE user_id = '1'").fetchone() == ("synthetic",)


def test_put_rejects_bad_ids_and_bodies(client):
    negative_xp = {**STATE, "xp": -1}
    extra_key = {**STATE, "extra": 1}
    too_many_cards = {**STATE, "cards": [f"supermercado-{i}" for i in range(201)]}
    other_version = {**STATE, "version": 2}
    string_version = {**STATE, "version": "1"}

    assert put(client, "u" * 65, STATE).status_code == 422
    assert client.get("/game/state/" + "u" * 65).status_code == 422
    assert put(client, "u-juego", negative_xp).status_code == 422
    assert put(client, "u-juego", extra_key).status_code == 422
    assert put(client, "u-juego", too_many_cards).status_code == 422
    assert put(client, "u-juego", other_version).status_code == 422
    assert put(client, "u-juego", string_version).status_code == 422
    assert client.get("/game/state/u-juego").status_code == 204


def test_forgetting_the_user_deletes_the_game_state(client, db):
    put(client, "u-juego", STATE)

    assert client.delete("/profile/u-juego").status_code == 200

    assert db.execute("SELECT count(*) FROM game_state").fetchone() == (0,)
    assert client.get("/game/state/u-juego").status_code == 204


def test_state_naming_a_removed_card_is_cleaned_on_read(client, db):
    put(client, "u-juego", STATE)
    db.execute("DELETE FROM knowledge_cards WHERE card_id = 'supermercado-01'")
    db.commit()

    body = client.get("/game/state/u-juego").json()["state"]

    assert body["discovered"] == {"supermercado": []}
    assert body["cards"] == [] and body["opened"] == []
