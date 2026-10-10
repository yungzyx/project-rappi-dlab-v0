"""Catálogo de tiendas y productos: las tarjetas, la tienda con sus pasillos y el detalle, con precios vigentes.

Todo sobre el catálogo de `seed_demo`: las tiendas 9101 y 9102 son los dos súper de prueba; 9103 es una sucursal del
mismo formato que 9101 que solo salió en una corrida anterior; 9104 está descubierta, sin productos. El pasillo
«Despensa» de 9101 tiene exactamente 30 productos vigentes, y dos ofertas de 9101 no lo son: una de una corrida
anterior (atún) y una agotada (mermelada).
"""

import re

import pytest
from fastapi.testclient import TestClient
from rappi_scraper.storage.search import build_search_documents

from rappi_ia.agent.tools import search_products
from rappi_ia.agent.verticals import LOGO_BASE_URL
from rappi_ia.api import app as api
from rappi_ia.catalog.stores import product_detail, store_page, vertical_stores
from rappi_ia.demo.seed import seed_demo

CENTRO, NORTE, OLD_BRANCH, DISCOVERED, PIZZERIA = 9101, 9102, 9103, 9104, 9801
CARD_KEYS = {"id", "name", "logo", "eta", "products", "vertical"}
NOT_IN_CATALOG = "Esta tienda no está en el catálogo"


@pytest.fixture
def seeded(db):
    seed_demo(db)
    return db


@pytest.fixture
def client(seeded):
    def conn_override():
        yield seeded

    api.app.dependency_overrides[api.get_conn] = conn_override
    yield TestClient(api.app)
    api.app.dependency_overrides.clear()


def all_products(conn, store_id: int) -> list[dict]:
    """Todos los productos de la tienda, pasillo por pasillo y página por página."""
    products = []
    for aisle in store_page(conn, store_id)["aisles"]:
        page = 1
        while True:
            reply = store_page(conn, store_id, aisle["id"], page)
            products += reply["products"]
            if not reply["has_more"]:
                break
            page += 1
    return products


def test_vertical_stores_lists_one_card_per_format_with_current_offers(seeded):
    cards = vertical_stores(seeded, "supermercado")

    # 9103 es del mismo formato que 9101 pero su última descarga es anterior; 9104 solo se descubrió.
    assert [card["id"] for card in cards] == [CENTRO, NORTE]
    assert all(set(card) == CARD_KEYS for card in cards)
    centro, norte = cards
    assert centro["name"] == "Supermercado de prueba Centro"
    assert centro["logo"] == f"{LOGO_BASE_URL}prueba-{CENTRO}.png"
    assert re.fullmatch(r"\d+ min", centro["eta"])
    assert centro["vertical"] == "supermercado"
    # Ofertas vigentes: el atún (corrida anterior) y la mermelada (agotada) no cuentan. Más ofertas primero.
    assert (centro["products"], norte["products"]) == (36, 33)


def test_vertical_stores_limit_and_restaurants(seeded):
    assert len(vertical_stores(seeded, "supermercado", limit=1)) == 1
    assert [card["id"] for card in vertical_stores(seeded, "turbo")] == [9301, 9302]
    assert vertical_stores(seeded, "restaurantes") == []


def test_card_uses_the_brand_name_and_leaves_unknown_logo_and_eta_empty(seeded):
    seeded.execute("INSERT INTO brands (brand_id, name) VALUES (77, 'Marca de prueba')")
    seeded.execute("UPDATE stores SET brand_id = 77, raw = NULL WHERE store_id = %s", (CENTRO,))

    card = vertical_stores(seeded, "supermercado")[0]

    assert (card["id"], card["name"], card["logo"], card["eta"]) == (CENTRO, "Marca de prueba", None, None)

    # Un minutos que no es un número tampoco se muestra.
    seeded.execute('UPDATE stores SET raw = \'{"eta_value": "pronto"}\' WHERE store_id = %s', (CENTRO,))
    assert vertical_stores(seeded, "supermercado")[0]["eta"] is None


def add_branch(
    conn, store_id: int, store_type: str, with_aisle: bool, product_id: int = 91001, price: int = 1990
) -> None:
    """Una sucursal más del súper de prueba con una oferta en la corrida actual (como las de una descarga)."""
    conn.execute(
        'INSERT INTO stores (store_id, name, store_type, raw) VALUES (%s, %s, %s, \'{"image": "x.png"}\')',
        (store_id, f"Sucursal de prueba {store_id}", store_type),
    )
    conn.execute("INSERT INTO store_verticals (store_id, vertical) VALUES (%s, 'supermercado')", (store_id,))
    if with_aisle:
        conn.execute("INSERT INTO aisles (store_id, aisle_id, name) VALUES (%s, 100, 'Despensa')", (store_id,))
    sku = f"sku-{product_id}"
    conn.execute(
        "INSERT INTO store_products (store_id, sku, master_product_id, aisle_id) VALUES (%s, %s, %s, %s)",
        (store_id, sku, product_id, 100 if with_aisle else None),
    )
    run_id = conn.execute("SELECT max(run_id) FROM scrape_runs WHERE kind = 'stores'").fetchone()[0]
    conn.execute(
        "INSERT INTO price_snapshots (run_id, store_id, sku, price, in_stock) VALUES (%s, %s, %s, %s, true)",
        (run_id, store_id, sku, price),
    )


