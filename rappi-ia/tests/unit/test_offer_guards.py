"""Las guardias de ofertas: lo que Mochi nunca propone por su cuenta (rappi_ia/offers/guards.py)."""

import pytest

from rappi_ia.catalog.stores import NOT_PUSHED_SUBVERTICALS
from rappi_ia.concepts.taxonomy import load_taxonomy
from rappi_ia.demo.seed import DEMO_VERTICALS
from rappi_ia.offers.guards import (
    ALCOHOL_NAME_WORDS,
    NOT_PLANNABLE_OCCASIONS,
    OFFER_BLOCKED_VERTICALS,
    alcohol_in_name,
    is_offerable,
    is_plannable,
    offerable_vertical,
    plannable_occasion,
    plannable_vertical,
    unofferable_subverticals,
)


def concept(concept_id: str):
    return load_taxonomy().concepts[concept_id]


def test_alcohol_baby_health_and_sensitive_concepts_are_not_offerable():
    # alcohol, bebé, farmacia (sensible) y bienestar sexual (sensible y +18)
    for concept_id in ("cerveza", "vino", "panales", "medicamentos", "bienestar-sexual"):
        assert not is_offerable(concept(concept_id)), concept_id


def test_every_concept_of_the_blocked_groups_is_blocked():
    """Un concepto nuevo de alcohol, bebé, salud, tabaco o bienestar sexual queda bloqueado sin tocar las guardias."""
    blocked_groups = {"alcohol", "bebe", "salud", "tabaco", "adultos"}
    members = [c for c in load_taxonomy().concepts.values() if c.parent in blocked_groups]
    assert {c.parent for c in members} == blocked_groups
    assert [c.id for c in members if is_offerable(c)] == []


def test_the_whole_health_group_is_blocked_even_when_the_concept_itself_is_harmless():
    # «Farmacia y cuidado personal»: vitaminas, higiene y dermocosmética no son sensibles, pero son salud.
    for concept_id in ("vitaminas", "dermocosmetica", "higiene-personal", "cuidado-oral", "alimentacion-bebe"):
        assert not concept(concept_id).sensitive and not concept(concept_id).age_restricted
        assert not is_offerable(concept(concept_id)), concept_id


def test_flags_block_a_concept_whatever_its_group():
    taxonomy = load_taxonomy()
    for flagged in (c for c in taxonomy.concepts.values() if c.sensitive or c.age_restricted):
        assert not is_offerable(flagged), flagged.id


def test_everyday_concepts_are_offerable():
    for concept_id in ("pizza", "snacks-salados", "gaseosas", "chocolates", "hielo", "ropa", "golosinas"):
        assert is_offerable(concept(concept_id)), concept_id


def test_pharmacy_and_licores_are_the_only_blocked_verticals():
    assert OFFER_BLOCKED_VERTICALS == ("farmacia", "licores")
    assert {v for v in DEMO_VERTICALS if not offerable_vertical(v)} == {"farmacia", "licores"}


def test_stores_labelled_pharmacy_sex_shop_or_smoking_shop_are_the_ones_stage_2_does_not_push():
    # Se reutiliza la lista de catalog/stores.py: no hay otra copia que se pueda desalinear.
    assert unofferable_subverticals() == list(NOT_PUSHED_SUBVERTICALS)
    assert {"Farmacia", "Sex shop", "Smoking shop"} <= set(unofferable_subverticals())


def test_a_chosen_occasions_kit_may_have_alcohol_but_never_sensitive_baby_or_health():
    for concept_id in ("cerveza", "vino", "pisco", "pizza", "hielo"):
        assert is_plannable(concept(concept_id)), concept_id
    for concept_id in ("panales", "medicamentos", "vitaminas", "bienestar-sexual", "alimentacion-bebe"):
        assert not is_plannable(concept(concept_id)), concept_id
    taxonomy = load_taxonomy()
    assert all(is_plannable(c) for c in taxonomy.concepts.values() if c.age_restricted and not c.sensitive)


