"""Capa de perfiles (docs/superpowers/specs/2026-10-06-capa-perfiles-design.md) contra `rappi_ia_test`."""

from conftest import add_dish, add_product, add_store
from rappi_ia.layers.measures import build_measures
from rappi_ia.layers.runs import finish_layer_run, start_layer_run


def test_layer_run_is_recorded(db):
    run = start_layer_run(db, "measures", "2026-10-06")
    finish_layer_run(db, run, {"items": 3})

    status, counts, finished = db.execute(
        "SELECT status, counts, finished_at FROM layer_runs WHERE run_id = %s", (run,)
    ).fetchone()
    assert status == "done" and counts == {"items": 3} and finished is not None


def test_a_failed_layer_run_keeps_its_status(db):
    run = start_layer_run(db, "attributes", "2026-10-06")
    finish_layer_run(db, run, {}, status="failed")
    assert db.execute("SELECT status FROM layer_runs WHERE run_id = %s", (run,)).fetchone()[0] == "failed"


def test_capa_schema_exists(db):
    assert db.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = 'capa'").fetchone()


def _measure_catalog(db):
    add_store(db, 1, "supermercado")
    add_store(db, 2, "restaurantes")
    add_product(db, 10, "Coca-Cola 3 L", 1, "Gaseosas")
    add_product(db, 11, "Cerveza Cristal 6 x 350 ml", 1, "Cervezas")
    db.execute(
        "UPDATE catalog_items SET quantity = 1, unit_type = 'und', presentation = '1Und' WHERE master_product_id = 10"
    )
    db.execute(
        "UPDATE catalog_items SET quantity = 350, unit_type = 'ml', presentation = '6 X 350 mL'"
        " WHERE master_product_id = 11"
    )
    add_dish(db, 500, "Pizza Familiar", 2, "Pizzas")
    db.commit()


def test_build_measures_fills_products_and_dishes_and_is_idempotent(db):
    _measure_catalog(db)

    first = build_measures(db)
    rows = db.execute(
        "SELECT entity_type, entity_id, unit, pack, total, size_label FROM item_measures ORDER BY 1, 2"
    ).fetchall()
    second = build_measures(db)

    assert first == {"productos": 2, "platos": 1, "corregidos": 1}
    assert rows == [
        ("catalog_item", "10", "ml", 1, 3000.0, None),
        ("catalog_item", "11", "ml", 6, 2100.0, None),
        ("menu_item", "500", None, 1, None, "familiar"),
    ]
    assert second == first
    assert db.execute("SELECT count(*) FROM item_measures").fetchone()[0] == 3
    assert db.execute("SELECT count(*) FROM layer_runs WHERE layer = 'measures'").fetchone()[0] == 2
