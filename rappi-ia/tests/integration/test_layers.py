"""Capa de perfiles (docs/superpowers/specs/2026-10-06-capa-perfiles-design.md) contra `rappi_ia_test`."""

from rappi_scraper.storage.search import build_search_documents

from conftest import add_dish, add_price, add_product, add_store
from rappi_ia.concepts.pipeline import build_concepts
from rappi_ia.layers import attributes as attributes_layer
from rappi_ia.layers.attributes import build_attributes
from rappi_ia.layers.brands import build_brands
from rappi_ia.layers.measures import build_measures
from rappi_ia.layers.report import layer_report
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

    assert first == {"productos": 2, "platos": 1, "corregidos": 1, "sospechosas": 0}
    assert rows == [
        ("catalog_item", "10", "ml", 1, 3000.0, None),
        ("catalog_item", "11", "ml", 6, 2100.0, None),
        ("menu_item", "500", None, 1, None, "familiar"),
    ]
    assert second == first
    assert db.execute("SELECT count(*) FROM item_measures").fetchone()[0] == 3
    assert db.execute("SELECT count(*) FROM layer_runs WHERE layer = 'measures'").fetchone()[0] == 2


def _attribute_catalog(db):
    add_store(db, 1, "supermercado")
    items = [
        (20, "Pan de molde", "Panes", 3000, '{"gluten_free": true}'),
        (21, "Leche sin lactosa 1 L", "Leches", 1000, "{}"),
        (22, "Leche entera 1 L", "Leches", 2000, "{}"),
        (23, "Leche descremada 1 L", "Leches", 3000, "{}"),
        (24, "Leche semidescremada 1 L", "Leches", 9000, "{}"),
    ]
    for pid, name, category, price, attrs in items:
        add_product(db, pid, name, 1, category)
        add_price(db, 1, pid, price)
        db.execute("UPDATE catalog_items SET attributes = %s::jsonb WHERE master_product_id = %s", (attrs, pid))
    db.execute("UPDATE price_snapshots SET real_price = 3600, discount_pct = 17 WHERE sku = 'sku-20'")
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    build_measures(db)


def _attrs(db):
    rows = db.execute("SELECT entity_id, attribute_id, source FROM item_attributes ORDER BY 1, 2").fetchall()
    return {(i, a): s for i, a, s in rows}


def test_build_attributes_from_rappi_text_and_prices(db, monkeypatch):
    monkeypatch.setattr(attributes_layer, "MIN_CONCEPT_ITEMS_FOR_PRICE", 4)  # la base de prueba es chica
    _attribute_catalog(db)

    build_attributes(db)
    found = _attrs(db)

    assert found[("20", "sin-gluten")] == "rappi"
    assert found[("21", "sin-lactosa")] == "regla"
    assert found[("20", "con-descuento")] == "derivado"
    assert {i for (i, a) in found if a == "economico"} == {"21"}  # el 25 % más barato de «leche»
    assert db.execute("SELECT count(*) FROM attribute_defs").fetchone()[0] > 70


def test_build_attributes_is_idempotent_and_keeps_curated_rows(db):
    _attribute_catalog(db)
    build_attributes(db)
    db.execute(
        """INSERT INTO item_attributes (entity_type, entity_id, attribute_id, source, confidence, rules_version)
           VALUES ('catalog_item', '22', 'organico', 'curado', 1, 'a mano')"""
    )

    build_attributes(db)
    first = _attrs(db)
    build_attributes(db)

    assert _attrs(db) == first
    assert first[("22", "organico")] == "curado"
    assert db.execute("SELECT count(*) FROM layer_runs WHERE layer = 'attributes'").fetchone()[0] == 3


def test_dish_size_comes_from_the_measures(db):
    add_store(db, 2, "restaurantes")
    add_dish(db, 500, "Pizza Familiar", 2, "Pizzas")
    db.commit()
    build_search_documents(db)
    build_measures(db)

    build_attributes(db)

    assert _attrs(db)[("500", "familiar")] == "regla"


def test_capa_views_expose_attributes_and_unit_prices(db):
    _attribute_catalog(db)
    build_attributes(db)

    attrs = db.execute(
        "SELECT attribute_name, family FROM capa.item_attributes"
        " WHERE entity_id = '21' AND attribute_id = 'sin-lactosa'"
    ).fetchone()
    per_l = db.execute(
        "SELECT price, price_per_l FROM capa.item_unit_prices WHERE entity_id = '21' AND vertical = 'supermercado'"
    ).fetchone()

    assert attrs == ("Sin lactosa", "dieta")
    assert per_l == (1000, 1000.0)  # $1.000 por 1 L


