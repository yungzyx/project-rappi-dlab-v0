"""Métricas del panel: valores exactos en un escenario armado a mano e invariantes sobre datos simulados."""

from datetime import UTC, date, datetime, timedelta

import pytest
from rappi_scraper.storage.search import build_search_documents

from conftest import add_price, add_product, add_store
from rappi_ia.agent.tools import suggest_complement
from rappi_ia.analytics import queries
from rappi_ia.concepts.pipeline import build_concepts
from rappi_ia.concepts.store import seed_taxonomy
from rappi_ia.concepts.taxonomy import load_taxonomy
from rappi_ia.events import store as events
from rappi_ia.events.synth import generate

T0 = datetime(2026, 9, 1, 12, tzinfo=UTC)


def _order(db, user, day, vertical="licores", concept="cerveza", cart=None, source="prototype"):
    events.record_order(
        db,
        user,
        f"s-{day}",
        cart or f"c-{user}-{day}",
        vertical,
        [{"entity_type": "catalog_item", "entity_id": "1", "concept_id": concept, "unit_price": 1000}],
        source=source,
        ts=T0 + timedelta(days=day),
    )


def test_kpis_rhythm_risk_and_cart_abandonment_are_exact(db):
    seed_taxonomy(db, load_taxonomy())
    # u1 pide cada 7 días y dejó de pedir (ritmo 7 → en riesgo pasado máx(14, 21) = 21 días).
    for day in (0, 7, 14):
        _order(db, "u1", day)
    # u2 pide en dos verticales; u3 un solo pedido (sin segunda compra).
    _order(db, "u2", 30, "licores")
    _order(db, "u2", 33, "supermercado", "snacks-salados")
    _order(db, "u3", 34)
    # Dos carros: uno pagado (c-u2-30) y otro abandonado hace más de 24 h.
    events.record(
        db,
        [
            events.Event("u2", "s-30", "cart_add", ts=T0 + timedelta(days=30), cart_id="c-u2-30"),
            events.Event("u3", "s-10", "cart_add", ts=T0 + timedelta(days=10), cart_id="c-perdido"),
            events.Event("u3", "s-36", "search", ts=T0 + timedelta(days=36), unmet=True, query="kebab"),
            events.Event("u3", "s-36", "search", ts=T0 + timedelta(days=36), unmet=False, query="cerveza"),
        ],
    )
    db.commit()

    k = queries.kpis(db, "prototype")

    assert k["as_of"] == T0 + timedelta(days=36)  # u1 lleva 22 días sin pedir (> 21)
    assert k["abandono_carrito_pct"] == 50.0
    assert k["busquedas_sin_resultado_pct"] == 50.0
    assert k["multi_vertical_pct"] == 33.3  # de u1, u2 y u3 (todos pidieron en 60 días), solo u2 en 2 verticales
    status = dict(
        db.execute(
            "WITH " + queries._RHYTHM.strip() + " SELECT user_id, status FROM risk", {"source": "prototype"}
        ).fetchall()
    )
    assert status["u1"] == "en_riesgo" and status["u3"] == "sin_segunda_compra"
    assert queries.kpis(db, "synthetic")["usuarios_activos"] == 0  # las fuentes no se mezclan


def test_invalid_source_is_rejected(db):
    with pytest.raises(ValueError):
        queries.kpis(db, "real")


@pytest.fixture
def simulated(db):
    add_store(db, 1, "supermercado", "Súper")
    add_store(db, 2, "licores", "Botillería")
    add_store(db, 3, "conveniencia", "Express")
    rows = [(100 + i, f"Papas fritas marca {i} 180 g", 1, "Snacks salados", 1990) for i in range(5)]
    rows += [(200 + i, f"Cerveza marca {i} lata 470 cc", 2, "Cervezas", 1290) for i in range(5)]
    rows += [(300 + i, f"Cerveza marca {i} express", 3, "Cervezas", 1390) for i in range(5)]
    rows += [(400 + i, f"Leche entera marca {i} 1 L", 1, "Leche natural", 1090) for i in range(5)]
    for pid, name, store, category, price in rows:
        add_product(db, pid, name, store, category)
        add_price(db, store, pid, price)
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    counts = generate(db, users=120, weeks=20, seed=3, until=date(2026, 9, 27))
    return db, counts


def test_synthetic_data_is_reproducible_and_marked(simulated):
    db, counts = simulated
    assert counts == generate(db, users=120, weeks=20, seed=3, until=date(2026, 9, 27))
    sources = {r[0] for r in db.execute("SELECT DISTINCT source FROM app_events")}
    assert sources == {"synthetic"}


def test_funnel_is_monotonic_and_cohorts_are_percentages(simulated):
    db, _ = simulated
    for row in queries.funnel(db, "synthetic"):
        assert row["buscan"] >= row["agregan"] >= row["pagan"] >= row["piden"]
    assert all(0 <= r["retencion_pct"] <= 100 for r in queries.cohorts(db, "synthetic"))
    assert queries.cohorts(db, "synthetic")[0]["retencion_pct"] == 100.0  # semana 0 = la del primer pedido


def test_at_risk_uses_pseudonyms_and_no_sensitive_concepts(simulated):
    db, _ = simulated
    for row in queries.at_risk(db, "synthetic", limit=200):
        assert row["usuario"].startswith("u-") and len(row["usuario"]) == 10
        assert "syn-" not in row["usuario"]
        assert row["estado"] in {"en_riesgo", "perdido"}


def test_learned_synthetic_edges_are_never_used_by_the_agent(simulated):
    db, _ = simulated
    n = queries.learn_edges(db, "synthetic")
    assert n == db.execute("SELECT count(*) FROM concept_edges WHERE method = 'coocurrencia'").fetchone()[0]
    db.execute("DELETE FROM concept_edges WHERE method = 'curado'")
    db.commit()
    # Sin aristas curadas, las aprendidas de datos simulados no alcanzan para sugerir nada.
    assert suggest_complement(db, ["cerveza"], "licores", None) is None


def test_opportunities_come_only_from_unmet_searches(simulated):
    db, _ = simulated
    for row in queries.opportunities(db, "synthetic"):
        assert row["usuarios"] >= 5 and row["busquedas"] >= row["usuarios"]
        assert row["accion"]