def test_baby_and_sick_occasions_are_not_planned():
    taxonomy = load_taxonomy()
    assert NOT_PLANNABLE_OCCASIONS == ("guagua", "enfermo")
    assert {o.id for o in taxonomy.occasions.values() if not plannable_occasion(o)} == {"guagua", "enfermo"}


def test_a_kit_never_comes_from_pharmacy_and_only_alcohol_comes_from_licores():
    for concept_id in ("cerveza", "pizza"):
        assert not plannable_vertical("farmacia", concept(concept_id))
    assert plannable_vertical("licores", concept("cerveza")) and plannable_vertical("licores", concept("vino"))
    assert not plannable_vertical("licores", concept("gaseosas"))
    for vertical in ("supermercado", "conveniencia", "turbo", "mall", "chocolateria", "restaurantes"):
        assert plannable_vertical(vertical, concept("cerveza")) and plannable_vertical(vertical, concept("pizza"))


@pytest.mark.parametrize(
    "name",
    [
        "Soju Uva Verde 13.0",  # en la base real: categoría «Frutas», sin marca de alcohol ni +18
        "Patagonia Cerveza Red Lager Austral",  # en «frutas»
        "3R Pisco 35 + Coca-Cola Gaseosa + Hielo Líquidos",  # en «gaseosas»
        "Viejo de Caldas Ron",  # en «decoracion»
        "Toreto Vino Tinto Cabernet Sauvignon Gran Reserva",  # en «utiles»
        "Gin Santos + 2 Red Bull Yellow + Sprite Zero 1.5lts + Hielo 2kg",
        "Makgeolli Original 750 ml",
        "Umeshu Choya 500 ml",
        "Sake Gekkeikan 750 ml",
        "Pack Cervezas Kunstmann",  # el plural también
        "Licores Mistral Surtidos",
    ],
)
def test_a_catalog_name_that_says_alcohol_is_never_offered(name):
    """Las marcas de la tienda (`is_alcoholic`, `age_restricted`) y la categoría pueden estar mal; el nombre lo dice."""
    assert alcohol_in_name("catalog_item", name)


@pytest.mark.parametrize(
    ("entity_type", "name"),
    [
        ("catalog_item", "Ronda de quesos"),  # «ron» es palabra entera: ni «ronda» ni «roncito»
        ("catalog_item", "Roncito Chocolate"),
        ("catalog_item", "Ginger Ale 350 ml"),  # «gin» tampoco está en «ginger»
        ("menu_item", "Sake Roll"),  # en un menú «sake» es salmón: los platos no se revisan
        ("menu_item", "Sake Nigiri 2 piezas"),
    ],
)
def test_words_that_only_look_like_alcohol_are_not_blocked(entity_type, name):
    assert not alcohol_in_name(entity_type, name)


def test_the_alcohol_words_are_whole_words_in_spanish_and_include_the_asian_ones():
    assert {"soju", "makgeolli", "umeshu", "sake", "ron", "gin", "licor"} <= ALCOHOL_NAME_WORDS


def test_vertical_to_try_never_offers_a_deal_whose_name_says_alcohol(monkeypatch):
    """«Vertical por probar» ofrece rebajas de `deals()`, que trae `is_alcoholic OR age_restricted` de la tienda: un
    soju sin esas marcas tampoco se ofrece."""
    from rappi_ia.offers import engine

    found = [
        {"name": "Soju Uva Verde 13.0", "concept": "frutas", "age_restricted": False, "store_id": 1},
        {"name": "Uva Verde 1 kg", "concept": "frutas", "age_restricted": False, "store_id": 1},
    ]

    class NoBlockedStores:
        def execute(self, *args):
            return []

    monkeypatch.setattr(engine, "deals", lambda conn, vertical, limit: found)
    monkeypatch.setattr(engine, "typical_verticals", lambda conn: {})

    offered = engine._offerable_deals(NoBlockedStores(), "supermercado")

    assert [d["name"] for d in offered] == ["Uva Verde 1 kg"]