def test_a_store_whose_offers_have_no_aisle_is_neither_listed_nor_opened(seeded):
    """Las tiendas importadas de un CSV antiguo tienen productos pero no pasillos: su página saldría vacía."""
    add_branch(seeded, 9105, "prueba_9105", with_aisle=False)

    assert [card["id"] for card in vertical_stores(seeded, "supermercado")] == [CENTRO, NORTE]
    assert store_page(seeded, 9105) is None


def test_a_format_downloaded_in_two_branches_has_one_card_the_one_with_more_offers(seeded):
    add_branch(seeded, 9105, "prueba_9102", with_aisle=True)  # el formato del súper Norte, con una sola oferta

    assert [(card["id"], card["products"]) for card in vertical_stores(seeded, "supermercado")] == [
        (CENTRO, 36),
        (NORTE, 33),
    ]
    assert store_page(seeded, 9105)["store"]["products"] == 1  # la otra sucursal sigue abierta por su id


def test_store_page_lists_aisles_in_rappi_order_with_current_counts(seeded):
    page = store_page(seeded, CENTRO)

    # Los subpasillos no son pasillos: sus productos cuentan en el pasillo. «Mermeladas» solo tiene una oferta
    # agotada, así que no aparece.
    assert [(a["name"], a["products"]) for a in page["aisles"]] == [
        ("Despensa", 30),
        ("Snacks y Dulces", 2),
        ("Bebidas", 2),
        ("Cuidado del bebé", 1),
        ("Cervezas", 1),
    ]
    assert all(set(a) == {"id", "name", "products"} for a in page["aisles"])
    assert page["aisles"] == sorted(page["aisles"], key=lambda a: a["id"])
    assert page["aisle"] == page["aisles"][0]
    assert set(page["store"]) == CARD_KEYS and page["store"]["id"] == CENTRO
    assert sum(a["products"] for a in page["aisles"]) == page["store"]["products"] == 36


def test_store_page_prices_are_the_stores_own_and_current(seeded):
    def snacks(store_id):
        page = store_page(seeded, store_id, aisle_id=_aisle_id(seeded, store_id, "Snacks y Dulces"))
        return {p["name"]: p for p in page["products"]}

    centro, norte = snacks(CENTRO), snacks(NORTE)

    # El precio es el de cada tienda, y el último: Centro bajó el suyo desde la corrida anterior ($1.790).
    assert centro["Papas fritas clásicas 180 g (prueba)"]["price_value"] == 1990
    assert centro["Papas fritas clásicas 180 g (prueba)"]["price"] == "$1.990"
    assert norte["Papas fritas clásicas 180 g (prueba)"]["price_value"] == 2090
    assert set(norte["Papas fritas clásicas 180 g (prueba)"]) == {
        "id", "entity_type", "entity_id", "name", "vertical", "concept", "price", "price_value", "before",
        "discount", "store", "img", "age_restricted", "store_id", "presentation",
    }  # fmt: skip
    papas = centro["Papas fritas clásicas 180 g (prueba)"]
    assert (papas["id"], papas["entity_type"], papas["entity_id"]) == ("cat-91001", "catalog_item", "91001")
    assert (papas["store"], papas["store_id"], papas["presentation"]) == (
        "Supermercado de prueba Centro",
        CENTRO,
        "180 g",
    )
    assert (papas["vertical"], papas["concept"], papas["age_restricted"]) == ("supermercado", "snacks-salados", False)

    # Ni la oferta de una corrida anterior ni la agotada aparecen en ningún pasillo.
    names = {p["name"] for p in all_products(seeded, CENTRO)}
    assert len(names) == 36
    assert not {n for n in names if "Atún" in n or "Mermelada" in n}
    # Lo +18 sigue marcado.
    beer = next(p for p in all_products(seeded, CENTRO) if p["entity_id"] == "94001")
    assert beer["age_restricted"] is True