def test_layer_report_lists_coverage_sources_and_a_sample(db):
    _attribute_catalog(db)
    build_attributes(db)

    report = layer_report(db, sample=2)

    assert "# Capas de perfiles" in report
    assert "sin-gluten" in report and "rappi" in report  # cobertura por atributo y fuente
    assert "Leche sin lactosa 1 L" in report  # muestra revisable con el nombre del ítem
    assert "Marcas y producto canónico por vertical" in report and "Productos canónicos en 3 o más" in report
    assert layer_report(db, sample=2) == report  # muestra con semilla fija: mismo reporte


def test_pet_attributes_come_from_the_concept_group(db):
    add_store(db, 1, "supermercado")
    add_product(db, 30, "Gato Vino Cabernet Sauvignon 1 L", 1, "Vinos")
    add_product(db, 31, "Alimento para gato adulto 1 kg", 1, "Alimento para gatos")
    db.commit()
    build_search_documents(db)
    build_concepts(db)

    build_attributes(db)

    assert ("30", "gato") not in _attrs(db) and _attrs(db)[("31", "gato")] == "regla"


def test_unit_price_ratios_flag_a_mispriced_item(db):
    add_store(db, 1, "supermercado")
    for pid, price in [(40, 1000), (41, 1100), (42, 1200), (43, 1300), (44, 250000)]:
        add_product(db, pid, "Coca-Cola 2 L", 1, "Gaseosas")
        add_price(db, 1, pid, price)
        db.execute("UPDATE catalog_items SET quantity = 2, unit_type = 'l' WHERE master_product_id = %s", (pid,))
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    build_measures(db)

    rows = db.execute(
        "SELECT entity_id, round(ratio::numeric, 1) FROM capa.unit_price_ratios WHERE ratio > 5 ORDER BY 1"
    ).fetchall()

    assert [r[0] for r in rows] == ["44"] and rows[0][1] > 100


def test_economico_compares_the_price_per_unit_not_the_shelf_price(db, monkeypatch):
    """Un sobre de 15 g es barato en la góndola y caro por gramo: «económico» es lo segundo."""
    monkeypatch.setattr(attributes_layer, "MIN_CONCEPT_ITEMS_FOR_PRICE", 4)
    add_store(db, 1, "supermercado")
    items = [(50, "Alimento perro 15 g", 500, 15), (51, "Alimento perro 1000 g", 4000, 1000),
             (52, "Alimento perro 2000 g", 9000, 2000), (53, "Alimento perro 3000 g", 14000, 3000),
             (54, "Alimento perro 5000 g", 30000, 5000)]  # fmt: skip
    for pid, name, price, grams in items:
        add_product(db, pid, name, 1, "Alimento para perros")
        add_price(db, 1, pid, price)
        db.execute(
            "UPDATE catalog_items SET quantity = %s, unit_type = 'gr' WHERE master_product_id = %s", (grams, pid)
        )
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    build_measures(db)

    build_attributes(db)

    cheap = {i for (i, a) in _attrs(db) if a == "economico"}
    assert "50" not in cheap and "51" in cheap  # $4,0/g contra $33,3/g del sobre


def test_curated_rows_survive_even_when_a_rule_detects_the_same_attribute(db):
    _attribute_catalog(db)
    build_attributes(db)
    db.execute(
        "UPDATE item_attributes SET source = 'curado', rules_version = 'a mano' "
        "WHERE entity_id = '21' AND attribute_id = 'sin-lactosa'"
    )

    build_attributes(db)

    assert _attrs(db)[("21", "sin-lactosa")] == "curado"


def test_unit_price_ratios_ignore_items_without_a_comparable_unit(db):
    add_store(db, 1, "supermercado")
    add_product(db, 60, "Cable 2 mt", 1, "Cables")
    add_price(db, 1, 60, 3000)
    db.execute("UPDATE catalog_items SET quantity = 2, unit_type = 'mt' WHERE master_product_id = 60")
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    build_measures(db)

    assert db.execute("SELECT count(*) FROM capa.unit_price_ratios").fetchone()[0] == 0


def test_rules_version_changes_when_the_rules_change(tmp_path):
    from rappi_ia.layers.runs import rules_version

    a, b = tmp_path / "a.toml", tmp_path / "b.toml"
    a.write_text('version = "x"\nA = 1\n')
    b.write_text('version = "x"\nA = 2\n')
    assert rules_version("2026-10-06", a) != rules_version("2026-10-06", b)
    assert rules_version("2026-10-06", a) == rules_version("2026-10-06", a)
    assert rules_version("2026-10-06", a).startswith("2026-10-06+")


