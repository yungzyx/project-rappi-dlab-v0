from rappi_ia.eval.judgments import build_sample
from rappi_ia.eval.search_eval import ABLATION, QueryRun


def _item(entity_id, concept):
    return {
        "entity_type": "catalog_item",
        "entity_id": entity_id,
        "texto": f"Producto {entity_id}",
        "concepto": concept,
    }


def _run(query, mode, ids, concepts=("pisco",)):
    items = [_item(i, "pisco" if i.startswith("p") else "vino") for i in ids]
    relevance = [1 if it["concepto"] in concepts else 0 for it in items]
    return QueryRun("licores", query, "exacta", mode, relevance, 0, 0.9, True, items=items)


RUNS = [
    _run("pisco", "hibrido", ["p1", "p2", "v1"]),
    _run("pisco", ABLATION, ["p1", "v1", "v2"]),  # difiere en p2 (solo con refuerzo) y v2 (solo sin él)
    _run("pisco", "vector", ["p1", "v3"]),
    _run("pisco", "lexico", ["p1"]),
    _run("ron", "hibrido", ["r1"], concepts=("ron",)),
    _run("ron", ABLATION, ["r1"], concepts=("ron",)),
]


def test_sample_prioritizes_items_where_the_concept_bonus_changes_the_top_10():
    """La pregunta abierta es si el refuerzo mejora: los ítems que solo aparecen con o sin él la responden."""
    sample = build_sample(RUNS, n_diff=2, n_random=0)

    assert {(p["consulta"], p["entity_id"]) for p in sample} == {("pisco", "p2"), ("pisco", "v2")}
    p2 = next(p for p in sample if p["entity_id"] == "p2")
    assert p2["origen"] == "diferencia"
    assert p2["modos"] == ["hibrido"]
    assert p2["relevante_auto"] is True


def test_sample_adds_random_pairs_from_every_mode_without_duplicates():
    sample = build_sample(RUNS, n_diff=2, n_random=10)

    keys = [(p["vertical"], p["consulta"], p["entity_type"], p["entity_id"]) for p in sample]
    assert len(keys) == len(set(keys)) == 6  # p1, p2, v1, v2, v3 de «pisco» y r1 de «ron»
    assert {p["origen"] for p in sample} == {"diferencia", "al_azar"}
    assert all(p["id"] and p["texto"] for p in sample)


def test_sample_is_reproducible_and_grouped_by_query():
    first = build_sample(RUNS, n_diff=1, n_random=2, seed=3)

    assert first == build_sample(RUNS, n_diff=1, n_random=2, seed=3)
    queries = [p["consulta"] for p in first]
    assert queries == sorted(queries)  # juzgar una consulta de corrido es más rápido
