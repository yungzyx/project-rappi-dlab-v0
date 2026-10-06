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
    assert found == ["y", "z"]  # "leche" queda dentro de "leche condensada"
    assert [x.target for x in m.matches("leche y manjar")] == ["x", "z"]


def test_overlapping_matches_keep_only_the_most_specific():
    m = KeywordMatcher([("snack", "papas fritas"), ("verdura", "papas"), ("cerveza", "cervezas")])
    assert [x.target for x in m.matches("cervezas y papas fritas")] == ["snack", "cerveza"]


def test_avoid_words_block_a_keyword_in_the_same_name_but_not_elsewhere():
    m = KeywordMatcher([("agua", "agua"), ("hogar", "bolsa")], avoid=[("agua", "bolsa"), ("agua", "gas natural")])
    assert m.best("Agua mineral 600 ml").target == "agua"
    assert [x.target for x in m.matches("Bolsa para agua caliente")] == ["hogar"]  # la bolsa sigue siendo bolsa
    assert [x.target for x in m.matches("Bolsas de agua")] == ["hogar"]  # el plural también cuenta
    assert m.best("Agua con gas natural") is None  # una frase de varias palabras bloquea si está completa y seguida
    assert m.best("Agua natural con gas").target == "agua"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Mood Aceite Esencial Roll-On Calma", None),
        ("Sticki Rolls Set Brazalete", None),
        ("California Roll 10 piezas", "sushi"),
        ("Hilos Mulina Ariadna Café 1728", None),
        ("Botón Nacar Figuras Café Flor", None),
        ("Café Molido 250 g", "cafe"),
        ("Bolsa Para Agua Polar", None),
        ("Dispensador Para Agua", None),
        ("Agua Mineral Sin Gas 600 cc", "agua"),
        ("Té Polvo Leche Real", None),  # antes caía en lácteos por «leche»
        ("Nesquik Saborizante Para Leche", None),
        ("Leche Entera 1 L", "lacteos"),
        ("Vilay Bebida de Coco Natural", None),
        ("Bebida Isotónica 500 ml", "gaseosas"),
        ("Dispensador de Jabón Vidrio", None),
        ("Jabón Líquido Manos 500 ml", "higiene-personal"),
        ("Collar Gato Smart Id Retro", "accesorios-mascota"),
        ("Doco Arnes Perro Athletica Gris", "accesorios-mascota"),
        ("Doco Correa Perro Reflectante Large", "accesorios-mascota"),
        ("Collar Ajustable Para Gatos Casaideas", "accesorios-mascota"),
        ("Set De Arnés Y Correa Azul Marino Para Perros", "accesorios-mascota"),
        ("Alimento Seco Perro Adulto", "alimento-perro"),
        ("Comida Para Gatos Adultos Salmón", "alimento-gato"),
    ],
)
def test_known_false_positives_of_name_rules(matcher, text, expected):
    match = matcher.best(text)
    assert (match.target if match else None) == expected
