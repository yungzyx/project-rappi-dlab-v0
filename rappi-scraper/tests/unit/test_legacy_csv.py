from rappi_scraper.legacy.csv_format import CSV_COLUMNS, consolidate, product_to_row, write_csv
from rappi_scraper.legacy.csv_scraper import select_branches
from rappi_scraper.scraping.store_metadata import normalize_stores


def _raw(store_id, brand, city, reviews=0):
    return {
        "storeId": store_id,
        "brandName": brand,
        "storeName": f"{brand} {store_id}",
        "city": city,
        "address": "Calle 1",
        "lat": -33.4,
        "lng": -70.6,
        "url": f"https://www.rappi.cl/tiendas/{store_id}-x",
        "review": {"total": reviews},
    }


STORES = normalize_stores(
    {
        "storesById": {
            "1": _raw(1, "Lider", "Santiago de Chile", reviews=10),
            "2": _raw(2, "Lider", "Santiago de Chile", reviews=500),
            "3": _raw(3, "Lider Express", " Iquique"),
            "4": _raw(4, "Salcobrand", "Santiago de Chile"),
        }
    }
)


def test_select_branches_groups_by_brand_and_city_sorted_by_reviews():
    groups = select_branches(STORES, ["lider"])
    assert [(brand, city) for brand, city, _ in groups] == [
        ("Lider", "Santiago de Chile"),
        ("Lider Express", "Iquique"),
    ]
    assert [s["store_id"] for s in groups[0][2]] == [2, 1]


def test_select_branches_filters_cities():
    groups = select_branches(STORES, ["lider"], ["iquique"])
    assert [brand for brand, _, _ in groups] == ["Lider Express"]


def test_product_to_row_maps_fields_and_computes_discount():
    product = {
        "product_id": "123",
        "master_product_id": 9,
        "name": " Yogur Vainilla ",
        "trademark": "Calan",
        "presentation": "1 X 110 g",
        "price": 1030,
        "real_price": 1280,
        "have_discount": True,
        "in_stock": True,
    }

    row = product_to_row(product, {"cadena": "Lider", "pasillo": "Lácteos"})

    assert row["sku"] == "123"
    assert row["nombre"] == "Yogur Vainilla"
    assert row["descuento_pct"] == 19.5
    assert row["tiene_descuento"] is True
    assert row["cadena"] == "Lider"
    assert set(row) == set(CSV_COLUMNS) - {"fecha_scraping", "ciudad", "store_id", "tienda", "direccion", "sub_pasillo"}


def test_write_csv_is_atomic_and_consolidate_joins_group_files(tmp_path):
    row = {c: "" for c in CSV_COLUMNS} | {"sku": "1", "nombre": "Pañal"}
    write_csv(tmp_path / "products_a.csv", [row])
    write_csv(tmp_path / "products_b.csv", [row, row])

    target, n_rows = consolidate(tmp_path)

    assert n_rows == 3
    assert target.read_bytes().startswith(b"\xef\xbb\xbf")  # BOM para Excel
    assert "Pañal" in target.read_text(encoding="utf-8-sig")
    assert not list(tmp_path.glob("*.tmp"))
