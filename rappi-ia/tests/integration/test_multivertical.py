"""Mapa multivertical de la presentación: qué productos y conceptos comparten las verticales (rappi_ia_test)."""

import json
import re

from rappi_scraper.storage.search import build_search_documents

from conftest import add_dish, add_product, add_store
from rappi_ia.analytics import multivertical
from rappi_ia.concepts.pipeline import build_concepts


def _catalog(db):
    add_store(db, 1, "supermercado", "Unimarc")
    add_store(db, 2, "licores", "Botillería")
    add_store(db, 3, "conveniencia", "Unimarc")  # la misma cadena en Express
    add_store(db, 4, "restaurantes", "Sanguchería")
    add_product(db, 100, "Cerveza Escudo Lata 470 cc", 1, "Cervezas")
    for store in (2, 3):  # la misma cerveza también en Licores y Express
        db.execute(
            "INSERT INTO store_products (store_id, sku, master_product_id) VALUES (%s, %s, 100)", (store, f"b{store}")
        )
    add_product(db, 101, "Papas fritas Lays 180 g", 1, "Snacks salados")
    add_product(db, 102, "Cerveza Kunstmann Torobayo", 2, "Cervezas")
    add_product(db, 103, "Agua mineral Cachantun 1,6 L", 3, "Aguas")
    add_dish(db, 500, "Hamburguesa clásica", 4, "Hamburguesas")
    db.commit()
    build_search_documents(db)
    build_concepts(db)


def test_collect_counts_products_shared_between_verticals(db):
    _catalog(db)
    data = multivertical.collect(db)

    shared = {(a, b): n for a, b, n in data["shared"]}
    assert shared == {
        ("conveniencia", "licores"): 1,
        ("conveniencia", "supermercado"): 1,
        ("licores", "supermercado"): 1,
    }
    assert dict(data["spread"]) == {1: 3, 3: 1}  # 3 productos en una vertical, la cerveza en tres
    assert data["products"]["restaurantes"] == 1  # los platos se cuentan aparte: no se comparten
    beer = next(c for c in data["concepts"] if c["id"] == "cerveza")
    assert beer["home"] == "licores" and beer["items"]["supermercado"] == 1
    assert [name for name, *_ in data["bridges"]] == []  # ninguno llega a 5 verticales
    assert data["chains"] == [["Unimarc", ["supermercado", "conveniencia"], 2]]  # 2+ verticales, en orden del mapa


def test_render_embeds_the_data_in_a_self_contained_page(db):
    _catalog(db)
    page = multivertical.render(multivertical.collect(db))

    assert "/*__DATA__*/" not in page
    data = json.loads(re.search(r"const DATA = (\{.*?\});\n", page, re.S).group(1))
    assert data["catalogTotal"] == 4
    assert not re.search(r"""<(script|link)[^>]+(src|href)=["']https?://""", page)  # funciona sin internet
