"""Keywords ambiguas de la taxonomía y guardia de los conceptos sensibles (capa 2)."""

from collections import defaultdict

import numpy as np
import pytest

from rappi_ia.concepts.assign import Assignment, MappedName, assign_catalog_item, concept_matcher
from rappi_ia.concepts.knn import ItemText, _decide
from rappi_ia.concepts.taxonomy import load_taxonomy
from rappi_ia.text import normalize


@pytest.fixture(scope="module")
def matcher():
    return concept_matcher(load_taxonomy())


def test_no_keyword_belongs_to_two_concepts():
    """Con una keyword en dos conceptos, gana el que aparece primero en el archivo: una regla que nadie decidió."""
    owners = defaultdict(set)
    for concept in load_taxonomy().concepts.values():
        for keyword in (concept.name, *concept.keywords):
            owners[normalize(keyword)].add(concept.id)
    assert {kw: sorted(ids) for kw, ids in owners.items() if len(ids) > 1} == {}


@pytest.mark.parametrize(
    ("name", "concept"),
    [
        # «aceite» a secas mandaba 27 productos a condimentos (aceites esenciales, de difusor, suplementos). Otras
        # palabras sueltas siguen siendo ambiguas («orégano» en cápsulas, «roll» en Roll-On): las corrigen la
        # categoría y el kNN, no una regla por nombre.
        ("Aceite Esencial de Lavanda 10 ml", None),
        ("Aceite Para Difusores Paz Calma", "decoracion"),
        ("Aceite de Oliva Extra Virgen Chef 1 L", "aceites-condimentos"),
        ("Aceite Vegetal Belmont 1 L", "aceites-condimentos"),
        ("Straight 8 Corrector De Postura", None),
        ("Corrector de Ojeras Maybelline", "maquillaje"),
        ("Corrector Líquido Artel", "utiles"),
        ("Plumón Permanente Sharpie Negro", "utiles"),
        ("Plumón de Cama 2 Plazas Blanco", "textil-hogar"),
        ("Jarabe de Arce Canadiense 250 ml", None),
        ("Jarabe para la Tos Infantil", "medicamentos"),
    ],
)
def test_ambiguous_keywords_need_their_context(matcher, name, concept):
    a = assign_catalog_item("9", name, None, {}, matcher)
    assert (a.concept_id if a else None) == concept


def test_a_doubtful_sensitive_category_is_not_replaced_by_a_rule(matcher):
    """Conservar el concepto sensible salvo que el candidato también lo sea: un medicamento no pasa a «cerveza»."""
    categories = {"farmacia varios": MappedName("medicamentos", "llm", 0.5, "v1")}
    a = assign_catalog_item("10", "Cerveza de Levadura en Cápsulas", "Farmacia varios", categories, matcher)
    assert (a.concept_id, a.method) == ("medicamentos", "llm")


def test_neighbors_never_take_an_item_out_of_a_sensitive_concept():
    """Un medicamento rodeado de vitaminas sigue siendo medicamento; solo otro concepto sensible puede reemplazarlo."""
    item = ItemText("catalog_item", "1", "Producto de farmacia")
    medicine = Assignment("catalog_item", "1", "medicamentos", "llm", 0.9, None, "x")
    sims = np.full(15, 0.9, dtype=np.float32)
    assert _decide(medicine, item, sims, np.array(["vitaminas"] * 15), "knn/test") == medicine
    assert _decide(medicine, item, sims, np.array(["salud-sexual"] * 15), "knn/test").concept_id == "salud-sexual"