def test_store_page_paginates_without_repeating_or_skipping(seeded):
    first = store_page(seeded, CENTRO)
    second = store_page(seeded, CENTRO, first["aisle"]["id"], page=2)

    assert first["aisle"]["name"] == "Despensa" and first["aisle"]["products"] == 30
    assert (len(first["products"]), first["page"], first["has_more"]) == (24, 1, True)
    assert (len(second["products"]), second["page"], second["has_more"]) == (6, 2, False)
    ids = [p["id"] for p in first["products"] + second["products"]]
    assert len(ids) == len(set(ids)) == 30
    names = [p["name"] for p in first["products"] + second["products"]]
    by_name = [name for (name,) in seeded.execute("SELECT n FROM unnest(%s::text[]) n ORDER BY n", (names,))]
    assert names == by_name  # el orden alfabético es el de la base, no el de Python
    assert store_page(seeded, CENTRO, first["aisle"]["id"], page=3)["products"] == []


def test_store_page_orders_products_with_the_same_name_by_id(seeded):
    """El catálogo repite nombres entre presentaciones: las páginas desempatan por producto, así ninguna repite ni se
    salta uno."""
    seeded.execute(
        """UPDATE catalog_items SET name = 'Producto repetido (prueba)'
           WHERE master_product_id IN (SELECT master_product_id FROM store_products
                                       WHERE store_id = %s AND aisle_id = 100)""",
        (CENTRO,),
    )

    first = store_page(seeded, CENTRO)
    second = store_page(seeded, CENTRO, first["aisle"]["id"], page=2)

    ids = [int(p["entity_id"]) for p in first["products"] + second["products"]]
    assert ids == sorted(ids) and len(set(ids)) == 30


def test_store_page_for_another_aisle_and_for_an_aisle_the_store_does_not_have(seeded):
    drinks = _aisle_id(seeded, CENTRO, "Bebidas")

    page = store_page(seeded, CENTRO, drinks)

    assert page["aisle"]["name"] == "Bebidas"
    assert sorted(p["name"] for p in page["products"]) == [
        "Gaseosa cola 1,5 L (prueba)",
        "Jugo de naranja 1 L (prueba)",
    ]
    assert page["has_more"] is False
    # Un pasillo sin ofertas vigentes (o de otra tienda) no trae productos.
    nothing = store_page(seeded, CENTRO, aisle_id=999_999)
    assert (nothing["aisle"], nothing["products"], nothing["has_more"]) == (None, [], False)
    assert len(nothing["aisles"]) == 5


def test_unknown_or_empty_store_is_404_with_spanish_detail(seeded, client):
    for store_id in (999_999, OLD_BRANCH, DISCOVERED, PIZZERIA):
        assert store_page(seeded, store_id) is None, store_id
        reply = client.get(f"/catalog/stores/{store_id}")
        assert reply.status_code == 404 and reply.json() == {"detail": NOT_IN_CATALOG}, store_id

    assert client.get("/catalog/stores/9223372036854775808").status_code == 404
    assert client.get("/catalog/stores/abc").status_code == 422
    assert client.get(f"/catalog/stores/{CENTRO}?page=0").status_code == 422


def test_product_detail_for_catalog_item_and_dish(seeded):
    papas = product_detail(seeded, "catalog_item", "91001")

    # La oferta vigente más barata de todas las tiendas: Centro ($1.990), no Norte ni Express ni Turbo.
    assert (papas["id"], papas["name"], papas["price_value"], papas["price"]) == (
        "cat-91001",
        "Papas fritas clásicas 180 g (prueba)",
        1990,
        "$1.990",
    )
    assert (papas["store"], papas["store_id"], papas["vertical"], papas["presentation"]) == (
        "Supermercado de prueba Centro",
        CENTRO,
        "supermercado",
        "180 g",
    )
    assert papas["img"] == "https://imagenes.prueba.invalid/productos/91001.png"

    pizza = product_detail(seeded, "menu_item", "98001")
    assert (pizza["id"], pizza["entity_type"], pizza["name"], pizza["price_value"]) == (
        "menu-98001",
        "menu_item",
        "Pizza pepperoni familiar (prueba)",
        12990,
    )
    assert (pizza["store"], pizza["store_id"], pizza["vertical"], pizza["presentation"]) == (
        "Pizzería de prueba Centro",
        PIZZERIA,
        "restaurantes",
        None,
    )


def test_product_detail_is_none_without_a_current_offer_or_for_nonsense_ids(seeded):
    for entity_type, entity_id in [
        ("catalog_item", "91201"),  # solo tiene una oferta de una corrida anterior
        ("catalog_item", "91202"),  # agotada
        ("catalog_item", "1"),
        ("catalog_item", "no-es-un-numero"),
        ("catalog_item", "99999999999999999999"),
        ("menu_item", "1"),
        ("store", "9101"),
    ]:
        assert product_detail(seeded, entity_type, entity_id) is None, (entity_type, entity_id)


