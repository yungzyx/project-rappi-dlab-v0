import csv

import pytest
from psycopg import errors

from conftest import FakeClient
from rappi_scraper.legacy.csv_format import CSV_COLUMNS, CSV_ENCODING
from rappi_scraper.legacy.csv_io import export_catalog_csv, import_legacy_csv
from rappi_scraper.pipeline.restaurants import process_restaurant_jobs
from rappi_scraper.scraping.restaurant_parser import parse_restaurant
from rappi_scraper.storage import repository
from rappi_scraper.storage.db import connect, database_url
from rappi_scraper.storage.search import SEARCH_DOCUMENTS_LOCK, build_search_documents, search


def _product(sku, master_id, name, price, **extra):
    return {
        "product_id": sku,
        "master_product_id": master_id,
        "name": name,
        "price": price,
        "real_price": price,
        "category_id": 76,
        "category_name": "Pañales",
        "trademark": "Babysec",
        "presentation": "1 x 40 Und",
        "in_stock": True,
        **extra,
    }


def _store(conn, store_id, store_type, vertical, brand=("Lider", 12216)):
    repository.upsert_store(
        conn,
        {
            "store_id": store_id,
            "name": brand[0],
            "brand_id": brand[1],
            "brand_name": brand[0],
            "store_type": store_type,
            "city": "Santiago",
        },
    )
    repository.upsert_store_vertical(conn, store_id, vertical)


def _count(conn, sql):
    return conn.execute(sql).fetchone()[0]


def test_save_products_is_idempotent_and_keeps_price_history(db):
    _store(db, 1, "lider", "supermercado")
    run1 = repository.start_run(db, "stores", {})
    repository.save_products(db, run1, 1, [_product("a", 100, "Pañal Babysec G", 9990)])
    repository.save_products(db, run1, 1, [_product("a", 100, "Pañal Babysec G", 9990)])  # reintento
    run2 = repository.start_run(db, "stores", {})
    repository.save_products(db, run2, 1, [_product("a", 100, "Pañal Babysec G", 8990)])
    db.commit()

    assert _count(db, "SELECT count(*) FROM catalog_items") == 1
    assert _count(db, "SELECT count(*) FROM store_products") == 1
    assert _count(db, "SELECT count(*) FROM price_snapshots") == 2
    assert _count(db, "SELECT diferencia FROM v_price_changes") == -1000


def test_same_master_product_in_two_chains_is_one_catalog_item(db):
    _store(db, 1, "lider", "supermercado")
    _store(db, 2, "turbo", "turbo", brand=("Turbo", 999))
    run = repository.start_run(db, "stores", {})
    repository.save_products(db, run, 1, [_product("a", 100, "Coca-Cola 1,5 L", 1990)])
    repository.save_products(db, run, 2, [_product("zz", 100, "Coca-Cola 1,5 L", 2290)])
    db.commit()

    assert _count(db, "SELECT count(*) FROM catalog_items") == 1
    assert _count(db, "SELECT n_verticales FROM v_cross_vertical_items") == 2
    assert _count(db, "SELECT count(*) FROM v_price_compare") == 2


def test_vertical_membership_is_shared_by_store_type(db):
    _store(db, 1, "lider", "supermercado")
    _store(db, 2, "lider", "conveniencia")  # otra sucursal del mismo formato, en otro listado
    run = repository.start_run(db, "stores", {})
    repository.save_products(db, run, 1, [_product("a", 100, "Arroz", 1500)])
    db.commit()

    verticals = {r[0] for r in db.execute("SELECT vertical FROM v_item_verticals")}
    assert verticals == {"supermercado", "conveniencia"}


def test_store_vertical_upsert_twice_without_filters(db):
    _store(db, 1, "lider", "mall")
    repository.upsert_store_vertical(db, 1, "mall", "Hogar")  # segunda vez, sin filtros
    repository.upsert_store_vertical(db, 1, "mall", "", "", ["Moda"])
    db.commit()

    assert db.execute("SELECT subvertical, filters FROM store_verticals").fetchone() == ("Hogar", ["Moda"])


