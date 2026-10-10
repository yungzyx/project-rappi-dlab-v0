"""`GET /game/challenge`: desafíos armados en vivo sobre el catálogo de prueba (`seed_demo`)."""

import pytest
from fastapi.testclient import TestClient

from rappi_ia import config
from rappi_ia.api import app as api
from rappi_ia.demo.seed import seed_demo
from rappi_ia.game.challenges import KINDS, read_challenge_data

SHOP_VERTICALS = (
    "supermercado",
    "conveniencia",
    "turbo",
    "licores",
    "chocolateria",
    "restaurantes",
    "farmacia",
    "mall",
)


@pytest.fixture
def client(db, monkeypatch):
    seed_demo(db)
    monkeypatch.setattr(config, "GAME_MIN_ITEMS", 1)  # el catálogo de prueba es chico

    def conn_override():
        yield db

    api.app.dependency_overrides[api.get_conn] = conn_override
    yield TestClient(api.app)
    api.app.dependency_overrides.clear()


def test_challenge_for_supermercado_has_four_options_and_answer(client):
    reply = client.get("/game/challenge", params={"vertical": "supermercado", "seed": "0"})

    assert reply.status_code == 200
    body = reply.json()
    assert set(body) == {"id", "kind", "vertical", "anchor", "question", "options", "answer", "explanation"}
    assert body["vertical"] == "supermercado"
    assert body["kind"] in KINDS
    assert len(body["options"]) == 4
    assert len({option["id"] for option in body["options"]}) == 4
    assert all(set(option) == {"id", "label"} for option in body["options"])
    assert body["answer"] in {option["id"] for option in body["options"]}
    assert body["id"] == f"supermercado:{body['kind']}:{body['anchor']}:0"
    assert client.get("/game/challenge", params={"vertical": "supermercado", "seed": "0"}).json() == body


def test_challenge_never_uses_a_sensitive_concept(client, db):
    sensitive = {cid for (cid,) in db.execute("SELECT concept_id FROM concepts WHERE sensitive")}
    assert sensitive  # el catálogo de prueba sí los tiene (medicamentos, cigarrillos…)
    kinds = set()

    for vertical in SHOP_VERTICALS:
        for seed in range(30):
            reply = client.get("/game/challenge", params={"vertical": vertical, "seed": str(seed)})
            assert reply.status_code in (200, 204)
            if reply.status_code == 204:
                continue
            body = reply.json()
            kinds.add(body["kind"])
            used = {body["anchor"], body["answer"], *(option["id"] for option in body["options"])}
            assert not used & sensitive, (vertical, seed, used & sensitive)

    assert len(kinds) > 1


def test_challenge_viajes_is_204(client):
    reply = client.get("/game/challenge", params={"vertical": "viajes", "seed": "0"})

    assert reply.status_code == 204
    assert reply.content == b""


def test_challenge_unknown_vertical_is_422(client):
    reply = client.get("/game/challenge", params={"vertical": "nada", "seed": "0"})

    assert reply.status_code == 422
    assert "nada" in reply.json()["detail"]


def test_challenge_seed_must_be_1_to_64_characters(client):
    assert client.get("/game/challenge", params={"vertical": "turbo", "seed": ""}).status_code == 422
    assert client.get("/game/challenge", params={"vertical": "turbo", "seed": "x" * 65}).status_code == 422
    assert client.get("/game/challenge", params={"vertical": "turbo", "seed": "x" * 64}).status_code in (200, 204)
    assert client.get("/game/challenge", params={"vertical": "turbo"}).status_code == 422


def test_challenge_without_enough_items_is_204(client, monkeypatch):
    monkeypatch.setattr(config, "GAME_MIN_ITEMS", 10_000)

    assert client.get("/game/challenge", params={"vertical": "supermercado", "seed": "0"}).status_code == 204


def test_read_challenge_data_expands_group_conflicts(db):
    seed_demo(db)

    data = read_challenge_data(db)

    # alcohol → pañales se cura de un grupo a un concepto: cada concepto del grupo queda en conflicto con pañales.
    assert {"cerveza", "vino"} <= data.conflicts["panales"]
    assert data.conflicts["cerveza"] >= {"panales", "juguetes-infantiles"}
    assert "panales" in data.conflicts["vino"]  # simétrico
    assert "alcohol" not in data.concepts  # los grupos no son conceptos
    assert data.substitutes["gaseosas"] >= {"jugos", "agua"}
    assert data.complements["cerveza"]
    assert data.concepts["cerveza"].home == "licores"
    assert data.concepts["cerveza"].items["licores"] >= 1
    sensitive = {cid for (cid,) in db.execute("SELECT concept_id FROM concepts WHERE sensitive")}
    assert not sensitive & set(data.concepts)
    related = {
        x for relations in (data.complements, data.substitutes, data.conflicts) for v in relations.values() for x in v
    }
    assert not sensitive & related
