"""Las ofertas de «vertical por probar»: primero las de un concepto típico de la vertical, después las de cualquier otro
concepto y al final las sin concepto; dentro de cada grupo, de mayor a menor descuento (el orden en que llegan)."""

from rappi_ia.offers.engine import _typical_first

TYPICAL = {"cafe": "supermercado", "mantas": "mall", "galletas": "chocolateria"}


def deal(name: str, concept: str | None) -> dict:
    return {"name": name, "concept": concept}


def test_typical_offers_come_first_then_other_concepts_then_the_ones_without_concept():
    found = [
        deal("Spray para auto", None),  # el de mayor descuento
        deal("Manta", "mantas"),
        deal("Galletas", "galletas"),
        deal("Café", "cafe"),
        deal("Otro spray", None),
    ]

    ordered = [d["name"] for d in _typical_first(found, "supermercado", TYPICAL)]

    assert ordered == ["Café", "Manta", "Galletas", "Spray para auto", "Otro spray"]


def test_nothing_is_dropped_when_no_offer_is_typical():
    found = [deal("Manta", "mantas"), deal("Spray para auto", None)]

    assert _typical_first(found, "supermercado", TYPICAL) == found
