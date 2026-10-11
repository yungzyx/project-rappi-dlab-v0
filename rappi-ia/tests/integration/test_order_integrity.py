"""`POST /orders` no confía en el cliente: el precio sale del catálogo, un producto que no existe es un 400, y un pedido
en «Rappi hoy» (modo actual) no enseña nada al perfil de la persona."""

from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient

from rappi_ia.api import app as api
from rappi_ia.demo import seed
from rappi_ia.events import store as events
from rappi_ia.layers.segments import load_signals
from rappi_ia.offers.personal import bought_brands, user_interests

CHIPS = "91001"  # Papas fritas clásicas 180 g (prueba), del súper del catálogo de prueba
BRAND = "marca-prueba"


@pytest.fixture
def client(db):
    seed.seed_demo(db)
    db.execute("INSERT INTO product_brands (brand_key, name) VALUES (%s, 'Marca de prueba')", (BRAND,))
    db.execute(
        "INSERT INTO item_brands (entity_type, entity_id, brand_key, source) VALUES ('catalog_item', %s, %s, 'regla')",
        (CHIPS, BRAND),
    )
    db.commit()

    @contextmanager
    def shared_connection():  # el recálculo de segmentos después de un pedido: en la base de tests, sin cerrarla
        yield db

    def conn_override():
        yield db

    api.app.dependency_overrides[api.get_conn] = conn_override
    api.app.dependency_overrides[api.get_connector] = lambda: shared_connection
    yield TestClient(api.app)
    api.app.dependency_overrides.clear()


def _order(client, user, cart, mode=None, **line):
    body = {
        "user_id": user,
        "session_id": f"s-{cart}",
        "cart_id": cart,
        "vertical": "grocery",
        "lines": [{"entity_type": "catalog_item", "entity_id": CHIPS, "concept_id": "snacks-salados", **line}],
    }
    return client.post("/orders", json=body if mode is None else {**body, "mode": mode})


def test_client_unit_price_is_ignored(client, db):
    catalog_price = client.get(f"/catalog/products/catalog_item/{CHIPS}").json()["price_value"]
    reply = _order(client, "u1", "c1", unit_price=1e8, qty=2)
    assert reply.status_code == 200, reply.text
    order_id = reply.json()["order_id"]

    total = db.execute("SELECT total FROM app_orders WHERE order_id = %s", (order_id,)).fetchone()[0]
    line_price = db.execute("SELECT unit_price FROM app_order_lines WHERE order_id = %s", (order_id,)).fetchone()[0]
    placed = db.execute("SELECT value FROM app_events WHERE type = 'order_placed'").fetchone()[0]
    assert float(total) == float(placed) == 2 * catalog_price and float(line_price) == catalog_price


def test_unknown_entity_is_400(client, db):
    for entity_id in ["999999999", "proto:1"]:
        reply = _order(client, "u1", "c1", entity_id=entity_id)
        assert reply.status_code == 400 and reply.json() == {"detail": "Producto no disponible"}, entity_id
    assert db.execute("SELECT count(*) FROM app_orders").fetchone()[0] == 0


def test_actual_mode_orders_do_not_feed_interests(client, db):
    """En «Rappi hoy» no se aprende: la marca que repite y los conceptos de sus líneas no entran a su perfil, aunque
    un cliente mande el concepto. El mismo pedido en la propuesta sí entra (control)."""
    for n in (1, 2):
        assert _order(client, "u-hoy", f"hoy-{n}", mode="actual").status_code == 200
        assert _order(client, "u-propuesta", f"prop-{n}").status_code == 200
    modes = dict(db.execute("SELECT user_id, min(mode) FROM app_orders GROUP BY 1").fetchall())
    assert modes == {"u-hoy": "actual", "u-propuesta": "propuesta"}

    assert bought_brands(db, "u-propuesta") == user_interests(db, "u-propuesta").brands == {BRAND: 2}
    assert bought_brands(db, "u-hoy") == user_interests(db, "u-hoy").brands == {}
    # Las líneas de pedido son señales de los segmentos (y su evidencia, conceptos del perfil).
    assert _line_concepts(db, "u-propuesta") == ["snacks-salados", "snacks-salados"]
    assert _line_concepts(db, "u-hoy") == []


def _line_concepts(db, user):
    signals = load_signals(db, "prototype", user).get(user, [])
    return [s.concept for s in signals if s.type == "order_line"]


def test_events_cannot_fake_an_order(client, db):
    """`order_placed` solo nace en /orders: por /events era un pedido sin pedido detrás (pesa 5 en el perfil)."""
    fake = {"type": "order_placed", "session_id": "s1", "concept_id": "snacks-salados", "value": 5000}
    assert client.post("/events", json={"user_id": "u1", "events": [fake]}).status_code == 400
    assert db.execute("SELECT count(*) FROM app_events").fetchone()[0] == 0
    assert events.profile(db, "u1") == {}
