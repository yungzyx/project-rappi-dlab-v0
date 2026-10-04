"""`refresh`: retoma corridas abiertas o crea nuevas, y deja búsqueda, reportes y respaldo."""

import pytest

from conftest import FakeClient
from rappi_scraper.pipeline.queue import PossibleBlock
from rappi_scraper.pipeline.refresh import refresh
from rappi_scraper.storage import repository

STORE_JOB = {
    "job_key": "type:lider",
    "job_type": "store_group",
    "payload": {
        "verticals": ["supermercado"],
        "candidates": [
            {"store_id": 1, "path": "/tiendas/900025946-lider", "city": "Santiago", "lat": -33.4, "lng": -70.6}
        ],
    },
}
RESTAURANT_JOB = {
    "job_key": "rest:384",
    "job_type": "restaurant",
    "payload": {"verticals": ["restaurantes"], "candidates": [{"store_id": 384, "path": "/restaurantes/384"}]},
}


def _discoverer(job, calls):
    def discover(conn, run_id):
        calls.append(run_id)
        repository.add_jobs(conn, run_id, [job])
        return 1

    return discover


def _no_discovery(conn, run_id):
    raise AssertionError("no debería descubrir: había una corrida abierta")


def test_refresh_resumes_open_runs_without_rediscovering(db, tmp_path):
    stores_run = repository.start_run(db, "stores", {})
    repository.add_jobs(db, stores_run, [STORE_JOB])
    restaurants_run = repository.start_run(db, "restaurants", {})
    repository.add_jobs(db, restaurants_run, [RESTAURANT_JOB])
    client = FakeClient({"/restaurantes/384": "restaurant"})
    backups = []

    reports, backup_failed = refresh(
        db, client, _no_discovery, _no_discovery, backup=lambda: backups.append("ok"), reports_dir=tmp_path
    )

    assert [r["kind"] for r in reports] == ["stores", "restaurants"]
    assert [r["status"] for r in reports] == ["done", "done"]
    assert {p.name for p in tmp_path.iterdir()} == {
        f"run_{stores_run}_stores.md",
        f"run_{restaurants_run}_restaurants.md",
    }
    assert db.execute("SELECT count(*) FROM search_documents").fetchone()[0] > 0
    assert backups == ["ok"] and not backup_failed


def test_refresh_starts_new_runs_and_discovers_when_none_open(db, tmp_path):
    store_calls, restaurant_calls = [], []
    client = FakeClient({"/restaurantes/384": "restaurant"})

    reports, _ = refresh(
        db,
        client,
        _discoverer(STORE_JOB, store_calls),
        _discoverer(RESTAURANT_JOB, restaurant_calls),
        reports_dir=tmp_path,
    )

    assert len(store_calls) == 1 and len(restaurant_calls) == 1
    assert all(r["jobs"] == {"done": 1} for r in reports)
    params = db.execute("SELECT DISTINCT params->>'trigger' FROM scrape_runs").fetchall()
    assert params == [("refresh",)]


def test_failed_discovery_closes_the_run_so_the_next_refresh_discovers_again(db, tmp_path):
    """Si rappi.cl no responde al descubrir (p. ej. sin red al despertar), la corrida no queda "en curso"."""

    def offline(conn, run_id):
        raise RuntimeError("sin red")

    with pytest.raises(RuntimeError):
        refresh(db, FakeClient(), offline, _no_discovery, reports_dir=tmp_path)
    assert db.execute("SELECT kind, status FROM scrape_runs").fetchall() == [("stores", "failed")]

    calls = []
    refresh(
        db,
        FakeClient({"/restaurantes/384": "restaurant"}),
        _discoverer(STORE_JOB, calls),
        _discoverer(RESTAURANT_JOB, []),
        reports_dir=tmp_path,
    )
    assert len(calls) == 1  # corrida nueva, con descubrimiento


