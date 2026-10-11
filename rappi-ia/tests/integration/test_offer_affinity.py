"""La vertical por probar y las ocasiones de la Home se ordenan por lo que le gusta a la persona
(`offers/personal.py`), sin saltarse las guardias: nada sensible ni que el agente no ofrezca cuenta nunca."""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

from rappi_ia.agent.compose import TemplateComposer
from rappi_ia.agent.rappi_agent import RappiAgent
from rappi_ia.api import app as api
from rappi_ia.api.services import Services
from rappi_ia.demo.seed import seed_demo
from rappi_ia.embeddings.base import HashEmbedder
from rappi_ia.embeddings.text_store import embed_search_documents
from rappi_ia.events import store as events

NOW = datetime.now(UTC)


@pytest.fixture
def client(db):
    seed_demo(db)
    embedder = HashEmbedder()
    embed_search_documents(db, embedder)

    def conn_override():
        yield db

    api.app.dependency_overrides[api.get_conn] = conn_override
    api.app.dependency_overrides[api.get_services] = lambda: Services(
        RappiAgent(embedder, TemplateComposer()), embedder
    )
    yield TestClient(api.app)
    api.app.dependency_overrides.clear()


def _like(db, user, *concepts, source="prototype"):
    """Un `cart_add` de cada concepto: interés en eso."""
    events.record(
        db,
        [events.Event(user, "s1", "cart_add", ts=NOW, concept_id=c, cart_id=f"c-{user}-{c}") for c in concepts],
        source=source,
    )


def _sensitive_segment(db, user, concept):
    db.execute(
        """INSERT INTO segment_defs (segment_id, name, family, sensitive, rule, rules_version)
           VALUES ('seg-sensible', 'seg-sensible', 'prueba', true, '{}', 'test') ON CONFLICT DO NOTHING"""
    )
    db.execute(
        """INSERT INTO user_segments (user_id, segment_id, score, level, signals, evidence)
           VALUES (%s, 'seg-sensible', 1, 'alto', 3, %s)""",
        (user, Jsonb({"top": [{"kind": "concepto", "id": concept, "score": 1.0}]})),
    )


def to_try(client, user_id=None, stamped=()):
    body = {"moment": "vertical_por_probar", "context": {"stamped": list(stamped)}}
    if user_id:
        body["user_id"] = user_id
    reply = client.post("/agent/offer", json=body)
    assert reply.status_code == 200, reply.text
    return reply.json()


def plans(client, user_id=None):
    reply = client.get("/agent/plans", params={"user_id": user_id} if user_id else None)
    assert reply.status_code == 200, reply.text
    return reply.json()


def test_vertical_to_try_follows_affinity(client, db):
    _like(db, "u1", "chocolates")

    body = to_try(client, "u1")

    assert body["vertical"] == "chocolateria"  # sin historia saldría el súper
    assert body["reason"]["text"] == "Porque te gusta 🍫 chocolates, y en chocolaterías hay más."
    assert [(s["kind"], s["id"], s["source"]) for s in body["reason"]["basis"]] == [
        ("concepto", "chocolates", "eventos")
    ]
    assert body["reason"]["basis"][0]["score"] > 0
    assert to_try(client)["vertical"] == "supermercado"


def test_vertical_to_try_without_history_keeps_passport_order(client, db):
    _like(db, "u1", "chocolates", source="synthetic")  # simulado: no cuenta

    for user in (None, "nadie", "u1"):
        body = to_try(client, user)
        assert body["vertical"] == "supermercado"
        assert body["reason"]["text"] == "Porque aún no tienes el sello de el súper."
        assert body["reason"]["basis"] == [{"kind": "sello", "id": "supermercado", "source": "contexto"}]


def test_vertical_to_try_skips_stamped_even_with_affinity(client, db):
    _like(db, "u1", "chocolates")

    body = to_try(client, "u1", stamped=["chocolateria"])

    assert body["vertical"] == "supermercado"
    assert body["reason"]["text"].startswith("Porque aún no tienes el sello")


