"""`POST /mochi/offer` y `GET /mochi/plans`: lo que Mochi propone en cada momento, sobre el catálogo de prueba
(`seed_demo`), con las guardias de `offers/guards.py`."""

import pytest
from fastapi.testclient import TestClient

from rappi_ia.agent.bigotes import Bigotes
from rappi_ia.agent.compose import TemplateComposer
from rappi_ia.api import app as api
from rappi_ia.api.services import Services
from rappi_ia.concepts.taxonomy import load_taxonomy
from rappi_ia.demo.seed import seed_demo
from rappi_ia.embeddings.base import HashEmbedder
from rappi_ia.embeddings.text_store import embed_search_documents
from rappi_ia.offers.guards import OFFER_BLOCKED_VERTICALS, is_offerable, is_plannable

# Tiendas de prueba que Rappi rotula Sex shop, Smoking shop y Farmacia: Mochi no ofrece nada de ellas.
BLOCKED_STORES = {9611, 9612, 9111}
BLOCKED_PRODUCTS = {"96101", "96102", "96201", "96202", "91401", "91402"}

BEER, WINE, PISCO = "94001", "94003", "94005"
CHIPS, COLA = "91001", "91003"
DIAPERS, PARACETAMOL, VITAMIN_C, SEX_GEL = "91007", "95001", "95003", "96102"
PIZZA_DISH = "98001"


@pytest.fixture
def client(db):
    seed_demo(db)
    embedder = HashEmbedder()
    embed_search_documents(db, embedder)

    def conn_override():
        yield db

    api.app.dependency_overrides[api.get_conn] = conn_override
    api.app.dependency_overrides[api.get_services] = lambda: Services(Bigotes(embedder, TemplateComposer()), embedder)
    yield TestClient(api.app)
    api.app.dependency_overrides.clear()


def item(entity_id: str, entity_type: str = "catalog_item") -> dict:
    return {"entity_type": entity_type, "entity_id": entity_id}


def offer(client, moment: str, context: dict):
    return client.post("/mochi/offer", json={"moment": moment, "context": context})


def assert_offerable(body: dict) -> None:
    """Lo que Mochi propone sola: nada de alcohol, farmacia, bebé, salud, sensibles, +18 ni tiendas bloqueadas."""
    concepts = load_taxonomy().concepts
    assert body["vertical"] not in OFFER_BLOCKED_VERTICALS
    assert body["products"]
    for product in body["products"]:
        assert product["vertical"] not in OFFER_BLOCKED_VERTICALS, product
        assert not product["age_restricted"], product
        assert product["store_id"] not in BLOCKED_STORES and product["entity_id"] not in BLOCKED_PRODUCTS, product
        assert product["concept"] not in concepts or is_offerable(concepts[product["concept"]]), product


def test_plan_kit_spreads_across_verticals_and_includes_chosen_alcohol_with_age_mark(client):
    reply = offer(client, "plan", {"occasion": "carrete"})

    assert reply.status_code == 200, reply.text
    body = reply.json()
    products = body["products"]
    assert body["moment"] == "plan" and body["reason"] == {"occasion": "carrete"}
    assert len(products) == 4 and len({p["entity_id"] for p in products}) == 4  # un producto por concepto
    assert len({p["concept"] for p in products}) == 4
    assert len({p["vertical"] for p in products}) >= 3  # repartido entre verticales
    assert "farmacia" not in {p["vertical"] for p in products}
    beers = [p for p in products if p["concept"] == "cerveza"]  # el alcohol de la ocasión elegida, con su marca +18
    assert beers and beers[0]["age_restricted"] and beers[0]["vertical"] == "licores"
    assert all(p["age_restricted"] == (p["concept"] in ("cerveza", "pisco", "ron")) for p in products)
    assert all(p["vertical"] != "licores" for p in products if not p["age_restricted"])  # Licores solo para el alcohol
    assert body["vertical"] == products[0]["vertical"] and body["prototype_vertical"]
    assert "carrete" in body["text"] and body["actions"][0]["query"] == "carrete"


