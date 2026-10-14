"""Perfiles de gusto y destinos (offers/perfiles.toml y offers/destinos.toml): los datos y su validación."""

import pytest
from rappi_scraper.storage.search import VERTICALS

from rappi_ia.concepts.taxonomy import load_complements, load_taxonomy
from rappi_ia.layers.segments import load_segment_rules
from rappi_ia.offers.guards import is_offerable, offerable_vertical
from rappi_ia.offers.profiles import load_destinations, load_profiles

# (vertical, conceptos, palabras) de cada peldaño, en orden: la tabla de la especificación.
LADDERS = {
    "asiatico": [
        ("restaurantes", ("sushi", "asiatica"), ()),
        ("turbo", ("despensa-asiatica",), ()),
        ("conveniencia", ("snacks-asiaticos", "bebidas-asiaticas"), ()),
        ("supermercado", ("despensa-asiatica", "bebidas-asiaticas"), ()),
        ("chocolateria", ("chocolates",), ("matcha",)),
    ],
    "cafe": [
        ("supermercado", ("cafe",), ()),
        ("turbo", ("cafe",), ()),
        ("conveniencia", ("cafe",), ()),
        ("mall", ("electrohogar", "cocina-menaje"), ("cafetera", "molinillo", "prensa francesa")),
        ("chocolateria", ("chocolates",), ("café",)),
    ],
    "italiano": [
        ("supermercado", ("pastas", "quesos", "salsas", "aceites-condimentos"), ()),
        ("conveniencia", ("pastas", "salsas"), ()),
        ("turbo", ("quesos", "pastas"), ()),
        ("mall", ("cocina-menaje",), ("pizza", "rallador", "pasta")),
        ("chocolateria", ("postres", "pasteleria"), ("tiramis", "cannoli", "amaretti", "panettone")),
    ],
    "mascotas": [
        ("conveniencia", ("alimento-perro",), ()),
        ("turbo", ("alimento-perro",), ()),
        ("mall", ("accesorios-mascota",), ()),
        ("supermercado", ("alimento-perro", "alimento-gato"), ()),
    ],
    "carrete": [
        ("turbo", ("hielo", "gaseosas"), ()),
        ("conveniencia", ("snacks-salados",), ()),
        ("supermercado", ("frutos-secos", "snacks-salados", "salsas"), ()),
        ("mall", ("decoracion",), ("vaso", "guirnalda", "globo", "cotillón")),
        ("restaurantes", ("pizza", "picoteo"), ()),
    ],
}
SEGMENTS = {
    "asiatico": ("sushi", "asiatica", "japonesa", "china"),
    "cafe": ("cafetero", "cafe-de-especialidad"),
    "italiano": ("italiana", "pastas"),
    "mascotas": ("tiene-perro",),
    "carrete": ("fiestero",),
}
TRIPS = {"asiatico": "japon", "cafe": "colombia", "italiano": "italia", "mascotas": None, "carrete": None}


def test_the_five_profiles_load_and_the_asian_one_is_the_only_main():
    profiles = load_profiles()
    assert list(profiles) == ["asiatico", "cafe", "italiano", "mascotas", "carrete"]
    assert [p.id for p in profiles.values() if p.main] == ["asiatico"]
    asian = profiles["asiatico"]
    assert (asian.name, asian.emoji, asian.min_level) == ("Amante de lo asiático", "🥢", "medio")
    assert all(p.min_level == "medio" for p in profiles.values())


def test_ladders_segments_and_trips_follow_the_spec():
    for profile in load_profiles().values():
        assert [(s.vertical, s.concepts, s.words) for s in profile.ladder] == LADDERS[profile.id], profile.id
        assert profile.segments == SEGMENTS[profile.id]
        assert profile.trip == TRIPS[profile.id]
        assert all(step.text for step in profile.ladder)


def test_every_concept_vertical_and_segment_exists():
    concepts = load_taxonomy().concepts
    segments = {rule.id: rule for rule in load_segment_rules()[1]}
    for profile in load_profiles().values():
        assert all(s in segments and not segments[s].sensitive for s in profile.segments), profile.id
        for step in profile.ladder:
            assert step.vertical in VERTICALS
            assert all(c in concepts for c in step.concepts), (profile.id, step.concepts)


def test_no_step_names_what_the_offer_guards_block():
    concepts = load_taxonomy().concepts
    for profile in load_profiles().values():
        for step in profile.ladder:
            assert offerable_vertical(step.vertical), (profile.id, step.vertical)
            assert all(is_offerable(concepts[c]) for c in step.concepts), (profile.id, step.concepts)


def test_the_party_profile_has_no_alcohol():
    concepts = load_taxonomy().concepts
    named = [concepts[c] for step in load_profiles()["carrete"].ladder for c in step.concepts]
    assert not [c.id for c in named if c.age_restricted or c.parent == "alcohol"]


def test_every_trip_is_a_question_with_two_sourced_facts():
    destinations = load_destinations()
    assert list(destinations) == ["japon", "colombia", "italia"]
    for destination in destinations.values():
        assert destination.text.startswith("¿Y si un día vas a ") and destination.text.endswith("?")
        assert len(destination.facts) == 2, destination.id
        assert all(f.text and f.source and f.url.startswith("https://") for f in destination.facts), destination.id
    assert [f.source for f in destinations["japon"].facts] == ["UNESCO", "Wikipedia"]
    assert "35 COM 8B.43" in destinations["colombia"].facts[0].source


