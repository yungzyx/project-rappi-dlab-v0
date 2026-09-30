from types import SimpleNamespace

from rappi_ia.eval import search_eval
from rappi_ia.eval.search_eval import (
    ABLATION,
    QueryRun,
    calibrate_tau,
    negative_diagnosis,
    paired_comparison,
    render_markdown,
    run_queries,
    summarize,
    thresholds_after_saving,
    unmet_quality,
)


def run(query, tipo, cosine, vertical="licores", strict=0, names_concept=False, in_vertical=False):
    return QueryRun(vertical, query, tipo, "hibrido", [1] * 10, strict, cosine, in_vertical, names_concept)


def test_calibrate_tau_ignores_negatives_that_do_not_depend_on_tau():
    """Negativas que cortan por coincidencia léxica o por concepto nombrado dan el mismo recall con cualquier τ:
    no hay nada que calibrar (antes devolvía 0,70, el primer candidato de la grilla)."""
    runs = [
        run("pañales", "negativa", 0.95, strict=3),
        run("zapatillas", "negativa", 0.80, names_concept=True),
        run("pisco", "exacta", 0.93),
    ]
    assert calibrate_tau(runs) == {}


def test_calibrate_tau_proposes_nothing_when_no_tau_detects_a_negative():
    runs = [run("neumáticos", "negativa", 0.99), run("pisco", "exacta", 0.93)]
    assert calibrate_tau(runs) == {}


def test_calibrate_tau_breaks_ties_with_the_lowest_tau():
    """Entre 0,76 y 0,90 todos detectan la negativa sin falsas alarmas: se elige el más prudente."""
    runs = [run("neumáticos", "negativa", 0.75), run("pisco", "exacta", 0.90)]
    assert calibrate_tau(runs) == {"licores": 0.76}


def test_calibrate_tau_accepts_one_false_alarm_in_ten():
    """Con τ = 0,86 detecta las 10 negativas y marca una positiva: precisión 10/11 ≥ 0,9, recall 1."""
    negatives = [run(f"neg {i}", "negativa", 0.71 + 0.01 * i) for i in range(9)] + [run("neg 9", "negativa", 0.85)]
    assert calibrate_tau([*negatives, run("pisco", "exacta", 0.80)]) == {"licores": 0.86}


def test_report_shows_current_and_proposed_tau_per_vertical():
    runs = [run("neumáticos", "negativa", 0.75), run("pisco", "exacta", 0.90)]
    current = {"licores": 0.7, "mall": 0.7}
    proposed = calibrate_tau(runs)
    report = render_markdown(summarize(runs), unmet_quality(runs, current), current, proposed, saved=False, model="e5")
    assert "| licores | 0.7 | 0.76 |" in report
    assert "| mall | 0.7 | sin propuesta |" in report
    assert "ningún τ entre 0,70 y 0,95" in report
    assert "con los τ vigentes" in report


def test_each_negative_says_why_it_was_or_was_not_detected():
    runs = [
        run("iphone 15 pro max", "negativa", 0.84, vertical="supermercado", strict=4),
        run("neumáticos", "negativa", 0.83),
        run("sofá", "negativa", 0.79),
        run("pizza familiar", "negativa", 0.90, vertical="mall", names_concept=True, in_vertical=True),
        run("palta hass", "negativa", 0.90, vertical="mall", names_concept=True, in_vertical=False),
        run("pisco", "exacta", 0.95),
    ]

    rows = {r["consulta"]: r for r in negative_diagnosis(runs, {"licores": 0.8})}

    assert set(rows) == {"iphone 15 pro max", "neumáticos", "sofá", "pizza familiar", "palta hass"}
    assert rows["iphone 15 pro max"] == {
        "vertical": "supermercado",
        "consulta": "iphone 15 pro max",
        "detectada": False,
        "causa": "4 coincidencias léxicas estrictas",
        "desactualizada": True,  # con 3 o más, probablemente el catálogo ya lo tiene
    }
    assert (rows["neumáticos"]["detectada"], rows["neumáticos"]["causa"]) == (False, "coseno 0.830 ≥ τ 0.8")
    assert (rows["sofá"]["detectada"], rows["sofá"]["causa"]) == (True, "coseno 0.790 < τ 0.8")
    assert rows["pizza familiar"]["causa"] == "el concepto nombrado está en el vertical"
    palta = rows["palta hass"]
    assert (palta["detectada"], palta["causa"]) == (True, "el concepto nombrado no está en el vertical")
    assert not rows["neumáticos"]["desactualizada"]
    one = negative_diagnosis([run("leche en polvo", "negativa", 0.9, strict=1)], {})
    assert one[0]["causa"] == "1 coincidencia léxica estricta"


