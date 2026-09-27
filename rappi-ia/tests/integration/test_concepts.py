"""`build_concepts` contra `rappi_ia_test`: carga la taxonomía y asigna conceptos con procedencia."""

from conftest import add_dish, add_product, add_store
from rappi_ia.concepts.pipeline import build_concepts
from rappi_ia.concepts.report import coverage_report


def _seed(db):
    add_store(db, 1, "licores", "Botillería")
    add_store(db, 2, "restaurantes", "Pizzería")
    add_product(db, 100, "Cerveza Escudo 350 cc", 1, "Cervezas")
    add_product(db, 101, "Papas Lays Clásicas 180 g", 1, "Snacks salados")
    add_product(db, 102, "Producto sin pistas", 1)
    add_dish(db, 500, "Pizza pepperoni familiar", 2, "Pizzas", ["Pizzas"])
    add_dish(db, 501, "Especial de la casa", 2, "Pizzas", ["Pizzas"])
    db.commit()


def test_build_concepts_assigns_with_provenance(db):
    _seed(db)
    counts = build_concepts(db)

    assert counts["productos_con_concepto"] == 2 and counts["platos_con_concepto"] == 2
    rows = dict(
        db.execute(
            "SELECT entity_id, concept_id || '|' || method || '|' || source FROM item_concepts ORDER BY 1"
        ).fetchall()
    )
    assert rows["100"] == "cerveza|llm|categoria:Cervezas"
    assert rows["101"] == "snacks-salados|llm|categoria:Snacks salados"
    assert rows["500"].lower() == "pizza|regla|nombre:pizza"
    assert rows["501"].startswith("pizza|llm|")  # por la sección o la cocina "Pizzas"
    assert "102" not in rows
    assert db.execute("SELECT count(*) FROM concept_edges WHERE method = 'curado'").fetchone()[0] > 50


def test_build_concepts_is_idempotent_and_drops_stale_rules(db):
    _seed(db)
    build_concepts(db)
    db.execute(
        "UPDATE catalog_items SET name = 'Producto renombrado', category_id = NULL WHERE master_product_id = 101"
    )
    db.commit()

    build_concepts(db)

    ids = [r[0] for r in db.execute("SELECT entity_id FROM item_concepts ORDER BY 1")]
    assert ids == ["100", "500", "501"]


def test_coverage_report_by_vertical(db):
    _seed(db)
    build_concepts(db)
    report = coverage_report(db)
    assert report["totales"]["catalog_item"] == {"total": 3, "mapped": 2, "pct": 66.7}
    assert report["por_vertical"]["licores"]["mapped"] == 2
    assert report["por_vertical"]["restaurantes"] == {"total": 2, "mapped": 2, "pct": 100.0}
