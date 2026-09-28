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


@pytest.mark.parametrize(
    ("bad_path", "next_path"),
    [
        ("/tiendas/900025946-lider/lacteos-y-huevos", "/tiendas/900025946-lider/snacks-y-dulces"),
        ("/tiendas/900025946-lider/lacteos-y-huevos/yogurt", "/tiendas/900025946-lider/lacteos-y-huevos/leche"),
    ],
    ids=["pasillo", "sub-pasillo"],
)
def test_page_without_storefront_skips_only_that_aisle(db, bad_path, next_path):
    # Rappi a veces entrega un pasillo o sub-pasillo sin fallback['storefront/...'] (27-09-2026): se omite esa
    # página y la tienda sigue, en vez de perder todo lo recorrido.
    run = repository.start_run(db, "stores", {})
    repository.add_jobs(db, run, [_store_job("type:lider", "/tiendas/900025946-lider")])
    client = FakeClient({bad_path: "listing_market"})  # página real sin storefront

    process_store_jobs(db, client, run, max_aisles=2)

    # sigue con la página hermana siguiente, no corta el recorrido
    assert client.requested.index(next_path) > client.requested.index(bad_path)
    status, result = db.execute("SELECT status, result FROM scrape_jobs WHERE job_key = 'type:lider'").fetchone()
    assert (status, result["paginas_omitidas"]) == ("done", 1)
    assert db.execute("SELECT count(*) FROM store_products").fetchone()[0] > 0


def test_branch_that_redirects_mid_crawl_falls_back_to_next_branch(db):
    # Un pasillo que redirige al listado (/tiendas/tipo/...) dice que la sucursal dejó de despachar a esa ubicación:
    # no se guarda su catálogo a medias, se prueba la siguiente sucursal.
    run = repository.start_run(db, "stores", {})
    repository.add_jobs(db, run, [_store_job("type:x", "/tiendas/900025946-lider", "/tiendas/2-otra")])
    client = FakeClient({"/tiendas/2-otra": "store_mall"}, unavailable={"/tiendas/900025946-lider/lacteos-y-huevos"})

    process_store_jobs(db, client, run, max_aisles=1)

    status, result = db.execute("SELECT status, result FROM scrape_jobs WHERE job_key = 'type:x'").fetchone()
    assert (status, result["store_id"]) == ("done", 900099813)
    assert db.execute("SELECT count(*) FROM store_products WHERE store_id = 900025946").fetchone()[0] == 0


def test_branch_that_redirects_mid_crawl_fails_when_no_other_branch(db):
    run = repository.start_run(db, "stores", {})
    repository.add_jobs(db, run, [_store_job("type:lider", "/tiendas/900025946-lider")])
    client = FakeClient(unavailable={"/tiendas/900025946-lider/lacteos-y-huevos"})

    process_store_jobs(db, client, run, max_aisles=1)

    status, error = db.execute("SELECT status, error FROM scrape_jobs WHERE job_key = 'type:lider'").fetchone()
    assert (status, error) == ("failed", "sucursal no disponible a mitad del recorrido")
    assert db.execute("SELECT count(*) FROM store_products").fetchone()[0] == 0


def test_store_fails_when_no_aisle_can_be_read(db):
    # Con solo la portada la tienda quedaría "done" y casi vacía: mejor 'failed', visible en el reporte. El mensaje
    # no lleva números para que el reporte agrupe todas las tiendas con este error.
    run = repository.start_run(db, "stores", {})
    repository.add_jobs(db, run, [_store_job("type:lider", "/tiendas/900025946-lider")])
    lider = "/tiendas/900025946-lider"
    client = FakeClient({f"{lider}/lacteos-y-huevos": "listing_market", f"{lider}/snacks-y-dulces": "listing_market"})

    process_store_jobs(db, client, run, max_aisles=2)

    status, error = db.execute("SELECT status, error FROM scrape_jobs WHERE job_key = 'type:lider'").fetchone()
    assert (status, error) == ("failed", "ParseError: ningún pasillo se pudo leer")
    assert db.execute("SELECT count(*) FROM store_products").fetchone()[0] == 0


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


def test_restaurant_that_no_longer_exists_is_skipped_not_failed(db):
    """Un restaurante dado de baja no es una falla del scraper (no debe inflar "Jobs fallidos" del reporte)."""
    run = repository.start_run(db, "restaurants", {})
    job = {"verticals": ["restaurantes"], "candidates": [{"store_id": 7, "path": "/restaurantes/7-cerrado"}]}
    repository.add_jobs(db, run, [{"job_key": "rest:7", "job_type": "restaurant", "payload": job}])
    db.commit()

    process_restaurant_jobs(db, FakeClient(gone={"/restaurantes/7-cerrado"}), run)

    status, result = db.execute("SELECT status, result FROM scrape_jobs WHERE job_key = 'rest:7'").fetchone()
    assert (status, result["reason"]) == ("skipped", "ya no existe en Rappi")


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
