"""Reintentos de jobs y reporte de calidad de corridas, contra `rappi_test`."""

from conftest import FakeClient, load_page
from rappi_scraper.pipeline.stores import process_store_jobs
from rappi_scraper.reporting import build_run_report, write_run_report
from rappi_scraper.scraping.restaurant_parser import parse_restaurant
from rappi_scraper.storage import repository


def _job(key, path="/tiendas/900025946-lider"):
    candidate = {"store_id": 1, "path": path, "city": "Santiago", "lat": -33.4, "lng": -70.6}
    return {
        "job_key": key,
        "job_type": "store_group",
        "payload": {"verticals": ["supermercado"], "candidates": [candidate]},
    }


def _status(db, key):
    return db.execute("SELECT status, attempts FROM scrape_jobs WHERE job_key = %s", (key,)).fetchone()


def test_requeue_failed_respects_max_attempts_and_job_keys(db):
    run = repository.start_run(db, "stores", {})
    repository.add_jobs(db, run, [_job("a"), _job("b"), _job("c")])
    repository.mark_job(db, run, "a", "failed", error="502")  # 1 intento
    for _ in range(3):
        repository.mark_job(db, run, "b", "failed", error="502")  # 3 intentos
    repository.mark_job(db, run, "c", "failed", error="502")

    assert repository.requeue_failed(db, run, max_attempts=2, job_keys=["a", "b"]) == ["a"]
    assert _status(db, "a")[0] == "pending"
    assert _status(db, "b")[0] == "failed"
    assert _status(db, "c")[0] == "failed"  # fuera de job_keys
    assert sorted(repository.requeue_failed(db, run, max_attempts=5)) == ["b", "c"]


def test_latest_and_reopen_run(db):
    run = repository.start_run(db, "stores", {})
    repository.finish_run(db, run)
    assert repository.open_run(db, "stores") is None
    assert repository.latest_run(db, "stores") == run

    repository.reopen_run(db, run)

    assert repository.open_run(db, "stores") == run


def test_transient_failure_is_retried_automatically(db):
    run = repository.start_run(db, "stores", {})
    repository.add_jobs(db, run, [_job("type:lider")])
    client = FakeClient(failing_once={"/tiendas/900025946-lider"})

    process_store_jobs(db, client, run, max_aisles=1)

    assert _status(db, "type:lider") == ("done", 2)


def test_failures_where_rappi_answered_do_not_stop_the_run(db):
    """«Ninguna sucursal disponible» es una respuesta de rappi.cl, no una señal de bloqueo."""
    path = "/tiendas/900025946-lider"
    run = repository.start_run(db, "stores", {})
    repository.add_jobs(db, run, [_job(f"type:{i:02}", path) for i in range(12)])

    process_store_jobs(db, FakeClient(unavailable={path}), run, max_aisles=1)

    assert db.execute("SELECT status, count(*) FROM scrape_jobs GROUP BY 1").fetchall() == [("failed", 12)]


def test_store_report_counts_jobs_and_flags_missing_prices(db):
    run = repository.start_run(db, "stores", {})
    repository.upsert_store(db, {"store_id": 1, "name": "Lider", "store_type": "lider"})
    repository.upsert_store_vertical(db, 1, "supermercado")
    products = [
        {"product_id": str(i), "master_product_id": 100 + i, "name": f"P{i}", "category_id": 76,
         "category_name": "Arroz", "image_url": "x.png", "price": 0 if i < 3 else 990}
        for i in range(10)
    ]  # fmt: skip
    repository.save_products(db, run, 1, products)
    repository.add_jobs(db, run, [_job("ok"), _job("mal")])
    repository.mark_job(db, run, "ok", "done", {"store_id": 1, "store_type": "lider", "products": 10})
    repository.mark_job(db, run, "mal", "failed", error="HTTP 502")
    db.commit()

    report = build_run_report(db, run)

    assert report["jobs"] == {"done": 1, "failed": 1}
    assert report["top_errors"] == [{"error": "HTTP 502", "count": 1}]
    assert report["verticals"][0]["vertical"] == "supermercado"
    assert report["verticals"][0]["productos_unicos"] == 10
    checks = {c["label"]: c for c in report["checks"]}
    assert checks["Productos sin precio (%)"]["value"] == 30.0
    assert not checks["Productos sin precio (%)"]["ok"]
    assert not checks["Jobs fallidos (%)"]["ok"]  # 50% > 10%
    assert checks["Productos sin categoría (%)"]["ok"]


def test_store_report_sums_skipped_pages(db):
    run = repository.start_run(db, "stores", {})
    repository.add_jobs(db, run, [_job("a"), _job("b"), _job("c")])
    repository.mark_job(db, run, "a", "done", {"products": 5, "paginas_omitidas": 2})
    repository.mark_job(db, run, "b", "done", {"products": 5, "paginas_omitidas": 1})
    repository.mark_job(db, run, "c", "done", {"products": 5})  # jobs anteriores no traen el conteo

    assert build_run_report(db, run)["totals"]["paginas_omitidas"] == 3


def test_restaurant_report_and_written_files(db, tmp_path):
    run = repository.start_run(db, "restaurants", {})
    repository.save_restaurant(db, run, parse_restaurant(load_page("restaurant")))
    db.commit()

    report, path = write_run_report(db, run, reports_dir=tmp_path)

    assert report["totals"] == {"restaurantes": 1, "platos": 61, "platos_nuevos": 61}
    assert all(c["ok"] for c in report["checks"])
    assert path == tmp_path / f"run_{run}_restaurants.md"
    assert "✓ Todas las validaciones" in path.read_text(encoding="utf-8")
    stored = db.execute("SELECT report->>'kind' FROM scrape_runs WHERE run_id = %s", (run,)).fetchone()[0]
    assert stored == "restaurants"