def test_vertical_to_try_never_offers_farmacia_or_licores_even_with_affinity(client, db):
    _like(db, "u1", "medicamentos", "cerveza", "vino", "pisco", "panales", "vitaminas")  # lo que el agente no ofrece
    _like(db, "u2", "vino", "pisco", "chocolates")

    for user in ("u1", "u2"):
        for stamped in ([], ["supermercado", "conveniencia", "turbo", "chocolateria"], ["supermercado"]):
            body = to_try(client, user, stamped)
            assert body["vertical"] not in ("farmacia", "licores")
            assert body["moment"] == "vertical_por_probar"
    assert to_try(client, "u1") == to_try(client)  # lo que no ofrece no cambia nada
    assert to_try(client, "u2")["vertical"] == "chocolateria"  # y el chocolate sí


def test_vertical_to_try_basis_has_the_three_concepts_that_contribute_most(client, db):
    _like(db, "u1", "chocolates", "helados", "golosinas", "galletas")
    events.record(
        db, [events.Event("u1", "s1", "cart_add", ts=NOW, concept_id="chocolates", cart_id="c-x")], source="prototype"
    )  # chocolate pesa más

    body = to_try(client, "u1", stamped=["supermercado", "conveniencia", "turbo"])

    assert body["vertical"] == "chocolateria"
    assert body["reason"]["text"].startswith("Porque te gusta 🍫 chocolates,")
    ids = [s["id"] for s in body["reason"]["basis"]]
    assert len(set(ids)) <= 3 and ids[0] == "chocolates"


def test_plans_order_by_interest(client, db):
    _like(db, "u1", "carnes", "carbon")

    ids = [p["id"] for p in plans(client, "u1")]
    asado = next(p for p in plans(client, "u1") if p["id"] == "asado")

    assert ids[0] == "asado"
    assert asado["reason"]["text"].startswith("Porque te gusta ")
    assert {s["id"] for s in asado["reason"]["basis"]} == {"carnes", "carbon"}
    assert all(s["source"] == "eventos" for s in asado["reason"]["basis"])


def test_plans_with_interest_put_scored_occasions_first_and_the_rest_in_default_order(client, db):
    default = [p["id"] for p in plans(client)]
    _like(db, "u1", "chocolates")

    shown = plans(client, "u1")

    scored = [p for p in shown if "reason" in p]
    assert scored and [p["id"] for p in shown[: len(scored)]] == [p["id"] for p in scored]
    assert all(p["reason"]["text"] == "Porque te gusta 🍫 chocolates." for p in scored)
    assert [p["id"] for p in shown if "reason" not in p] == [i for i in default if i not in {p["id"] for p in scored}]
    assert sorted(p["id"] for p in shown) == sorted(default)
    # ocasiones con chocolate: empatan y mandan HOME_OCCASIONS y la taxonomía
    assert [p["id"] for p in scored][:1] == ["regalo"]


def test_plans_without_user_keep_the_default_order(client, db):
    _like(db, "u1", "chocolates", source="synthetic")
    default = plans(client)

    assert [p["id"] for p in default[:5]] == ["once", "carrete", "asado", "panorama", "regalo"]
    assert all("reason" not in p for p in default)
    assert plans(client, "nadie") == default
    assert plans(client, "u1") == default  # simulado: no cuenta


def test_plans_rejects_a_long_user_id(client):
    assert client.get("/agent/plans", params={"user_id": "x" * 65}).status_code == 422


def test_only_sensitive_or_non_offerable_history_changes_nothing(client, db):
    _like(db, "u1", "cerveza", "vino", "pisco", "medicamentos", "panales", "vitaminas")
    _sensitive_segment(db, "u1", "chocolates")
    db.execute("INSERT INTO app_users (user_id, source) VALUES ('base', 'prototype') ON CONFLICT DO NOTHING")

    for stamped in ([], ["supermercado"], ["supermercado", "conveniencia", "turbo"]):
        assert to_try(client, "u1", stamped) == to_try(client, "base", stamped) == to_try(client, None, stamped)
    assert plans(client, "u1") == plans(client, "base") == plans(client)