def test_product_endpoint(client):
    papas = client.get("/catalog/products/catalog_item/91001")
    pizza = client.get("/catalog/products/menu_item/98001")

    assert papas.status_code == 200 and papas.json()["id"] == "cat-91001"
    assert pizza.status_code == 200 and pizza.json()["store_id"] == PIZZERIA
    for path in ("catalog_item/91201", "menu_item/1", "catalog_item/x", "store/9101"):
        reply = client.get(f"/catalog/products/{path}")
        assert reply.status_code == 404 and reply.json() == {"detail": "Este producto no está en el catálogo"}, path


def test_catalog_endpoints_accept_prototype_vertical_ids(client):
    backend = client.get("/catalog/verticals/supermercado/stores").json()
    prototype = client.get("/catalog/verticals/grocery/stores").json()

    assert prototype == backend
    assert backend["vertical"] == "supermercado"
    assert [card["id"] for card in backend["stores"]] == [CENTRO, NORTE]
    assert client.get("/catalog/verticals/express/stores").json()["vertical"] == "conveniencia"
    assert client.get("/catalog/verticals/liquor/stores?limit=1").json()["stores"][0]["id"] == 9401
    assert client.get("/catalog/verticals/restaurantes/stores").json() == {"vertical": "restaurantes", "stores": []}
    # `pet` es del prototipo y no tiene vertical en el catálogo.
    reply = client.get("/catalog/verticals/pet/stores")
    assert reply.status_code == 404 and reply.json() == {"detail": "Esta vertical no está en el catálogo"}
    assert client.get("/catalog/verticals/grocery/stores?limit=0").status_code == 422


def test_store_endpoint_returns_the_page(client):
    first = client.get(f"/catalog/stores/{CENTRO}").json()
    aisle = first["aisle"]["id"]
    second = client.get(f"/catalog/stores/{CENTRO}?aisle={aisle}&page=2").json()

    assert (len(first["products"]), first["has_more"]) == (24, True)
    assert (len(second["products"]), second["has_more"], second["page"]) == (6, False, 2)


def search_found(conn, query: str):
    """El producto que encuentra la búsqueda (la ruta de precios de /chat y /search) con el documento recién hecho."""
    build_search_documents(conn)
    return search_products(conn, "supermercado", query, None, None).products


def test_a_product_only_sold_in_a_store_that_cannot_be_opened_has_no_store_id(seeded):
    """Su oferta es de una tienda sin pasillos (de un CSV antiguo): «Ver tienda» no tendría adónde ir."""
    seeded.execute("INSERT INTO catalog_items (master_product_id, name) VALUES (91301, 'Yerba antigua (prueba)')")
    add_branch(seeded, 9105, "prueba_9105", with_aisle=False, product_id=91301, price=1500)

    detail = product_detail(seeded, "catalog_item", "91301")
    found = next(p for p in search_found(seeded, "yerba antigua") if p.entity_id == "91301").to_dict()

    for product in (detail, found):
        # El precio es el de la oferta vigente más barata, como siempre; el nombre de la tienda también.
        assert (product["store_id"], product["store"], product["price_value"]) == (
            None,
            "Sucursal de prueba 9105",
            1500,
        )
    assert detail["vertical"] == "supermercado"


def test_a_product_sold_cheaper_in_a_store_that_cannot_be_opened_points_to_one_that_can(seeded, client):
    add_branch(seeded, 9105, "prueba_9105", with_aisle=False, product_id=91001, price=990)  # más barata que 1.990

    detail = product_detail(seeded, "catalog_item", "91001")
    found = next(p for p in search_found(seeded, "papas fritas") if p.entity_id == "91001").to_dict()

    for product in (detail, found):
        # El precio sigue siendo el más barato (990); la tienda es la más barata de las que se abren.
        assert product["price_value"] == 990
        assert (product["store_id"], product["store"]) == (CENTRO, "Supermercado de prueba Centro")
        assert client.get(f"/catalog/stores/{product['store_id']}").status_code == 200
    assert client.get("/catalog/products/catalog_item/91001").json()["store_id"] == CENTRO


def test_the_store_id_of_a_product_is_the_cheapest_store_when_it_can_be_opened(seeded):
    detail = product_detail(seeded, "catalog_item", "91001")
    found = next(p for p in search_found(seeded, "papas fritas") if p.entity_id == "91001").to_dict()

    assert (detail["store_id"], detail["price_value"]) == (CENTRO, 1990)
    assert (found["store_id"], found["price_value"]) == (CENTRO, 1990)


def test_search_products_carry_the_store_and_presentation(seeded):
    products = search_products(seeded, "supermercado", "papas fritas", None, None).products

    papas = next(p for p in products if p.entity_id == "91001").to_dict()
    assert (papas["store_id"], papas["presentation"]) == (CENTRO, "180 g")


def _aisle_id(conn, store_id: int, name: str) -> int:
    return next(a["id"] for a in store_page(conn, store_id)["aisles"] if a["name"] == name)
