"""El texto del momento `perfil` (offers/engine.py): sale del nombre del perfil, sin una frase escrita para cada uno."""

from dataclasses import replace

import pytest

from rappi_ia.offers.engine import _profile_text
from rappi_ia.offers.profiles import load_profiles


@pytest.mark.parametrize(
    ("profile_id", "text"),
    [
        ("asiatico", "Como te gusta lo asiático, mira esto en otras verticales."),
        ("cafe", "Como te gusta el café, mira esto en otras verticales."),  # «Amante del café»
        ("italiano", "Como te gusta lo italiano, mira esto en otras verticales."),
        ("mascotas", "Para tu perfil 🐶 Mascotero: mira esto en otras verticales."),  # un nombre sin «Amante de»
        ("carrete", "Para tu perfil 🎉 Carrete: mira esto en otras verticales."),
    ],
)
def test_the_profile_text_comes_from_its_name(profile_id, text):
    assert _profile_text(load_profiles()[profile_id]) == text


def test_a_new_lover_profile_needs_no_new_text():
    peruvian = replace(load_profiles()["asiatico"], name="Amante de la cocina peruana")

    assert _profile_text(peruvian) == "Como te gusta la cocina peruana, mira esto en otras verticales."
