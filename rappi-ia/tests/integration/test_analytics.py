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
            # Búsqueda local del prototipo: no sabe si Rappi lo tiene (unmet NULL) y no diluye la tasa.
            events.Event("u3", "s-36", "search", ts=T0 + timedelta(days=36), query="pizza"),
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


def test_purged_searches_without_concept_do_not_become_a_null_opportunity(db):
    """La purga de 90 días borra el texto: sin concepto ni consulta no hay nada que mostrar (antes, fila «null»)."""
    seed_taxonomy(db, load_taxonomy())
    events.record(
        db,
        [
            events.Event(f"u{i}", f"s{i}", "search", ts=T0, vertical="licores", unmet=True, query="kombucha")
            for i in range(5)
        ],
    )
    events.purge_old_queries(db, days=1)
    db.commit()

    assert queries.opportunities(db, "prototype") == []


def test_cart_abandonment_follows_the_definition(db):
    """§5: carros con productos; abandonado si su último evento de carro (agregar, quitar, pagar) fue hace > 24 h
    y no tiene pedido; una vez por carro, en la semana de su último evento."""
    seed_taxonomy(db, load_taxonomy())
    _order(db, "u1", 30, cart="c-pagado")
    day = lambda d: T0 + timedelta(days=d)  # noqa: E731
    events.record(
        db,
        [
            events.Event("u1", "s", "cart_add", ts=day(30), cart_id="c-pagado"),
            events.Event("u2", "s", "cart_add", ts=day(10), cart_id="c-perdido"),
            events.Event("u3", "s", "cart_add", ts=day(10), cart_id="c-vaciado"),  # lo vació: no es un carro
            events.Event("u3", "s", "cart_remove", ts=day(10), cart_id="c-vaciado"),
            events.Event("u4", "s", "cart_add", ts=day(5), cart_id="c-pagando"),  # fue a pagar hace < 24 h
            events.Event("u4", "s", "checkout_start", ts=day(35.9), cart_id="c-pagando"),
            events.Event("u6", "s", "cart_add", ts=day(10), cart_id="c-vaciado-de-una"),  # "Vaciar carro": 1 evento
            events.Event("u6", "s", "cart_add", ts=day(10), cart_id="c-vaciado-de-una"),
            events.Event("u6", "s", "cart_remove", ts=day(10), cart_id="c-vaciado-de-una", payload={"qty": 2}),
            events.Event("u7", "s", "cart_add", ts=day(10), cart_id="c-qty-rara", payload={"qty": "muchas"}),
            events.Event("u5", "s", "cart_add", ts=day(35.95), cart_id="c-reciente"),
            events.Event("u5", "s", "search", ts=day(36), query="x"),
        ],
    )
    db.commit()

    # c-perdido y c-qty-rara (qty no numérica = 1 unidad) de 5 carros con productos
    assert queries.kpis(db, "prototype")["abandono_carrito_pct"] == 40.0
    weekly = {r["semana"]: r["abandono_carrito_pct"] for r in queries.weekly(db, "prototype")}
    assert weekly[date(2026, 8, 31)] is None  # c-pagando cuenta en su última semana, no en la de su primer evento
    assert weekly[date(2026, 9, 7)] == 100.0  # c-perdido y c-qty-rara (los vaciados no cuentan)


def test_same_pair_can_be_learned_from_both_sources(db, monkeypatch):
    seed_taxonomy(db, load_taxonomy())
    db.execute(
        """INSERT INTO concept_edges (from_concept, to_concept, method, weight, support, data_source)
           VALUES ('cerveza', 'snacks-salados', 'coocurrencia', 0.5, 40, 'synthetic')"""
    )
    for user, concepts in [("u1", ["cerveza", "snacks-salados"]), ("u2", ["cerveza", "snacks-salados"])]:
        for i, concept in enumerate(concepts):
            _order(db, user, i, concept=concept)
    _order(db, "u3", 0, concept="lacteos")
    monkeypatch.setattr(queries, "MIN_SUPPORT", 1)

    assert queries.learn_edges(db, "prototype") >= 1  # antes: UniqueViolation con la arista simulada
    sources = db.execute(
        """SELECT data_source FROM concept_edges
           WHERE from_concept = 'cerveza' AND to_concept = 'snacks-salados' ORDER BY 1"""
    ).fetchall()
    assert sources == [("prototype",), ("synthetic",)]