def test_stores_without_store_type_do_not_share_verticals(db):
    for store_id, vertical in ((1, "mall"), (2, "licores")):
        repository.upsert_store(db, {"store_id": store_id, "name": f"T{store_id}", "store_type": ""})
        repository.upsert_store_vertical(db, store_id, vertical)
    db.commit()

    rows = db.execute("SELECT store_id, vertical FROM v_store_verticals ORDER BY store_id").fetchall()
    assert rows == [(1, "mall"), (2, "licores")]


def test_restaurants_do_not_share_verticals_through_their_store_type(db):
    """Rappi manda storeType 'restaurant' para todos los restaurantes (tests/fixtures/restaurant.html): no es un
    formato. El cruce armaba 13 millones de filas con 3.604 restaurantes y le pasaría a todos el vertical de uno."""
    for store_id in (1, 2):
        repository.upsert_store(db, {"store_id": store_id, "name": f"R{store_id}", "store_type": "restaurant"})
        repository.upsert_store_vertical(db, store_id, "restaurantes")
    repository.upsert_store_vertical(db, 1, "chocolateria")
    db.commit()

    rows = db.execute("SELECT store_id, vertical FROM v_store_verticals ORDER BY 1, 2").fetchall()
    assert rows == [(1, "chocolateria"), (1, "restaurantes"), (2, "restaurantes")]


def test_search_is_isolated_per_vertical(db, page):
    _store(db, 1, "lider", "supermercado")
    run = repository.start_run(db, "stores", {})
    repository.save_products(db, run, 1, [_product("a", 100, "Pañales Babysec Premium G", 9990)])
    restaurant = parse_restaurant(page("restaurant"))
    repository.save_restaurant(db, run, restaurant)
    db.commit()

    counts = build_search_documents(db)
    db.commit()

    assert counts["catalog_item"] == 1 and counts["menu_item"] == 61
    assert search(db, "supermercado", "pañales")
    assert search(db, "restaurantes", "pañales") == []
    assert search(db, "restaurantes", "arepa")
    assert search(db, "supermercado", "arepa") == []
    assert _count(db, "SELECT count(*) FROM search_documents WHERE vertical IS NULL") == 0


def test_search_documents_mark_products_that_need_a_prescription(db):
    """Rappi marca `requires_medical_prescription`: Bigotes no los muestra cuando se habla de síntomas."""
    _store(db, 1, "cruzverde", "farmacia")
    run = repository.start_run(db, "stores", {})
    repository.save_products(
        db,
        run,
        1,
        [
            _product("a", 100, "Amoxicilina 500 mg", 3990, requires_medical_prescription=True),
            _product("b", 101, "Paracetamol 500 mg", 990, requires_medical_prescription=False),
        ],
    )
    build_search_documents(db)
    rows = db.execute(
        "SELECT entity_id, metadata->'receta' FROM search_documents WHERE entity_type = 'catalog_item' ORDER BY 1"
    ).fetchall()
    assert rows == [("100", True), ("101", None)]


EMBEDDED_ITEMS = "SELECT count(*) FROM search_documents WHERE embedding IS NOT NULL AND entity_type = 'catalog_item'"


def test_rebuilding_search_keeps_embedding_only_if_text_unchanged(db):
    _store(db, 1, "lider", "supermercado")
    run = repository.start_run(db, "stores", {})
    repository.save_products(db, run, 1, [_product("a", 100, "Arroz Tucapel", 1500)])
    db.commit()
    build_search_documents(db)
    db.execute("UPDATE search_documents SET embedding = '[1,2,3]', embedding_model = 'test'")

    repository.save_products(db, run, 1, [_product("a", 100, "Arroz Tucapel", 1700)])  # solo precio
    build_search_documents(db)
    assert _count(db, EMBEDDED_ITEMS) == 1

    repository.save_products(db, run, 1, [_product("a", 100, "Arroz Tucapel Grado 1", 1700)])  # texto
    build_search_documents(db)
    assert _count(db, EMBEDDED_ITEMS) == 0


