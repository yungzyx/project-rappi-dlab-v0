"""`make warm` calienta también el momento `perfil` de /agent/offer, una vez por perfil y sin persona: después de
arrancar, la primera escalera tardaba 4 a 5 s."""

import subprocess

from rappi_ia.config import PROJECT_ROOT
from rappi_ia.offers.profiles import load_profiles


def test_warm_asks_for_the_ladder_of_every_profile():
    dry_run = subprocess.run(
        ["make", "-n", "-C", str(PROJECT_ROOT), "warm"], capture_output=True, text=True, check=True
    ).stdout

    loop = f"for p in {' '.join(load_profiles())}; do"
    assert loop in dry_run
    calls = dry_run[dry_run.index(loop) :]
    assert "/agent/offer" in calls and '\\"moment\\": \\"perfil\\"' in calls and '\\"perfil\\": \\"$p\\"' in calls