def test_report_lists_the_cause_of_each_negative():
    runs = [run("neumáticos", "negativa", 0.83), run("pisco", "exacta", 0.95)]
    taus = {"licores": 0.8}
    report = render_markdown(summarize(runs), unmet_quality(runs, taus), taus, {}, saved=False, model="e5")
    assert "| licores | neumáticos | no | coseno 0.830 ≥ τ 0.8 |" in report


def test_ablation_runs_hybrid_without_the_concept_bonus(monkeypatch):
    """El refuerzo reordena con la misma etiqueta con que se juzga: la ablación mide la búsqueda sin él."""
    calls = []

    def fake_retrieve(conn, vertical, query, embedder, k, mode, concepts=None):
        calls.append((mode, concepts))
        return SimpleNamespace(
            hits=[], strict_lexical_matches=0, max_cosine=0.9, concept_in_vertical=True, query_concepts=[]
        )

    monkeypatch.setattr(search_eval, "retrieve", fake_retrieve)
    query = {"vertical": "licores", "query": "pisco", "concepts": ["pisco"], "tipo": "exacta"}

    runs = run_queries(None, object(), [query])

    assert [r.mode for r in runs] == ["lexico", "vector", "hibrido", ABLATION]
    assert calls[-1] == ("hibrido", [])


def _mode_run(query, mode, relevant):
    return QueryRun("licores", query, "exacta", mode, [1] * relevant + [0] * (10 - relevant), 0, 0.9, True)


def test_paired_comparison_counts_wins_ties_and_losses_per_query():
    runs = [
        *(_mode_run(q, "hibrido", n) for q, n in [("a", 10), ("b", 8), ("c", 5), ("d", 2)]),
        *(_mode_run(q, "vector", n) for q, n in [("a", 5), ("b", 3), ("c", 5), ("d", 6)]),
    ]

    result = paired_comparison(runs, "hibrido", "vector")

    assert (result["gana"], result["empata"], result["pierde"], result["n"]) == (2, 1, 1, 4)
    low, high = result["ic95"]
    assert low <= result["diferencia"] <= high
    assert result == paired_comparison(runs, "hibrido", "vector")  # misma semilla, mismo intervalo


def test_report_shows_the_paired_comparison():
    runs = [_mode_run("a", "hibrido", 10), _mode_run("a", "vector", 5)]
    comparisons = [paired_comparison(runs, "hibrido", "vector")]
    report = render_markdown(summarize(runs), unmet_quality(runs, {}), {}, {}, False, "e5", comparisons)
    assert "| hibrido vs vector | 1 | 0 | 0 |" in report


def test_saving_keeps_the_current_tau_where_there_is_no_proposal():
    """«Sin propuesta» es «sin evidencia para cambiarlo»: pasar al τ por defecto metió una falsa alarma en Mall."""
    current = {"mall": 0.7, "licores": 0.7}
    assert thresholds_after_saving(current, {"licores": 0.82, "turbo": 0.79}) == {
        "mall": 0.7,
        "licores": 0.82,
        "turbo": 0.79,
    }


def test_report_says_verticals_without_proposal_keep_their_tau():
    runs = [run("neumáticos", "negativa", 0.75), run("pisco", "exacta", 0.90)]
    report = render_markdown(summarize(runs), unmet_quality(runs, {}), {"mall": 0.7}, {}, saved=False, model="e5")
    assert "al guardar, conserva su τ vigente" in report