def test_rebuilding_search_writes_only_changes_and_drops_missing_entities(db):
    _store(db, 1, "lider", "supermercado")
    run = repository.start_run(db, "stores", {})
    repository.save_products(
        db, run, 1, [_product("a", 100, "Arroz Tucapel", 1500), _product("b", 101, "Té Club", 900)]
    )
    db.commit()
    assert build_search_documents(db)["escritos"] == 3  # 2 productos + la tienda
    db.commit()

    unchanged = build_search_documents(db)  # sin cambios: no reescribe filas (ni sus entradas en los índices)
    assert (unchanged["catalog_item"], unchanged["escritos"], unchanged["eliminados"]) == (2, 0, 0)

    db.execute("DELETE FROM store_products WHERE master_product_id = 101")
    db.execute("DELETE FROM catalog_items WHERE master_product_id = 101")
    assert build_search_documents(db)["eliminados"] == 1
    assert _count(db, "SELECT count(*) FROM search_documents WHERE entity_type = 'catalog_item'") == 1


DOCUMENTS = (
    "SELECT entity_type, entity_id, (metadata->>'precio_min')::int, (metadata->>'tiendas')::int "
    "FROM search_documents ORDER BY 1, 2"
)


def test_search_keeps_only_the_offers_seen_in_the_last_run_of_their_store_type(db):
    """Cada corrida baja una sucursal por formato, y no siempre la misma: la sucursal vieja no pone el precio mínimo,
    no suma tiendas y lo que solo ella vendía ya no se busca."""
    _store(db, 1, "lider", "supermercado")  # sucursal A
    _store(db, 2, "lider", "supermercado")  # sucursal B, mismo formato
    run1 = repository.start_run(db, "stores", {})
    repository.save_products(
        db, run1, 1, [_product("s1", 100, "Arroz Tucapel", 100), _product("s2", 101, "Té Club", 900)]
    )
    run2 = repository.start_run(db, "stores", {})
    repository.save_products(db, run2, 2, [_product("s1", 100, "Arroz Tucapel", 200)])
    db.commit()

    build_search_documents(db)

    assert db.execute(DOCUMENTS).fetchall() == [("catalog_item", "100", 200, 1), ("store", "2", None, None)]


def test_a_product_the_store_no_longer_sells_leaves_the_search(db):
    _store(db, 1, "lider", "supermercado")
    run1 = repository.start_run(db, "stores", {})
    repository.save_products(
        db, run1, 1, [_product("s1", 100, "Arroz Tucapel", 100), _product("s2", 101, "Té Club", 900)]
    )
    run2 = repository.start_run(db, "stores", {})
    repository.save_products(db, run2, 1, [_product("s1", 100, "Arroz Tucapel", 120)])
    db.commit()

    build_search_documents(db)

    assert db.execute(DOCUMENTS).fetchall() == [("catalog_item", "100", 120, 1), ("store", "1", None, None)]


def test_a_store_type_missing_from_the_last_run_keeps_its_last_known_offers(db):
    """Un formato que la última corrida no pudo bajar (falló, o no salió en los listados) conserva su último dato."""
    _store(db, 1, "lider", "supermercado")
    _store(db, 2, "jumbo", "supermercado", brand=("Jumbo", 1))
    run1 = repository.start_run(db, "stores", {})
    repository.save_products(db, run1, 2, [_product("j1", 200, "Fideos Carozzi", 900)])
    run2 = repository.start_run(db, "stores", {})
    repository.save_products(db, run2, 1, [_product("s1", 100, "Arroz Tucapel", 100)])
    db.commit()

    build_search_documents(db)

    assert [r[:2] for r in db.execute(DOCUMENTS)] == [
        ("catalog_item", "100"), ("catalog_item", "200"), ("store", "1"), ("store", "2")
    ]  # fmt: skip


def test_a_dish_the_restaurant_no_longer_offers_leaves_the_search(db, page):
    parsed = parse_restaurant(page("restaurant"))
    run1 = repository.start_run(db, "restaurants", {})
    repository.save_restaurant(db, run1, parsed)
    run2 = repository.start_run(db, "restaurants", {})
    repository.save_restaurant(db, run2, {**parsed, "items": parsed["items"][1:]})
    db.commit()

    build_search_documents(db)

    dishes = {r[0] for r in db.execute("SELECT entity_id FROM search_documents WHERE entity_type = 'menu_item'")}
    assert len(dishes) == 60 and str(parsed["items"][0]["item_id"]) not in dishes


