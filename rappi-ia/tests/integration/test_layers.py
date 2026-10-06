"""Capa de perfiles (docs/superpowers/specs/2026-10-06-capa-perfiles-design.md) contra `rappi_ia_test`."""

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
