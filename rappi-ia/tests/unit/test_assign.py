import pytest

from rappi_ia.concepts.assign import MappedName, assign_catalog_item, assign_menu_item, concept_matcher
from rappi_ia.concepts.taxonomy import load_taxonomy


@pytest.fixture(scope="module")
def matcher():
    return concept_matcher(load_taxonomy())


CATEGORIES = {
    "gaseosas": MappedName("gaseosas", "llm", 0.95, "v1"),
    "otros": MappedName("platos-listos", "llm", 0.4, "v1"),
}


def test_catalog_item_prefers_confident_category(matcher):
    a = assign_catalog_item("1", "Fanta Naranja 1,5 L", "Gaseosas", CATEGORIES, matcher)
    assert (a.concept_id, a.method, a.source) == ("gaseosas", "llm", "categoria:Gaseosas")


def test_catalog_item_falls_back_to_rules_when_category_is_doubtful(matcher):
    a = assign_catalog_item("2", "Cerveza Kunstmann Torobayo 470 cc", "Otros", CATEGORIES, matcher)
    assert (a.concept_id, a.method) == ("cerveza", "regla")


def test_catalog_item_keeps_doubtful_category_if_no_rule_matches(matcher):
    a = assign_catalog_item("3", "Producto XYZ", "Otros", CATEGORIES, matcher)
    assert (a.concept_id, a.confidence) == ("platos-listos", 0.4)


def test_catalog_item_without_anything_is_unassigned(matcher):
    assert assign_catalog_item("4", "Producto XYZ", None, CATEGORIES, matcher) is None


SECTIONS = {"bebidas": MappedName("gaseosas", "llm", 0.9), "promos": MappedName("pizza", "llm", 0.3)}
CUISINES = {"italiana": MappedName("pizza", "llm", 0.8)}


def test_menu_item_name_wins_over_section(matcher):
    a = assign_menu_item("10", "Pizza napolitana", "Bebidas", [], SECTIONS, CUISINES, matcher)
    assert (a.concept_id, a.method) == ("pizza", "regla")


def test_menu_item_uses_section_then_cuisine(matcher):
    by_section = assign_menu_item("11", "Limonada menta jengibre", "Bebidas", ["Italiana"], SECTIONS, CUISINES, matcher)
    assert by_section.concept_id == "jugos"  # "limonada" es regla de nombre
    by_section = assign_menu_item("12", "Maracuyá sour sin alcohol", "Bebidas", [], SECTIONS, CUISINES, matcher)
    assert (by_section.concept_id, by_section.source) == ("gaseosas", "seccion:Bebidas")
    by_cuisine = assign_menu_item("13", "Especial de la casa", "Promos", ["Italiana"], SECTIONS, CUISINES, matcher)
    assert (by_cuisine.concept_id, by_cuisine.confidence) == ("pizza", 0.64)  # 0.8 × 0.8: la cocina es pista débil
