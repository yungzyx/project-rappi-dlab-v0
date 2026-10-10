"""Reglas de palabras de Bigotes que no necesitan la base (revisión de las rondas 5 a 10)."""

import pytest

from rappi_ia.agent.rappi_agent import _moved, _names, _stem


@pytest.mark.parametrize(
    ("name", "word", "says"),
    [
        ("Pizza Champiñón", "champinones", True),  # plural pedido, singular en el nombre
        ("Roll Salmón Queso", "sal", False),  # «sin sal» no saca el salmón
        ("Salsa de tomate", "sal", False),
        ("Papas con sal de mar", "sal", True),
        ("Pasta con tomates", "tomate", True),
    ],
)
def test_words_match_whole_with_their_plural(name, word, says):
    assert _names(name, _stem(word)) is says


def test_free_from_is_said_only_with_sin_libre_or_zero():
    assert _names("Pan sin gluten", "gluten", free_from=True)
    assert _names("Pan pita libre de gluten", "gluten", free_from=True)
    assert not _names("Pan con gluten", "gluten", free_from=True)


def test_a_vertical_with_a_few_is_not_said_to_have_none():
    assert _moved("farmacia", "conveniencia", "helados", 18).startswith("En farmacia casi no hay «helados»")
    assert _moved("farmacia", "licores", "vino", 0).startswith("En farmacia no hay «vino»")


@pytest.fixture(scope="module")
def agent():
    from rappi_ia.agent.rappi_agent import RappiAgent

    return RappiAgent()


@pytest.mark.parametrize(
    ("text", "vertical", "avoided"),
    [
        ("sandwich sin palta", "restaurantes", ["palta"]),  # «palta» es palabra de los sándwiches y aun así se excluye
        ("empanadas sin queso", "restaurantes", ["queso"]),
        ("pizza sin las aceitunas", "restaurantes", ["aceituna"]),
        ("algo sin carne", "supermercado", []),  # «sin carne» nombra lo vegano
    ],
)
def test_what_is_asked_without(agent, text, vertical, avoided):
    assert agent._avoided(agent.understander.understand(None, text, vertical)) == avoided


def test_without_x_is_a_free_from_detail(agent):
    intent = agent.understander.understand(None, "vino sin alcohol", "licores")
    assert agent._detail(intent) == ("alcohol", "sin alcohol", True)