def test_a_restaurant_that_no_longer_exists_leaves_the_search(db):
    """chain:7386 («Kazoku Nh») quedó «ya no existe en Rappi» en la corrida 6 y sus 94 platos seguían buscables."""
    candidate = {"store_id": 384, "path": "/restaurantes/384-rincon-venezolano"}
    job = {
        "job_key": "chain:3607",
        "job_type": "restaurant",
        "payload": {"verticals": ["restaurantes"], "brand_id": 3607, "candidates": [candidate]},
    }
    for client in (FakeClient({candidate["path"]: "restaurant"}), FakeClient(gone={candidate["path"]})):
        run = repository.start_run(db, "restaurants", {})
        repository.add_jobs(db, run, [job])
        process_restaurant_jobs(db, client, run)
        repository.finish_run(db, run)
    assert [r[0] for r in db.execute("SELECT status FROM scrape_jobs ORDER BY run_id")] == ["done", "skipped"]

    build_search_documents(db)

    assert _count(db, "SELECT count(*) FROM search_documents WHERE vertical = 'restaurantes'") == 0


def test_job_queue_resume_and_done_store_types(db):
    run = repository.start_run(db, "stores", {})
    jobs = [
        {
            "job_key": "type:lider",
            "job_type": "store_group",
            "payload": {"verticals": ["supermercado"], "candidates": []},
        },
        {"job_key": "id:9", "job_type": "store_group", "payload": {"verticals": ["mall"], "candidates": []}},
    ]
    repository.add_jobs(db, run, jobs)
    repository.add_jobs(db, run, jobs)  # descubrir de nuevo no duplica
    repository.mark_job(db, run, "type:lider", "done", {"store_type": "lider"})

    assert [j["job_key"] for j in repository.pending_jobs(db, run, "store_group")] == ["id:9"]
    assert repository.pending_jobs(db, run, "store_group", "supermercado") == []
    assert repository.store_types_done(db, run) == {"lider"}
    assert set(repository.pending_payloads(db, run, "store_group")) == {"id:9"}
    assert repository.open_run(db, "stores") == run


def test_import_legacy_csv(db, tmp_path):
    path = tmp_path / "products_lider_santiago.csv"
    with path.open("w", newline="", encoding=CSV_ENCODING) as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for sku, master in (("1", 10), ("2", 10), ("3", 11)):
            writer.writerow(
                {c: "" for c in CSV_COLUMNS}
                | {
                    "store_id": "5",
                    "tienda": "Lider",
                    "ciudad": "Santiago",
                    "direccion": "x",
                    "sku": sku,
                    "master_product_id": str(master),
                    "nombre": f"P{master}",
                    "precio": "1000",
                    "precio_normal": "1200",
                    "en_stock": "True",
                }
            )

    _, total = import_legacy_csv(db, tmp_path)

    assert total == 3
    assert _count(db, "SELECT count(*) FROM catalog_items") == 2
    assert float(_count(db, "SELECT discount_pct FROM price_snapshots WHERE sku = '1'")) == 16.7


def _legacy_csv(folder, **row):
    """Un CSV del scraper original con una fila de la tienda 1 (Lider), del 24-09."""
    defaults = {"fecha_scraping": "2026-09-24", "store_id": "1", "tienda": "Lider", "ciudad": "Santiago",
                "direccion": "x", "en_stock": "True"}  # fmt: skip
    with (folder / "products_lider_santiago.csv").open("w", newline="", encoding=CSV_ENCODING) as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerow({c: "" for c in CSV_COLUMNS} | defaults | row)


def test_legacy_import_keeps_the_category_rappi_already_named(db, tmp_path):
    """929 productos del CSV del 24-09 quedaron sin categoría: el CSV trae el nombre y no el id."""
    _store(db, 1, "lider", "supermercado")
    run = repository.start_run(db, "stores", {})
    galletas = {"category_id": 123, "category_name": "Galletas"}
    repository.save_products(db, run, 1, [_product("a", 100, "Galleta Tritón", 990, **galletas)])
    _legacy_csv(
        tmp_path, store_id="5", sku="b", master_product_id="906357", nombre="Galleta Club Social", categoria="Galletas"
    )  # una tienda que solo está en el CSV

    import_legacy_csv(db, tmp_path)
    build_search_documents(db)

    assert _count(db, "SELECT category_id FROM catalog_items WHERE master_product_id = 906357") == 123
    assert "Categoría: Galletas" in _count(db, "SELECT content FROM search_documents WHERE entity_id = '906357'")