def _brand_catalog(db):
    add_store(db, 1, "supermercado")
    add_store(db, 2, "restaurantes")
    items = [
        (70, "Coca-Cola Original 1.5 L", "Coca-Cola"), (71, "Coca Cola Zero 1.5 L", "COCA COLA"),
        (72, "Coca-Cola Sin Azúcar 1.5 L", "Coca-Cola Sin Azúcar"), (73, "Papas Fritas Lays 150 g", "Lays"),
        (74, "Leche Entera 1 L", "Líder"), (75, "Leche Descremada 1 L", "Lider"),
        (76, "Lays Papas Onduladas", ""), (77, "Cargador USB", "Nan"),
    ]  # fmt: skip
    for pid, name, trademark in items:
        add_product(db, pid, name, 1, "Varios")
        db.execute("UPDATE catalog_items SET trademark = %s WHERE master_product_id = %s", (trademark, pid))
    add_dish(db, 500, "Combo Whopper", 2, "Combos")
    db.execute("INSERT INTO brands (brand_id, name, kind) VALUES (9, 'Burger King', 'restaurant')")
    db.execute("UPDATE stores SET brand_id = 9 WHERE store_id = 2")
    db.commit()


def test_build_brands_joins_writings_infers_from_the_name_and_flags_store_brands(db, monkeypatch):
    from rappi_ia.layers import brands as brands_layer

    monkeypatch.setattr(brands_layer, "MIN_PARENT_ITEMS", 2)  # la base de prueba es chica
    monkeypatch.setattr(brands_layer, "MIN_INDEX_ITEMS", 1)
    _brand_catalog(db)

    counts = build_brands(db)
    by_item = dict(db.execute("SELECT entity_id, brand_key FROM item_brands").fetchall())
    sources = dict(db.execute("SELECT entity_id, source FROM item_brands").fetchall())

    assert by_item["70"] == by_item["71"] == by_item["72"]  # tres escrituras y una línea: una marca
    assert (
        db.execute("SELECT name FROM product_brands WHERE brand_key = %s", (by_item["70"],)).fetchone()[0]
        == "Coca-Cola"
    )
    assert by_item["74"] == by_item["75"]  # Líder = Lider
    assert by_item["76"] == by_item["73"] and sources["76"] == "regla"  # «Lays Papas…» sin marca declarada
    assert "77" not in by_item  # «Nan» no es una marca
    assert by_item["500"] and sources["500"] == "cadena"
    assert counts["marcas"] >= 4 and counts["deducidas_del_nombre"] == 1
    assert db.execute("SELECT is_store_brand FROM product_brands WHERE brand_key = %s", (by_item["74"],)).fetchone()[0]
    assert build_brands(db) == counts  # idempotente


def test_store_brand_items_get_the_marca_propia_attribute(db):
    _brand_catalog(db)
    build_search_documents(db)
    build_concepts(db)
    build_measures(db)
    build_brands(db)

    build_attributes(db)

    found = _attrs(db)
    assert found[("74", "marca-propia")] == "derivado" and ("70", "marca-propia") not in found


def test_canonical_products_join_the_same_product_across_ids_and_never_across_sizes(db, monkeypatch):
    from rappi_ia.layers import brands as brands_layer
    from rappi_ia.layers.canonical import build_canonical

    monkeypatch.setattr(brands_layer, "MIN_INDEX_ITEMS", 1)
    add_store(db, 1, "supermercado")
    add_store(db, 2, "licores")
    items = [
        (80, "Coca-Cola Original 1.5 L", "Coca-Cola", 1, 1.5),
        (81, "Coca Cola Original 1,5 L", "COCA COLA", 2, 1.5),
        (82, "Coca-Cola Original 3 L", "Coca-Cola", 1, 3),
        (83, "Coca-Cola Zero 1.5 L", "Coca-Cola", 1, 1.5),
        (84, "Cargador USB", "", 1, None),
    ]
    for pid, name, trademark, store, liters in items:
        add_product(db, pid, name, store, "Gaseosas")
        db.execute(
            "UPDATE catalog_items SET trademark = %s, quantity = %s, unit_type = %s WHERE master_product_id = %s",
            (trademark, liters, "l" if liters else None, pid),
        )
    db.commit()
    build_measures(db)
    build_brands(db)

    counts = build_canonical(db)
    canon = dict(db.execute("SELECT master_product_id::text, canonical_id FROM item_canonical").fetchall())

    assert canon["80"] == canon["81"]  # mismo producto, dos ids, dos verticales
    assert len({canon["80"], canon["82"], canon["83"]}) == 3  # otro tamaño u otra variante: otro producto
    assert "84" not in canon  # sin marca ni medida no se puede unir: no se inventa
    assert counts == {"canonicos": 3, "items": 4, "compartidos": 1}
    assert build_canonical(db) == counts