def test_refresh_stops_on_a_block_and_leaves_the_run_open(db, tmp_path):
    """Ante un 403 permanente no sigue job por job: para, deja el reporte y la corrida abierta para retomarla."""
    run = repository.start_run(db, "stores", {})
    repository.add_jobs(db, run, [{**STORE_JOB, "job_key": f"type:{i:02}"} for i in range(15)])
    client = FakeClient(blocked=True)
    backups = []

    with pytest.raises(PossibleBlock, match="10 fallos consecutivos"):
        refresh(db, client, _no_discovery, _no_discovery, backup=lambda: backups.append("ok"), reports_dir=tmp_path)

    assert len(client.requested) == 10
    # Los 10 que fallaron por el bloqueo vuelven a la cola: la próxima actualización los intenta de nuevo.
    assert db.execute("SELECT status, count(*) FROM scrape_jobs GROUP BY 1").fetchall() == [("pending", 15)]
    assert repository.open_run(db, "stores") == run
    assert "posible bloqueo" in (tmp_path / f"run_{run}_stores.md").read_text(encoding="utf-8")
    assert backups == [] and repository.latest_run(db, "restaurants") is None


def test_a_failed_backup_does_not_stop_the_weekly_update(db, tmp_path, caplog):
    """Sin respaldo nuevo quedan los anteriores; la capa de IA (post-refresh) igual debe correr. Pero el fallo se
    informa: si solo quedara en el log, la tarea semanal anotaría «exit=0» semana tras semana."""

    def broken_backup():
        raise RuntimeError("pg_dump: disco lleno")

    reports, backup_failed = refresh(
        db,
        FakeClient({"/restaurantes/384": "restaurant"}),
        _discoverer(STORE_JOB, []),
        _discoverer(RESTAURANT_JOB, []),
        backup=broken_backup,
        reports_dir=tmp_path,
    )

    assert [r["status"] for r in reports] == ["done", "done"]
    assert db.execute("SELECT count(*) FROM search_documents").fetchone()[0] > 0
    assert backup_failed
    assert "Respaldo fallido" in caplog.text


def test_an_interrupted_refresh_resumes_restaurants_without_scraping_stores_again(db, tmp_path):
    """Un apagado a mitad de los restaurantes: las tiendas de ese ciclo ya terminaron y no se vuelven a bajar."""
    stores_run = repository.start_run(db, "stores", {})
    repository.add_jobs(db, stores_run, [STORE_JOB])
    repository.mark_job(db, stores_run, STORE_JOB["job_key"], "done", {"store_type": "lider"})
    repository.finish_run(db, stores_run)
    restaurants_run = repository.start_run(db, "restaurants", {})
    repository.add_jobs(db, restaurants_run, [RESTAURANT_JOB])
    client = FakeClient({"/restaurantes/384": "restaurant"})

    reports, _ = refresh(db, client, _no_discovery, _no_discovery, reports_dir=tmp_path)

    assert [(r["kind"], r["run_id"], r["status"]) for r in reports] == [("restaurants", restaurants_run, "done")]
    assert client.requested == ["/restaurantes/384"]
    assert repository.latest_run(db, "stores") == stores_run  # ninguna corrida de tiendas nueva


def test_resuming_after_retry_failed_does_not_start_new_runs(db, tmp_path):
    """`retry-failed` reabrió las tiendas y no los restaurantes (reencoló 0): retomar no vuelve a bajar los ~4.900
    restaurantes (unas 5,5 h) en una corrida nueva."""
    stores_run = repository.start_run(db, "stores", {})
    repository.add_jobs(db, stores_run, [STORE_JOB])
    restaurants_run = repository.start_run(db, "restaurants", {})
    repository.add_jobs(db, restaurants_run, [RESTAURANT_JOB])
    repository.mark_job(db, restaurants_run, RESTAURANT_JOB["job_key"], "done", {})
    repository.finish_run(db, restaurants_run)
    client = FakeClient()

    reports, _ = refresh(db, client, _no_discovery, _no_discovery, reports_dir=tmp_path, resume_only=True)

    assert [(r["kind"], r["run_id"], r["status"]) for r in reports] == [("stores", stores_run, "done")]
    assert all(path.startswith("/tiendas/") for path in client.requested)
    assert repository.latest_run(db, "restaurants") == restaurants_run


def test_resuming_with_nothing_open_rebuilds_search_and_backup_without_downloading(db, tmp_path):
    """Un corte cuando las dos corridas ya cerraron (durante la búsqueda o el respaldo) no empieza otra descarga."""
    backups = []

    reports, _ = refresh(
        db,
        FakeClient(),
        _no_discovery,
        _no_discovery,
        backup=lambda: backups.append("ok"),
        reports_dir=tmp_path,
        resume_only=True,
    )

    assert reports == [] and backups == ["ok"]
    assert db.execute("SELECT count(*) FROM scrape_runs").fetchone()[0] == 0
