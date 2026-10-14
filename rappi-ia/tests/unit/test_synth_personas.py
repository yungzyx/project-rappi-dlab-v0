"""Las personas simuladas (events/synth.py): la asiática y la parte que le deja el carrete.

Sin base de datos: el catálogo se arma a mano con los ítems que cada persona podría comprar.
"""

import io
import random
from datetime import datetime, timedelta

import pytest

from rappi_ia.concepts.taxonomy import load_taxonomy
from rappi_ia.events import synth

ASIAN_CONCEPTS = {"sushi", "asiatica", "despensa-asiatica", "bebidas-asiaticas", "snacks-asiaticos"}
ASIAN_VERTICALS = {"restaurantes", "supermercado", "turbo", "conveniencia"}
START = datetime(2026, 4, 1, tzinfo=synth.CHILE)
END = START + timedelta(weeks=26)


def _persona(persona_id: str) -> synth.Persona:
    return next(p for p in synth.PERSONAS if p.id == persona_id)


def _catalog(persona: synth.Persona) -> synth.Catalog:
    """Tres ítems por cada (vertical, concepto) que la persona compra: no falta nada que comprar."""
    items = {
        (vertical, concept): [("catalog_item", f"{vertical}-{concept}-{n}", 4000.0 + 500 * n) for n in range(3)]
        for vertical, concepts in persona.interests.items()
        for concept in concepts
    }
    return synth.Catalog(items=items, edges={}, names={}, ranked={})


def _simulate(persona: synth.Persona, users: int = 60, seed: int = 7) -> dict[str, str]:
    """Corre a `users` personas con el generador con semilla y devuelve lo que escribió (pedidos, líneas y eventos)."""
    rng = random.Random(seed)
    catalog = _catalog(persona)
    buffers = {key: io.StringIO() for key in ("users", "events", "orders", "lines")}
    counts = {"usuarios": 0, "eventos": 0, "pedidos": 0}
    for n in range(users):
        state = synth.UserState(f"syn-{seed}-{n:05d}", persona, "Santiago", persona.cadence_days)
        synth._simulate_user(rng, catalog, state, START + timedelta(days=n % 40), END, START, buffers, counts)
    return {key: buffer.getvalue() for key, buffer in buffers.items()}


def test_there_is_an_asian_persona_that_buys_in_the_four_verticals():
    persona = _persona("asiatico")

    assert set(persona.interests) == ASIAN_VERTICALS
    assert set().union(*persona.interests.values()) == ASIAN_CONCEPTS
    assert persona.interests["restaurantes"].keys() == {"sushi", "asiatica"}  # lo que se pide hecho


def test_every_concept_of_the_asian_persona_exists_in_the_taxonomy():
    concepts = load_taxonomy().concepts

    assert concepts.keys() >= ASIAN_CONCEPTS


def test_its_share_comes_out_of_the_party_persona():
    """El usuario pidió achicar el carrete y sumar al asiático: lo que gana uno lo pierde el otro."""
    asian, party = _persona("asiatico"), _persona("carrete")

    assert asian.share == pytest.approx(0.08)
    assert party.share == pytest.approx(0.14)
    assert asian.share + party.share == pytest.approx(0.22)  # el carrete tenía 0,22 solo


def test_the_party_persona_still_exists_and_keeps_its_interests():
    party = _persona("carrete")

    assert set(party.interests) == {"licores", "conveniencia", "restaurantes"}


def test_the_asian_persona_orders_sushi_and_the_new_concepts():
    """Con la semilla fija, sus pedidos pasan por sushi, comida asiática y los tres conceptos nuevos."""
    out = _simulate(_persona("asiatico"))

    ordered = {line.split("\t")[4] for line in out["lines"].splitlines()}  # concept_id de cada línea de pedido

    assert ordered == ASIAN_CONCEPTS


def test_its_orders_come_from_restaurants_supermarket_turbo_and_express():
    out = _simulate(_persona("asiatico"))

    verticals = {line.split("\t")[5] for line in out["orders"].splitlines()}

    assert verticals == ASIAN_VERTICALS


def test_the_generator_is_deterministic_with_the_same_seed():
    persona = _persona("asiatico")

    assert _simulate(persona, seed=11) == _simulate(persona, seed=11)
    assert _simulate(persona, seed=11) != _simulate(persona, seed=12)
