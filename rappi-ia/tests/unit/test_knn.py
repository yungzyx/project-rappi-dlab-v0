"""Regla de decisión del kNN: cuándo los vecinos confirman, reemplazan o no tocan el concepto actual."""

import numpy as np

from rappi_ia.concepts.assign import Assignment
from rappi_ia.concepts.knn import ItemText, _decide

ITEM = ItemText("catalog_item", "1", "Wok Surtidos GRA30BV11")
MODEL = "knn/test"


def _current(concept: str, method: str, confidence: float = 0.9) -> Assignment:
    return Assignment("catalog_item", "1", concept, method, confidence, None, "x")


def _neighbors(concepts: list[str], sim: float = 0.9):
    return np.full(len(concepts), sim, dtype=np.float32), np.array(concepts)


def test_neighbors_confirm_current_concept_and_raise_confidence():
    sims, concepts = _neighbors(["cocina-menaje"] * 15)
    decision = _decide(_current("cocina-menaje", "llm", 0.7), ITEM, sims, concepts, MODEL)
    assert (decision.concept_id, decision.method, decision.confidence) == ("cocina-menaje", "llm", 1.0)


def test_neighbors_replace_a_keyword_rule_with_majority():
    sims, concepts = _neighbors(["cocina-menaje"] * 9 + ["asiatica"] * 6)
    decision = _decide(_current("asiatica", "regla", 0.7), ITEM, sims, concepts, MODEL)
    assert (decision.concept_id, decision.method, decision.model_version) == ("cocina-menaje", "embedding", MODEL)
    assert "antes x" in decision.source


def test_neighbors_override_category_only_with_strong_agreement():
    strong = _neighbors(["computacion"] * 13 + ["accesorios-mascota"] * 2)
    weak = _neighbors(["computacion"] * 9 + ["accesorios-mascota"] * 6)
    category = _current("accesorios-mascota", "llm", 0.9)
    assert _decide(category, ITEM, *strong, MODEL).concept_id == "computacion"
    assert _decide(category, ITEM, *weak, MODEL) == category


def test_unassigned_item_gets_concept_only_with_majority():
    assert _decide(None, ITEM, *_neighbors(["cafe"] * 10 + ["te"] * 5), MODEL).concept_id == "cafe"
    split = ["cafe"] * 5 + ["te"] * 5 + ["galletas"] * 5
    assert _decide(None, ITEM, *_neighbors(split), MODEL) is None


def test_closer_neighbors_weigh_more():
    sims = np.array([0.95] * 5 + [0.60] * 10, dtype=np.float32)
    concepts = np.array(["pizza"] * 5 + ["pastas"] * 10)
    assert _decide(None, ITEM, sims, concepts, MODEL).concept_id == "pizza"
