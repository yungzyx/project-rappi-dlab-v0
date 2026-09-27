"""Reglas por palabra clave. Incluye los errores que tenía el cerebro por reglas del prototipo (substrings)."""

import pytest

from rappi_ia.concepts.assign import concept_matcher
from rappi_ia.concepts.matcher import KeywordMatcher
from rappi_ia.concepts.taxonomy import load_taxonomy
from rappi_ia.text import normalize, tokens


def test_normalize_removes_accents_and_enie():
    assert normalize("Pañales Talla G, 40 u.") == "panales talla g 40 u"
    assert tokens("¿Café  con LECHE?") == ["cafe", "con", "leche"]


@pytest.fixture(scope="module")
def matcher():
    return concept_matcher(load_taxonomy())


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Galletas Tritón Chocolate", "galletas"),  # plural
        ("Combo hamburguesa + bebida", "hamburguesa"),  # a igual especificidad gana la primera
        ("Fanta Naranja 1,5 L", "gaseosas"),  # la marca gana a "naranja"
        ("Papas fritas corte americano", "snacks-salados"),  # frase más específica que "papa"
        ("comida para mi perro", "alimento-perro"),
        ("quiero whisky", "whisky"),
        ("tengo dolor de cabeza", "medicamentos"),
        ("hola, quiero sushi", "sushi"),
        ("Pizza pepperoni familiar", "pizza"),
        ("Pañal Huggies etapa 3", "panales"),
        ("panales talla g", "panales"),  # sin ñ
    ],
)
def test_best_concept(matcher, text, expected):
    assert matcher.best(text).target == expected


@pytest.mark.parametrize("text", ["bebestibles", "comercial", "escena", "equivale"])
def test_no_substring_false_positives(matcher, text):
    """El prototipo confundía 'bebestibles' con bebé y 'equivale' con 'vale'."""
    match = matcher.best(text)
    assert match is None or match.target not in {"articulos-bebe", "panales", "alimentacion-bebe"}


def test_multiword_needs_whole_phrase():
    m = KeywordMatcher([("a", "papas fritas"), ("b", "papa")])
    assert m.best("papas fritas").target == "a"
    assert m.best("papas cocidas").target == "b"
    assert m.best("fritas") is None


def test_matches_are_ranked_by_specificity_then_position():
    m = KeywordMatcher([("x", "leche"), ("y", "leche condensada"), ("z", "manjar")])
    found = [match.target for match in m.matches("manjar y leche condensada")]
    assert found == ["y", "z", "x"]
