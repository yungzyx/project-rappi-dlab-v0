import csv

import pytest
from psycopg import errors

from rappi_scraper.legacy.csv_format import CSV_COLUMNS, CSV_ENCODING
from rappi_scraper.legacy.csv_io import export_catalog_csv, import_legacy_csv
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
