"""Las guardias de ofertas: lo que Mochi nunca propone por su cuenta (rappi_ia/offers/guards.py)."""

from rappi_ia.catalog.stores import NOT_PUSHED_SUBVERTICALS
from rappi_ia.concepts.taxonomy import load_taxonomy
from rappi_ia.demo.seed import DEMO_VERTICALS
from rappi_ia.offers.guards import (
    OFFER_BLOCKED_VERTICALS,
    is_offerable,
    offerable_vertical,
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
