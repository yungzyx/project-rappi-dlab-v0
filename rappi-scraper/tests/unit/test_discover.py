import gzip

from rappi_scraper.pipeline import discover
from rappi_scraper.pipeline.discover import _add_candidate, canonical_vertical, city_locations
from rappi_scraper.scraping.client import PageNotFound


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


class _SitemapClient:
    """Sirve sitemaps `.xml.gz` por URL; las demás dan 404."""

    def __init__(self, shards: dict[str, list[str]]):
        self.shards = shards
        self.requested = []

    def get_content(self, url):
        self.requested.append(url)
        if url not in self.shards:
            raise PageNotFound(url)
        xml = "".join(f"<url><loc>{loc}</loc></url>" for loc in self.shards[url])
        return gzip.compress(xml.encode())


def test_reads_all_sitemap_shards():
    """Los sitemaps vienen numerados (-0, -1, …): se leían solo los del -0."""
    template = discover.PARTNER_SITEMAP
    client = _SitemapClient({template.format(0): ["https://x/a", "https://x/b"], template.format(1): ["https://x/c"]})

    assert discover._sitemap_urls(client, template) == ["https://x/a", "https://x/b", "https://x/c"]
    assert client.requested[-1] == template.format(2)  # hasta el primer 404


class _EndlessSitemapClient(_SitemapClient):
    """Responde 200 con el mismo sitemap a cualquier número (sin 404 nunca)."""

    def get_content(self, url):
        self.requested.append(url)
        return gzip.compress(b"<url><loc>https://x/a</loc></url>")


def test_sitemap_shards_are_capped():
    client = _EndlessSitemapClient({})

    urls = discover._sitemap_urls(client, discover.PARTNER_SITEMAP)

    assert len(client.requested) == discover.MAX_SITEMAP_SHARDS
    assert len(urls) == discover.MAX_SITEMAP_SHARDS