def test_legacy_import_keeps_the_date_of_the_csv_so_it_does_not_replace_newer_prices(db, tmp_path):
    _store(db, 1, "lider", "supermercado")
    run = repository.start_run(db, "stores", {})
    repository.save_products(db, run, 1, [_product("a", 100, "Arroz Tucapel", 1500)])
    _legacy_csv(tmp_path, sku="a", master_product_id="100", nombre="Arroz Tucapel", precio="1000")

    import_legacy_csv(db, tmp_path)
    build_search_documents(db)

    assert str(_count(db, "SELECT min(scraped_at)::date FROM price_snapshots")) == "2026-09-24"
    assert _count(db, "SELECT (metadata->>'precio_min')::int FROM search_documents WHERE entity_id = '100'") == 1500


def test_importing_the_same_legacy_csv_twice_keeps_every_offer_current(db, tmp_path):
    """Las dos importaciones guardan los precios con la misma fecha (la del CSV): el último precio se elegía sin
    desempate y no coincidía con la corrida que la vigencia toma por última (v_store_format_runs desempata por
    run_id), así que la mitad de las ofertas salía de la búsqueda al azar."""
    defaults = {"fecha_scraping": "2026-09-24", "store_id": "5", "tienda": "Lider", "ciudad": "Santiago",
                "direccion": "x", "en_stock": "True", "precio": "1000"}  # fmt: skip
    with (tmp_path / "products_lider_santiago.csv").open("w", newline="", encoding=CSV_ENCODING) as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for i in range(40):
            product = {"sku": f"s{i}", "master_product_id": str(1000 + i), "nombre": f"Producto {i}"}
            writer.writerow({c: "" for c in CSV_COLUMNS} | defaults | product)

    import_legacy_csv(db, tmp_path)
    import_legacy_csv(db, tmp_path)
    build_search_documents(db)

    assert _count(db, "SELECT count(*) FROM search_documents WHERE entity_type = 'catalog_item'") == 40


def test_zero_stock_is_kept_but_zero_ids_are_not(db):
    _store(db, 1, "lider", "supermercado")
    run = repository.start_run(db, "stores", {})
    repository.save_products(db, run, 1, [_product("a", 100, "Arroz", 1500, stock=0, category_id=0)])
    db.commit()

    assert _count(db, "SELECT stock FROM price_snapshots") == 0
    assert _count(db, "SELECT category_id FROM catalog_items") is None


def test_export_catalog_csv(db, tmp_path):
    _store(db, 1, "lider", "supermercado")
    run = repository.start_run(db, "stores", {})
    repository.save_products(db, run, 1, [_product("a", 100, "Pañales Babysec", 9990)])
    db.commit()

    target = export_catalog_csv(db, tmp_path / "catalogo.csv")

    with target.open(encoding=CSV_ENCODING) as f:
        rows = list(csv.DictReader(f))
    assert [(r["vertical"], r["nombre"], r["categoria"]) for r in rows] == [
        ("supermercado", "Pañales Babysec", "Pañales")
    ]


def test_search_ignores_accents_both_ways(db):
    _store(db, 1, "lider", "supermercado")
    run = repository.start_run(db, "stores", {})
    repository.save_products(
        db,
        run,
        1,
        [_product("a", 100, "Café Molido Colombiano", 4990), _product("b", 101, "Jamon Serrano", 5990)],
    )
    db.commit()
    build_search_documents(db)

    assert [h["entity_id"] for h in search(db, "supermercado", "cafe") if h["entity_type"] == "catalog_item"] == ["100"]
    assert [h["entity_id"] for h in search(db, "supermercado", "jamón") if h["entity_type"] == "catalog_item"] == [
        "101"
    ]


def test_rebuilding_search_takes_the_documents_lock(db):
    """rappi-ia no copia vectores mientras se reescriben los documentos (la corrida ya figura 'done'): si alguien
    tiene el candado, la reescritura espera."""
    _store(db, 1, "lider", "supermercado")
    run = repository.start_run(db, "stores", {})
    repository.save_products(db, run, 1, [_product("a", 100, "Arroz Tucapel", 1500)])
    db.commit()
    with connect(database_url("DATABASE_URL_TEST")) as other:
        other.execute("SELECT pg_advisory_xact_lock(%s)", (SEARCH_DOCUMENTS_LOCK,))
        db.execute("SET lock_timeout = '200ms'")
        with pytest.raises(errors.LockNotAvailable):
            build_search_documents(db)
        db.rollback()
        other.rollback()
    assert build_search_documents(db)["catalog_item"] == 1