def test_every_plannable_occasion_stays_clear_of_sensitive_baby_health_and_blocked_stores(client):
    concepts = load_taxonomy().concepts
    plans = client.get("/mochi/plans").json()
    assert len(plans) == 13

    for plan in plans:
        reply = offer(client, "plan", {"occasion": plan["id"]})
        assert reply.status_code in (200, 204), plan
        for product in reply.json()["products"] if reply.status_code == 200 else []:
            assert product["vertical"] != "farmacia" and product["store_id"] not in BLOCKED_STORES, plan
            assert is_plannable(concepts[product["concept"]]), (plan, product)
            assert product["age_restricted"] == (product["concept"] in ("cerveza", "pisco", "ron", "vino", "espumante"))


def test_plan_rejects_baby_and_sick_occasions(client):
    for occasion in ("guagua", "enfermo", "no-existe"):
        reply = offer(client, "plan", {"occasion": occasion})
        assert reply.status_code == 422, occasion
        assert occasion in reply.json()["detail"]


def test_cart_offer_never_returns_alcohol_or_pharmacy_even_if_cart_has_them(client):
    for product in (BEER, WINE, PISCO, DIAPERS, PARACETAMOL, VITAMIN_C, SEX_GEL, CHIPS):
        reply = offer(client, "carrito", {"product": item(product)})
        assert reply.status_code in (200, 204), product
        if reply.status_code == 200:
            assert_offerable(reply.json())

    beer = offer(client, "carrito", {"product": item(BEER)}).json()
    assert beer["moment"] == "carrito" and beer["reason"] == {"concept": "snacks-salados", "from_concept": "cerveza"}
    assert beer["vertical"] == "conveniencia" and beer["prototype_vertical"] == "express"
    assert "cerveza" not in beer["text"].lower()  # el origen no se nombra: Mochi no habla de alcohol sola
    assert beer["text"] == "Para completar tu pedido: snacks salados, en Express."
    assert {p["concept"] for p in beer["products"]} == {"snacks-salados"} and len(beer["products"]) <= 3
    assert beer["actions"][0]["route"] == ["express"] and beer["actions"][0]["query"] == "snacks salados"

    chips = offer(client, "carrito", {"product": item(CHIPS)}).json()
    assert chips["reason"]["from_concept"] == "snacks-salados" and chips["text"].startswith(
        "Para acompañar snacks salados"
    )


def test_checkout_offer_skips_items_already_in_cart(client):
    alone = offer(client, "checkout", {"cart": [item(PISCO)]}).json()
    assert alone["reason"]["concept"] == "gaseosas"  # la arista más fuerte del pisco

    both = offer(client, "checkout", {"cart": [item(PISCO), item(COLA)]})

    assert both.status_code == 200, both.text
    body = both.json()
    assert body["moment"] == "checkout" and body["reason"] == {"concept": "hielo", "from_concept": "pisco"}
    assert {p["entity_id"] for p in body["products"]}.isdisjoint({PISCO, COLA})
    assert body["text"].startswith("Antes de pagar") and "pisco" not in body["text"].lower()
    assert_offerable(body)

    mixed = offer(client, "checkout", {"cart": [item(BEER), item(CHIPS), item(DIAPERS)]}).json()
    assert mixed["reason"]["concept"] == "gaseosas"  # snacks ya está en el carrito, cerveza y bebé no se ofrecen
    assert_offerable(mixed)


def test_no_good_offer_is_204(client):
    for moment, context in (
        ("carrito", {"product": item(DIAPERS)}),  # solo complementa con dermocosmética (salud)
        ("carrito", {"product": item(PARACETAMOL)}),  # sensible
        ("carrito", {"product": item("123456789")}),  # un producto sin concepto
        ("checkout", {"cart": [item(DIAPERS), item(VITAMIN_C)]}),
        ("proximo_pedido", {"items": [item(PARACETAMOL)]}),
        ("sin_resultado", {"query": "xyzzy"}),  # no nombra ningún concepto
        ("sin_resultado", {"query": "cerveza helada"}),  # lo que se pide por su nombre no lo ofrece Mochi sola
        ("sin_resultado", {"query": "pañales talla g"}),
        (
            "vertical_por_probar",
            {"stamped": ["supermercado", "express", "turbo", "chocolateria", "restaurantes", "mall"]},
        ),
    ):
        reply = offer(client, moment, context)
        assert reply.status_code == 204 and not reply.content, (moment, context)