def test_catalog_coverage_compares_the_same_stores_and_units(db):
    add_store(db, 1, "licores", "Botillería con pasillos")
    add_store(db, 2, "licores", "Botillería sin pasillos")
    db.execute(
        """INSERT INTO aisles (store_id, aisle_id, parent_aisle_id, name, product_count_declared)
           VALUES (1, 1, NULL, 'Cervezas', 4)"""
    )
    for pid in range(2):
        add_product(db, 100 + pid, f"Cerveza {pid}", 1)
    for pid in range(5):
        add_product(db, 200 + pid, f"Vino {pid}", 2)  # tienda sin pasillos declarados: fuera de la cobertura
    db.commit()

    [licores] = queries.catalog_health(db)["cobertura"]
    assert (licores["tiendas"], licores["declarados"], licores["obtenidos"]) == (1, 4, 2)


def test_nudge_taps_are_not_mixed_with_suggestions_added_to_the_cart(db, monkeypatch):
    """En el aviso "aceptar" es abrir el chat; en el chat y en "Para ti" es agregar al carro."""
    seed_taxonomy(db, load_taxonomy())
    at = T0 + timedelta(days=1)
    rows = [("suggestion_shown", "aviso")] * 10 + [("suggestion_accepted", "aviso")] * 8
    rows += [("suggestion_shown", "chat")] * 6 + [("suggestion_shown", "para-ti")] * 4
    rows += [("suggestion_accepted", "chat")] * 3
    events.record(
        db,
        [
            events.Event(
                "u1", "s", t, ts=at, concept_id="snacks-salados", vertical="supermercado", payload={"origen": origin}
            )
            for t, origin in rows
        ],
    )
    db.commit()
    [row] = queries.suggestions(db, "prototype")
    assert (row["mostradas"], row["aceptadas"], row["aceptacion_pct"]) == (10, 3, 30.0)


def test_prototype_suggestions_show_from_the_first_one_without_a_rate_on_a_small_sample(db):
    """En una demo en vivo el panel debe mostrar la sugerencia recién vista; el % recién con 10 mostradas.
    Los datos simulados mantienen el mínimo de 10 para aparecer."""
    seed_taxonomy(db, load_taxonomy())
    at = T0 + timedelta(days=1)

    def shown(user, n, accepted=0):
        rows = [("suggestion_shown", n), ("suggestion_accepted", accepted)]
        return [
            events.Event(user, "s", t, ts=at, concept_id="gaseosas", vertical="licores", payload={"origen": "chat"})
            for t, count in rows
            for _ in range(count)
        ]

    events.record(db, shown("u1", 2, accepted=1), source="prototype")
    events.record(db, shown("u2", 3), source="synthetic")
    db.commit()
    [row] = queries.suggestions(db, "prototype")
    assert (row["mostradas"], row["aceptadas"], row["aceptacion_pct"]) == (2, 1, None)
    assert queries.suggestions(db, "synthetic") == []


def test_cohorts_stop_at_the_last_finished_week(db, monkeypatch):
    """La semana en curso no es 0% de retención: queda fuera (celda vacía en el panel)."""
    monkeypatch.setattr(queries, "MIN_GROUP_USERS", 1)
    seed_taxonomy(db, load_taxonomy())
    _order(db, "u1", 0)  # martes 01-09: cohorte del lunes 31-08
    _order(db, "u1", 3)
    monday = datetime(2026, 9, 7, 8, tzinfo=UTC)  # corte: lunes 07-09 a las 8 (semana 1 recién empieza)
    events.record(db, [events.Event("u1", "s", "app_open", ts=monday)])
    db.commit()
    assert [(r["semana"], r["retencion_pct"]) for r in queries.cohorts(db, "prototype")] == [(0, 100.0)]


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


def test_funnel_is_monotonic_and_cohorts_are_percentages(simulated, monkeypatch):
    db, _ = simulated
    for row in queries.funnel(db, "synthetic"):
        assert row["buscan"] >= row["agregan"] >= row["pagan"] >= row["piden"]
    monkeypatch.setattr(queries, "MIN_GROUP_USERS", 1)  # los datos de prueba tienen cohortes chicas
    cohorts = queries.cohorts(db, "synthetic")
    assert all(0 <= r["retencion_pct"] <= 100 for r in cohorts)
    assert cohorts[0]["semana"] == 0 and cohorts[0]["retencion_pct"] == 100.0  # semana 0 = la del primer pedido
    first = [r["semana"] for r in cohorts if r["cohorte"] == cohorts[0]["cohorte"]]
    assert first == list(range(len(first)))  # semanas consecutivas: las de 0% también vienen


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
