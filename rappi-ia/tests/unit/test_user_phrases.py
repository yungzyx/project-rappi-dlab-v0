"""Frases reales de usuarios (rondas de prueba actuando como usuario, 04-10). Cada caso falló alguna vez: el chat
buscaba la frase literal y traía cualquier cosa, o elegía una ocasión equivocada."""

import pytest

from rappi_ia.agent.understand import Understander

U = Understander()


@pytest.mark.parametrize(
    ("text", "concept"),
    [
        ("un completo", "sandwiches"),  # el hot dog chileno, no un «Aliño Completo»
        ("serbesa", "cerveza"),
        ("algo pa picar", "snacks-salados"),
        ("leche de formula", "alimentacion-bebe"),
        ("arena pal gato", "accesorios-mascota"),
    ],
)
def test_chilean_and_misspelled_words_name_the_right_concept(text, concept):
    assert U.understand(None, text, "supermercado").concepts[:1] == [concept]


@pytest.mark.parametrize(
    ("text", "occasion"),
    [
        ("copete barato", "carrete"),
        ("cumpleaños de mi hijo", "cumpleanos"),  # una fiesta infantil no va a Licores
        ("algo dulce", "antojo"),
        ("estoy aburrido", "panorama"),
    ],
)
def test_vague_requests_become_occasions(text, occasion):
    assert U.understand(None, text, "supermercado").occasion == occasion


@pytest.mark.parametrize(
    ("text", "kind"),
    [
        ("ayuda", "ayuda"),
        ("quien eres", "ayuda"),
        ("que puedes hacer", "ayuda"),
        ("hacen delivery?", "envio"),
        ("cuanto se demora", "envio"),
        ("tienen ofertas?", "ofertas"),
    ],
)
def test_questions_about_the_app_are_not_product_searches(text, kind):
    assert U.understand(None, text, "supermercado").kind == kind


def test_cheap_asks_for_the_cheapest_first():
    assert U.understand(None, "pizza barata", "restaurantes").cheapest
    assert U.understand(None, "cerveza mas barata", "licores").cheapest
    assert not U.understand(None, "cerveza", "licores").cheapest


# Ronda 2
@pytest.mark.parametrize(
    ("text", "concept"),
    [
        ("juguete pal gato", "accesorios-mascota"),  # «pal» = «para el»
        ("leche de almendras", "vegano"),  # «Alternativas vegetales»
    ],
)
def test_round_two_words(text, concept):
    assert U.understand(None, text, "supermercado").concepts[:1] == [concept]


def test_without_is_not_asking_for_it():
    """«algo sin azúcar» buscaba azúcar."""
    assert "azucar" not in U.understand(None, "algo sin azúcar", "supermercado").concepts


@pytest.mark.parametrize(
    ("text", "occasion"),
    [
        ("algo barato pa comer", "hambre"),  # «pa» = «para»
        ("estoy triste", "animo"),
        ("mi nieto viene el domingo y quiero comprarle algo", "regalo-nino"),
    ],
)
def test_round_two_occasions(text, occasion):
    assert U.understand(None, text, "supermercado").occasion == occasion


def test_asking_for_a_recommendation_is_not_a_search():
    for text in ("qué me recomiendas", "oye bigotes me recomiendas algo?"):
        assert U.understand(None, text, "supermercado").kind == "recomendar", text


def test_asking_someone_to_buy_for_you_is_rappifavor():
    assert U.understand(None, "necesito que me compren algo en una ferretería", None).service == "rappifavor"
