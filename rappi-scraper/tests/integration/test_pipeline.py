"""Pipeline completo contra `rappi_test`, con un cliente falso que sirve páginas reales guardadas."""

import pytest

from conftest import FakeClient
from rappi_scraper.pipeline import discover
from rappi_scraper.pipeline.restaurants import process_restaurant_jobs
from rappi_scraper.pipeline.stores import process_store_jobs
from rappi_scraper.storage import repository


def _store_job(key, *paths, verticals=("supermercado",)):
    candidates = [
        {"store_id": i, "path": p, "city": "Santiago", "lat": -33.4, "lng": -70.6} for i, p in enumerate(paths)
    ]
    return {
        "job_key": key,
        "job_type": "store_group",
        "payload": {"verticals": list(verticals), "candidates": candidates},
    }


def _statuses(db):
    return dict(db.execute("SELECT job_key, status FROM scrape_jobs ORDER BY job_key").fetchall())


def test_store_job_falls_back_to_next_branch_and_skips_same_brand(db):
    run = repository.start_run(db, "stores", {})
    repository.add_jobs(
        db,
        run,
        [
            _store_job("type:lider", "/tiendas/1-caida", "/tiendas/900025946-lider"),
            _store_job("type:otra", "/tiendas/900025946-lider"),  # misma marca (store_type 'lider')
        ],
    )
    client = FakeClient(unavailable={"/tiendas/1-caida"})

    process_store_jobs(db, client, run, max_aisles=1)

    assert _statuses(db) == {"type:lider": "done", "type:otra": "skipped"}
    assert db.execute("SELECT count(*) FROM store_products").fetchone()[0] > 0
    # la tienda repetida se detecta con la primera página, sin recorrer sus pasillos
    assert client.requested.count("/tiendas/900025946-lider") == 2
    assert db.execute("SELECT vertical FROM store_verticals WHERE store_id = 900025946").fetchone() == ("supermercado",)


def test_store_job_fails_when_no_branch_available(db):
    run = repository.start_run(db, "stores", {})
    repository.add_jobs(db, run, [_store_job("type:x", "/tiendas/1-a", "/tiendas/2-b")])

    process_store_jobs(db, FakeClient(unavailable={"/tiendas/1-a", "/tiendas/2-b"}), run)

    assert _statuses(db) == {"type:x": "failed"}


def test_restaurant_branches_of_same_brand_are_scraped_once(db):
    run = repository.start_run(db, "restaurants", {})
    repository.add_jobs(
        db,
        run,
        [
            {
                "job_key": f"rest:{i}",
                "job_type": "restaurant",
                "payload": {
                    "verticals": ["restaurantes"],
                    "candidates": [{"store_id": i, "path": f"/restaurantes/{i}"}],
                },
            }
            for i in (1, 2)
        ],
    )
    pages = {"/restaurantes/1": "restaurant", "/restaurantes/2": "restaurant"}  # misma marca (3607)

    process_restaurant_jobs(db, FakeClient(pages), run)

    assert _statuses(db) == {"rest:1": "done", "rest:2": "skipped"}
    assert repository.brands_done(db, run) == {3607}
    assert db.execute("SELECT count(*) FROM menu_price_snapshots").fetchone()[0] == 61


def test_discover_restaurants_retries_failed_chains_and_skips_their_branches(db, monkeypatch):
    chain_url = "https://www.rappi.cl/restaurantes/delivery/1833-vapiano"
    sitemaps = {
        discover.CHAIN_SITEMAP: [chain_url],
        discover.PARTNER_SITEMAP: [
            "https://www.rappi.cl/restaurantes/900021447-vapiano",  # sucursal de la cadena
            "https://www.rappi.cl/restaurantes/555-independiente",
        ],
    }
    monkeypatch.setattr(discover, "_sitemap_urls", lambda client, url: sitemaps[url])
    client = FakeClient(
        {"/restaurantes/delivery/1833-vapiano": "brand_chain"}, failing_once={"/restaurantes/delivery/1833-vapiano"}
    )
    run = repository.start_run(db, "restaurants", {})

    n_jobs = discover.discover_restaurants(db, client, run)

    assert n_jobs == 2
    assert set(_statuses(db)) == {"chain:1833", "rest:555"}


@pytest.mark.parametrize("vertical", ["mall", "supermercado"])
def test_pending_jobs_filter_by_vertical(db, vertical):
    run = repository.start_run(db, "stores", {})
    repository.add_jobs(
        db,
        run,
        [
            _store_job("type:a", "/tiendas/1", verticals=("mall",)),
            _store_job("type:b", "/tiendas/2", verticals=("mall", "supermercado")),
        ],
    )

    keys = [j["job_key"] for j in repository.pending_jobs(db, run, "store_group", vertical)]

    assert keys == (["type:a", "type:b"] if vertical == "mall" else ["type:b"])
