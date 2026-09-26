from rappi_scraper.pipeline.discover import _add_candidate, canonical_vertical, city_locations


def test_canonical_vertical_moves_turbo_out_of_other_listings():
    assert canonical_vertical("supermercado", {"subvertical": "Turbo", "store_type": "x"}) == "turbo"
    assert canonical_vertical("licores", {"subvertical": "", "store_type": "turbo_licores"}) == "turbo"
    assert canonical_vertical("mall", {"subvertical": "Hogar", "store_type": "casaideas"}) == "mall"


def _raw(store_id, city, lat, reviews=0):
    return {
        "storeId": store_id,
        "brandName": "X",
        "storeName": "X",
        "city": city,
        "address": "",
        "lat": lat,
        "lng": -70.0,
        "url": f"https://www.rappi.cl/tiendas/{store_id}-x",
        "review": {"total": reviews},
    }


def test_city_locations_use_most_reviewed_store_santiago_first():
    rows = (
        [("Talca", -35.0, 0)] * 4
        + [("Santiago de Chile", -33.0, 10), ("Santiago de Chile", -34.0, 500)] * 2
        + [("Arica", -18.0, 0)]
    )
    metadata = {"storesById": {str(i): _raw(i, *row) for i, row in enumerate(rows)}}

    cities = city_locations(metadata)

    assert [c["city"] for c in cities] == ["Santiago de Chile", "Talca"]  # Arica tiene < 3 tiendas
    assert cities[0]["lat"] == -34.0  # la tienda con más reseñas, no el promedio


def test_add_candidate_groups_by_store_type_and_collects_verticals():
    groups = {}
    city = {"city": "Santiago de Chile", "lat": -33.4, "lng": -70.6}
    lider = {"store_id": 1, "store_type": "lider", "path": "/tiendas/1-lider"}
    _add_candidate(groups, lider, "supermercado", city)
    _add_candidate(groups, {**lider, "store_id": 2}, "conveniencia", city)
    _add_candidate(groups, {**lider, "store_id": 1}, "supermercado", city)  # repetida
    _add_candidate(groups, {"store_id": 9, "store_type": "", "path": "/tiendas/9"}, "mall", city)

    assert set(groups) == {"type:lider", "id:9"}
    assert groups["type:lider"]["verticals"] == ["supermercado", "conveniencia"]
    assert [c["store_id"] for c in groups["type:lider"]["candidates"]] == [1, 2]