def test_search_documents_carry_no_html_from_descriptions(db):
    """~430 descripciones traen <p> y entidades (&iacute;, &nbsp;): entraban al índice, al vector y a Bigotes."""
    _store(db, 1, "lider", "supermercado")
    run = repository.start_run(db, "stores", {})
    html = "<p>Prote&iacute;na neutra&nbsp;Nutri &amp; Co &#8211; 1&nbsp;kg</p><br/>"
    repository.save_products(db, run, 1, [_product("a", 100, "Proteína Nutri", 9990, description=html)])
    db.commit()
    build_search_documents(db)

    content = db.execute("SELECT content FROM search_documents WHERE entity_id = '100'").fetchone()[0]
    assert content.endswith("Proteína neutra Nutri & Co – 1 kg")
    assert "<" not in content and "&iacute;" not in content and "&nbsp;" not in content
    assert search(db, "supermercado", "neutra")


def test_clean_html_leaves_plain_text_untouched(db):
    """Solo cambian las descripciones con HTML: si normalizara todo, miles de documentos cambiarían de hash y se
    volverían a embeber sin motivo."""
    plain = "Arroz grado 1.\nIdeal  para  guisos"
    assert db.execute("SELECT clean_html(%s)", (plain,)).fetchone()[0] == plain
    assert db.execute("SELECT clean_html('Salsa &amp;lt; picante')").fetchone()[0] == "Salsa &lt; picante"
    assert db.execute("SELECT clean_html(%s)", ("un sueño <b>profundo</b>, sin ruido",)).fetchone()[0] == (
        "un sueño profundo, sin ruido"
    )


def test_clean_html_knows_the_entities_found_after_the_first_run(db):
    """Tras la primera limpieza (30-09) quedaban &ccedil; («Açaí») y &ordm; en el catálogo real."""
    assert db.execute("SELECT clean_html('A&ccedil;aí 1&ordm; calidad')").fetchone()[0] == "Açaí 1º calidad"


def test_product_names_are_cleaned_too(db):
    """Un nombre real: «Basurero de Metal Con Pedal <ul> <li>tie» (el HTML también llega al nombre)."""
    _store(db, 1, "lider", "supermercado")
    run = repository.start_run(db, "stores", {})
    repository.save_products(db, run, 1, [_product("a", 100, "Basurero de Metal Con Pedal <ul> <li>tie", 9990)])
    db.commit()
    build_search_documents(db)

    content = db.execute("SELECT content FROM search_documents WHERE entity_id = '100'").fetchone()[0]
    assert content.startswith("Basurero de Metal Con Pedal tie. Marca:")


def test_filler_menu_prices_are_unknown_in_search(db):
    """Un plato cuyo precio depende de sus opciones viene a $0 o $1 («Completo Dinamico»): como precio pasaba
    cualquier tope. En la búsqueda queda sin precio; uno real se conserva."""
    _store(db, 3, "restaurant", "restaurantes", brand=("Lo de Anita", 900))
    run = repository.start_run(db, "restaurants", {})
    for item_id, name, price in [
        (1, "Completo Dinamico", 0),
        (2, "Elige Tu Bebida Favorita", 1),
        (3, "Completo", 2500),
    ]:
        db.execute("INSERT INTO menu_items (item_id, store_id, name) VALUES (%s, 3, %s)", (item_id, name))
        db.execute(
            "INSERT INTO menu_price_snapshots (run_id, item_id, price, real_price) VALUES (%s, %s, %s, %s)",
            (run, item_id, price, price),
        )
    db.commit()
    build_search_documents(db)

    rows = db.execute(
        "SELECT entity_id, metadata ? 'precio', price_min FROM search_documents WHERE entity_type = 'menu_item'"
    ).fetchall()
    assert sorted(rows) == [("1", False, None), ("2", False, None), ("3", True, 2500)]
