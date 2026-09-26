from rappi_scraper.scraping.listing_parser import parse_brand_chain, parse_vertical_listing
from rappi_scraper.scraping.restaurant_parser import parse_restaurant


def test_mall_listing_merges_groups_and_filter_only_stores(page):
    stores = parse_vertical_listing(page("listing_mall"))
    by_id = {s["store_id"]: s for s in stores}
    assert len(stores) == len(by_id) > 196  # sin duplicados, incluye tiendas solo de filtros

    casaideas = by_id[900101525]
    assert casaideas["store_type"] == "casaideas_multitiendas_enc"
    assert casaideas["subvertical"] == "Hogar"
    assert casaideas["path"] == "/tiendas/900101525-casaideas-multitiendas-enc"

    filter_only = [s for s in stores if not s["store_type"]]
    assert filter_only, "Moda/Vapes traen tiendas que no están en ningún grupo"
    assert all(s["filters"] and s["path"] == f"/tiendas/{s['store_id']}" for s in filter_only)


def test_market_listing_has_landing_classification(page):
    stores = parse_vertical_listing(page("listing_market"))
    classes = {s["landing_classification"] for s in stores if s["landing_classification"]}
    assert "supermercado" in classes
    assert any(s["subvertical"] == "Turbo" for s in stores)


def test_parse_brand_chain_lists_branches(page):
    chain = parse_brand_chain(page("brand_chain"))
    assert chain["brand_id"] == 1833
    assert chain["name"] == "Vapiano"
    assert len(chain["stores"]) == 2
    assert chain["stores"][0]["path"].startswith("/restaurantes/")


def test_parse_restaurant_menu_and_details(page):
    r = parse_restaurant(page("restaurant"))
    assert r["store"]["store_id"] == 384
    assert r["store"]["brand_id"] == 3607
    assert r["store"]["lat"] < -33 and r["store"]["lng"] < -70  # location viene como [lng, lat]
    assert r["cuisines"] == ["Internacional"]
    assert len(r["sections"]) == 9
    assert len(r["items"]) == 61
    section_ids = {s["section_id"] for s in r["sections"]}
    assert all(i["section_id"] in section_ids for i in r["items"])
    assert all(i["image_url"].startswith("https://images.rappi.cl/") for i in r["items"] if i["image_url"])
