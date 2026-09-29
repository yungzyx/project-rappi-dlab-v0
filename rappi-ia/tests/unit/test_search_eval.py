from rappi_ia.eval.search_eval import QueryRun, calibrate_tau, render_markdown, summarize, unmet_quality


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