def test_the_three_approved_graph_edges_exist():
    edges = {(source, target) for source, target, _ in load_complements()}
    assert {
        ("sushi", "despensa-asiatica"),
        ("sushi", "bebidas-asiaticas"),
        ("asiatica", "snacks-asiaticos"),
    } <= edges


# ── Validación: un error de datos se detecta al cargar, en español y con el id ────────────────────────────────

VALID_PROFILE = """
[[perfil]]
id = "prueba"
nombre = "Prueba"
emoji = "🧪"
segmentos = ["sushi"]
nivel_minimo = "medio"
viaje = "japon"

[[perfil.escalera]]
vertical = "turbo"
conceptos = ["hielo"]
texto = "Uno"

[[perfil.escalera]]
vertical = "supermercado"
conceptos = ["gaseosas"]
palabras = ["cola"]
texto = "Dos"
"""


def _write(tmp_path, text, name="perfiles.toml"):
    path = tmp_path / name
    path.write_text(text, encoding="utf-8")
    return path


def test_a_valid_profile_file_loads(tmp_path):
    profile = load_profiles(_write(tmp_path, VALID_PROFILE))["prueba"]
    assert (profile.main, profile.ladder[1].words, profile.trip) == (False, ("cola",), "japon")


@pytest.mark.parametrize(
    ("old", "new", "message"),
    [
        ('conceptos = ["hielo"]', 'conceptos = ["no-existe"]', "prueba.*no-existe"),
        ('conceptos = ["hielo"]', 'conceptos = ["cerveza"]', "prueba.*cerveza"),  # +18: el agente no lo ofrece
        ('conceptos = ["hielo"]', 'conceptos = ["medicamentos"]', "prueba.*medicamentos"),
        ('vertical = "turbo"', 'vertical = "luna"', "prueba.*luna"),
        ('vertical = "turbo"', 'vertical = "licores"', "prueba.*licores"),
        ('segmentos = ["sushi"]', 'segmentos = ["no-existe"]', "prueba.*no-existe"),
        ('segmentos = ["sushi"]', 'segmentos = ["vapeo"]', "prueba.*vapeo"),  # un segmento sensible no arma perfiles
        ('nivel_minimo = "medio"', 'nivel_minimo = "altisimo"', "prueba.*altisimo"),
        ('viaje = "japon"', 'viaje = "marte"', "prueba.*marte"),
        ('texto = "Uno"', 'texto = "Uno"\nconcepto = ["hielo"]', "prueba.*concepto"),  # una clave mal escrita
        ('nombre = "Prueba"\n', "", "prueba.*nombre"),
    ],
)
def test_a_bad_profile_names_its_id_and_the_bad_value(tmp_path, old, new, message):
    assert old in VALID_PROFILE
    with pytest.raises(ValueError, match=message):
        load_profiles(_write(tmp_path, VALID_PROFILE.replace(old, new, 1)))


def test_a_ladder_needs_two_steps(tmp_path):
    one_step = VALID_PROFILE[: VALID_PROFILE.rindex("[[perfil.escalera]]")]
    with pytest.raises(ValueError, match="prueba.*2 peldaños"):
        load_profiles(_write(tmp_path, one_step))


def test_only_one_profile_can_be_the_main_one(tmp_path):
    first = VALID_PROFILE.replace('nivel_minimo = "medio"', 'nivel_minimo = "medio"\nprincipal = true')
    second = first.replace('id = "prueba"', 'id = "otra"')
    with pytest.raises(ValueError, match="principal.*otra"):
        load_profiles(_write(tmp_path, first + second))


def test_profile_ids_are_unique(tmp_path):
    with pytest.raises(ValueError, match="prueba.*repetido"):
        load_profiles(_write(tmp_path, VALID_PROFILE + VALID_PROFILE))


VALID_DESTINATION = """
[[destino]]
id = "luna"
nombre = "La Luna"
texto = "¿Y si un día vas a la Luna?"

[[destino.hechos]]
texto = "Está lejos."
fuente = "Wikipedia"
url = "https://es.wikipedia.org/wiki/Luna"
"""


def test_a_valid_destination_file_loads(tmp_path):
    luna = load_destinations(_write(tmp_path, VALID_DESTINATION, "destinos.toml"))["luna"]
    assert (luna.name, luna.facts[0].source) == ("La Luna", "Wikipedia")


@pytest.mark.parametrize(
    ("old", "new", "message"),
    [
        ('url = "https://', 'url = "http://', "luna.*https"),
        ('fuente = "Wikipedia"\n', "", "luna.*fuente"),
        ('texto = "¿Y si un día vas a la Luna?"\n', "", "luna.*texto"),
    ],
)
def test_a_bad_destination_names_its_id(tmp_path, old, new, message):
    with pytest.raises(ValueError, match=message):
        load_destinations(_write(tmp_path, VALID_DESTINATION.replace(old, new, 1), "destinos.toml"))


def test_a_destination_needs_facts(tmp_path):
    without_facts = VALID_DESTINATION[: VALID_DESTINATION.index("[[destino.hechos]]")]
    with pytest.raises(ValueError, match="luna.*hechos"):
        load_destinations(_write(tmp_path, without_facts, "destinos.toml"))
