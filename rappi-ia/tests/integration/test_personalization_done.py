"""Hecho cuando (etapa 5): dos personas con historias distintas reciben ofertas distintas, y cada porqué se puede
rastrear hasta algo que esa persona hizo. La preparación (`people`) está en conftest.py y se hizo solo con la API."""

import pytest
from personal_helpers import COFFEE, GRILL, SWEET, SWEET_BRAND, prepare_people

from rappi_ia.concepts.taxonomy import load_taxonomy


@pytest.fixture
def people(db, monkeypatch):
    yield from prepare_people(db, monkeypatch)


def to_try(client, user):
    reply = client.post(
        "/agent/offer", json={"moment": "vertical_por_probar", "user_id": user, "context": {"stamped": []}}
    )
    assert reply.status_code == 200, reply.text
    return reply.json()


def plans(client, user):
    reply = client.get("/agent/plans", params={"user_id": user})
    assert reply.status_code == 200, reply.text
    return reply.json()


def checkout(client, user):
    """Un carro con café y una torta: su complemento son las galletas, que en la chocolatería son dos."""
    cart = [{"entity_type": "catalog_item", "entity_id": i} for i in (COFFEE, "97004")]
    body = {"moment": "checkout", "context": {"cart": cart}, "user_id": user}
    reply = client.post("/agent/offer", json=body)
    assert reply.status_code == 200, reply.text
    return reply.json()


def names_a_concept_of(reason, history):
    """El texto de la razón nombra (por su nombre en la taxonomía) algún concepto de la historia."""
    concepts = load_taxonomy().concepts
    return any(concepts[c].name.lower() in reason["text"] for c in history)


def assert_traceable(db, user, reason, history):
    """Cada señal de la base viene de algo que la persona hizo: sus eventos, un segmento suyo (con ese concepto en su
    evidencia) o sus pedidos; y las de concepto son de su historia."""
    assert reason["basis"]
    for signal in reason["basis"]:
        assert signal["kind"] == "concepto" and signal["id"] in history and signal["score"] > 0, signal
        if signal["source"].startswith("segmento:"):
            segment = signal["source"].removeprefix("segmento:")
            evidence = db.execute(
                "SELECT evidence FROM user_segments WHERE user_id = %s AND segment_id = %s", (user, segment)
            ).fetchone()
            assert evidence and signal["id"] in {t["id"] for t in evidence[0]["top"]}, signal
        else:
            assert signal["source"] == "eventos", signal
    assert "eventos" in {s["source"] for s in reason["basis"]}  # lo que hizo en la app siempre suma


def test_two_users_with_different_histories_get_different_offers(people, db):
    client = people.client
    histories = {SWEET: people.sweet_history, GRILL: people.grill_history}

    to_try_offers = {user: to_try(client, user) for user in histories}
    first_plans = {user: plans(client, user)[0] for user in histories}

    assert to_try_offers[SWEET]["vertical"] != to_try_offers[GRILL]["vertical"]
    assert (to_try_offers[SWEET]["vertical"], to_try_offers[GRILL]["vertical"]) == ("chocolateria", "supermercado")
    assert first_plans[SWEET]["id"] != first_plans[GRILL]["id"]
    assert (first_plans[SWEET]["id"], first_plans[GRILL]["id"]) == ("antojo", "asado")
    for user, history in histories.items():
        for reason in (to_try_offers[user]["reason"], first_plans[user]["reason"]):
            assert reason["text"].startswith("Porque te gusta")
            assert names_a_concept_of(reason, history), reason["text"]
            assert_traceable(db, user, reason, history)


def test_complement_puts_the_brand_you_buy_first(people, db):
    client = people.client
    anonymous = checkout(client, None)
    sweet, grill = checkout(client, SWEET), checkout(client, GRILL)

    ids = [p["entity_id"] for p in anonymous["products"]]
    assert people.sweet_brand_product in ids and ids[0] != people.sweet_brand_product  # no era la primera
    assert [p["entity_id"] for p in sweet["products"]][0] == people.sweet_brand_product
    assert sweet["reason"]["text"].endswith(f" Es {SWEET_BRAND[1]}, la marca que compras.")
    brand = [s for s in sweet["reason"]["basis"] if s["kind"] == "marca"]
    assert brand == [{"kind": "marca", "id": SWEET_BRAND[0], "score": 2, "source": "pedidos"}]  # sus dos pedidos
    ordered = db.execute(
        """SELECT count(DISTINCT o.order_id) FROM app_orders o JOIN app_order_lines l USING (order_id)
           JOIN item_brands b ON b.entity_type = l.entity_type AND b.entity_id = l.entity_id
           WHERE o.user_id = %s AND b.brand_key = %s""",
        (SWEET, SWEET_BRAND[0]),
    ).fetchone()[0]
    assert ordered == brand[0]["score"]  # rastreable hasta sus pedidos
    assert grill == anonymous  # quien no compra esa marca ve la oferta de siempre