def test_vertical_to_try_skips_stamped_and_pharmacy(client):
    first = offer(client, "vertical_por_probar", {"stamped": []})
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["moment"] == "vertical_por_probar" and body["vertical"] == "supermercado"
    assert body["prototype_vertical"] == "grocery" and 1 <= len(body["products"]) <= 3
    assert body["text"] == "Aún no pruebas el súper: mira estas ofertas."
    assert_offerable(body)  # la farmacia que Rappi lista entre los súper tiene ofertas y no sale

    # ids del prototipo y del backend; Licores y Farmacia no se proponen nunca
    after_three = offer(client, "vertical_por_probar", {"stamped": ["grocery", "express", "turbo", "viajes"]}).json()
    assert after_three["vertical"] == "chocolateria" and after_three["text"].startswith("Aún no pruebas chocolaterías")

    mall = offer(
        client,
        "vertical_por_probar",
        {"stamped": ["supermercado", "conveniencia", "turbo", "chocolateria", "restaurantes"]},
    ).json()
    assert mall["vertical"] == "mall"  # salta Licores y Farmacia
    assert_offerable(mall)  # el sex shop y el smoking shop del mall tienen ofertas y no salen

    restaurants = offer(
        client, "vertical_por_probar", {"stamped": ["supermercado", "conveniencia", "turbo", "chocolateria", "mall"]}
    ).json()
    assert restaurants["vertical"] == "restaurantes" and restaurants["text"].endswith("lo que más piden.")
    assert {p["entity_type"] for p in restaurants["products"]} == {"menu_item"}
    assert_offerable(restaurants)


def test_plans_lists_offerable_occasions_in_home_order(client):
    reply = client.get("/mochi/plans")

    assert reply.status_code == 200
    plans = reply.json()
    ids = [p["id"] for p in plans]
    assert ids[:5] == ["once", "carrete", "asado", "panorama", "regalo"]
    assert "guagua" not in ids and "enfermo" not in ids and len(ids) == len(set(ids)) == 13
    assert set(ids) == set(load_taxonomy().occasions) - {"guagua", "enfermo"}
    assert plans[1] == {"id": "carrete", "name": "Carrete", "emoji": "🎉"}


def test_no_result_points_to_the_offerable_vertical_that_has_the_concept(client):
    reply = offer(client, "sin_resultado", {"query": "pizza hawaiana"})

    assert reply.status_code == 200, reply.text
    body = reply.json()
    assert body["vertical"] == "restaurantes" and body["reason"] == {"concept": "pizza"}
    assert body["text"] == "No encontré «pizza hawaiana», pero pizza sí hay en restaurantes."
    assert {p["concept"] for p in body["products"]} == {"pizza"} and len(body["products"]) <= 3
    assert_offerable(body)


def test_next_order_offers_a_complement_of_what_was_ordered(client):
    reply = offer(client, "proximo_pedido", {"items": [item(PIZZA_DISH, "menu_item")]})

    assert reply.status_code == 200, reply.text
    body = reply.json()
    assert body["reason"] == {"concept": "gaseosas", "from_concept": "pizza"}  # la cerveza de la pizza no se ofrece
    assert body["text"].startswith("Para tu próximo pedido: bebidas gaseosas")
    assert_offerable(body)


def test_invalid_requests_are_422(client):
    assert client.post("/mochi/offer", json={"moment": "nada", "context": {}}).status_code == 422
    assert offer(client, "carrito", {"product": {"entity_type": "store", "entity_id": "1"}}).status_code == 422
    assert offer(client, "checkout", {"cart": []}).status_code == 422
    assert offer(client, "sin_resultado", {"query": ""}).status_code == 422
    assert offer(client, "plan", {}).status_code == 422
