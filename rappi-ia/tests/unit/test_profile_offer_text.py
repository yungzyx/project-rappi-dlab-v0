"""El texto del momento `perfil` (offers/engine.py): «Como te gusta {gusto}…», con el `gusto` de cada perfil
(offers/perfiles.toml); sin él, el agente nombra el perfil."""

from dataclasses import replace

import pytest

from rappi_ia.offers.engine import _profile_text
from rappi_ia.offers.profiles import load_profiles


@pytest.mark.parametrize(
    ("profile_id", "text"),
    [
        ("asiatico", "Como te gusta lo asiático, mira esto en otras verticales."),
        ("cafe", "Como te gusta el café, mira esto en otras verticales."),
        ("italiano", "Como te gusta lo italiano, mira esto en otras verticales."),
        ("mascotas", "Como te gusta consentir a tu perro, mira esto en otras verticales."),
        ("carrete", "Como te gusta armar carrete, mira esto en otras verticales."),
    ],
)
def test_the_profile_text_says_what_the_person_likes(profile_id, text):
    assert _profile_text(load_profiles()[profile_id]) == text


def test_a_profile_without_likes_is_named():
    plain = replace(load_profiles()["mascotas"], likes=None)

    assert _profile_text(plain) == "Para tu perfil 🐶 Mascotero: mira esto en otras verticales."
