"""Los desafíos del juego: lógica pura sobre un `ChallengeData` armado a mano.

Cada propiedad se revisa en TODOS los desafíos de un tipo que dan 200 semillas, no en uno solo: un error de la regla
(un distractor que sí pertenece a la vertical, uno relacionado con el ancla) aparece en alguna semilla.
Los conceptos llevan su grupo y su marca +18 de taxonomy.toml: las guardias de ofertas se aplican igual que en la base.
"""

from rappi_ia import config
from rappi_ia.game.challenges import KINDS, LABELS, ChallengeData, ConceptInfo, build_challenge

MIN = 20
SEEDS = range(200)
EMOJIS = {
    "pan": "🍞",
    "leche": "🥛",
    "cafe": "☕",
    "te": "🍵",
    "jugo": "🧃",
    "pescado": "🐟",
    "chocolate": "🍫",
    "cerveza": "🍺",
    "vino": "🍷",
    "pizza": "🍕",
    "sushi": "🍣",
    "panales": "🧷",
    "toallitas": "🧻",
    "collar": "📿",
    "juguete": "🧸",
}
# Grupo de cada concepto, como en taxonomy.toml.
PARENTS = {
    "pan": "despensa",
    "leche": "frescos",
    "cafe": "despensa",
    "te": "despensa",
    "jugo": "bebidas",
    "pescado": "frescos",
    "chocolate": "dulces",
    "cerveza": "alcohol",
    "vino": "alcohol",
    "pizza": "comida",
    "sushi": "comida",
    "panales": "bebe",
    "toallitas": "bebe",
    "collar": "moda",
    "juguete": "juguetes",
}
AGE_RESTRICTED = {"cerveza", "vino"}
ALCOHOL = {"cerveza", "vino"}
BABY = {"panales", "toallitas"}


def concept(concept_id: str, home: str | None, **items: int) -> ConceptInfo:
    return ConceptInfo(
        concept_id,
        concept_id.capitalize(),
        EMOJIS.get(concept_id, "🍎"),
        home,
        items,
        parent=PARENTS.get(concept_id),
        age_restricted=concept_id in AGE_RESTRICTED,
    )


def pairs(*couples: tuple[str, str]) -> dict[str, set[str]]:
    related: dict[str, set[str]] = {}
    for a, b in couples:
        related.setdefault(a, set()).add(b)
        related.setdefault(b, set()).add(a)
    return related


def make_data(**relations) -> ChallengeData:
    """El súper tiene 6 típicos; el chocolate y la cerveza pertenecen al súper (21 >= 20) pero son típicos de otra
    vertical."""
    concepts = [
        concept("pan", "supermercado", supermercado=50),
        concept("leche", "supermercado", supermercado=40),
        concept("cafe", "supermercado", supermercado=30),
        concept("te", "supermercado", supermercado=25),
        concept("pescado", "supermercado", supermercado=24),
        concept("jugo", "supermercado", supermercado=22),
        concept("chocolate", "chocolateria", chocolateria=60, supermercado=21),
        concept("cerveza", "licores", licores=60, supermercado=21),
        concept("vino", "licores", licores=50),
        concept("pizza", "restaurantes", restaurantes=80),
        concept("sushi", "restaurantes", restaurantes=70),
        concept("panales", "farmacia", farmacia=30, supermercado=5),
        concept("toallitas", "farmacia", farmacia=25),
        concept("collar", "mall", mall=20),
        concept("juguete", "mall", mall=25),
    ]
    return ChallengeData({c.id: c for c in concepts}, **relations)


# Como en la base: el pescado combina con vino, y el alcohol está en conflicto con pañales y juguetes infantiles.
COMPLEMENTS = (("pan", "leche"), ("pescado", "vino"), ("cerveza", "pizza"), ("cerveza", "sushi"), ("cerveza", "pan"))
BABY_COMPLEMENTS = (("panales", "toallitas"), ("panales", "leche"), ("panales", "pan"), ("panales", "jugo"))
FULL = {
    "complements": pairs(*COMPLEMENTS),
    "substitutes": pairs(("cafe", "te"), ("cerveza", "vino")),
    "conflicts": pairs(("cerveza", "panales"), ("cerveza", "juguete")),
}


def challenges_of(kind: str, data: ChallengeData, vertical: str = "supermercado") -> list[dict]:
    """Todos los desafíos de un tipo que dan las semillas de prueba, con su forma ya revisada."""
    found = []
    for seed in SEEDS:
        challenge = build_challenge(data, vertical, str(seed), MIN)
        if challenge and challenge["kind"] == kind:
            check_shape(challenge)
            found.append(challenge)
    assert len(found) >= 10, f"Pocos desafíos «{kind}» para revisar: {len(found)}"
    return found


def check_shape(challenge: dict) -> None:
    ids = [option["id"] for option in challenge["options"]]
    assert len(ids) == 4
    assert len(set(ids)) == 4
    assert len({option["label"] for option in challenge["options"]}) == 4
    assert challenge["answer"] in ids
    assert challenge["id"].startswith(f"{challenge['vertical']}:{challenge['kind']}:{challenge['anchor']}:")
    assert challenge["question"] and challenge["explanation"]


def wrong_ids(challenge: dict) -> set[str]:
    return {option["id"] for option in challenge["options"]} - {challenge["answer"]}


def used_ids(challenge: dict) -> set[str]:
    return {challenge["anchor"], challenge["answer"], *(option["id"] for option in challenge["options"])}


def test_tipico_picks_a_typical_concept_and_three_outside_the_vertical():
    data = make_data(**FULL)

    for challenge in challenges_of("tipico", data):
        answer = data.concepts[challenge["answer"]]
        assert answer.home == "supermercado"  # típico, no solo «pertenece»: el chocolate (21 ítems) no puede serlo
        assert answer.items["supermercado"] >= MIN
        assert challenge["anchor"] == challenge["answer"]
        assert challenge["question"] == "¿Cuál de estos es típico de Súper?"
        for other in map(data.concepts.get, wrong_ids(challenge)):
            assert other.items.get("supermercado", 0) < MIN, other.id  # el chocolate pertenece al súper
            assert other.home != "supermercado", other.id
        assert challenge["explanation"].startswith(f"{config.AGENT_NAME} asocia ")
        assert "menos de 20 ahí" in challenge["explanation"]


def test_tipico_reaches_every_typical_concept_and_every_offerable_outsider():
    data = make_data(**FULL)

    found = challenges_of("tipico", data)

    assert {c["answer"] for c in found} == {"pan", "leche", "cafe", "te", "pescado", "jugo"}
    # Ni el chocolate ni la cerveza (pertenecen al súper), ni el vino ni lo de bebé (no se ofrecen fuera de Licores).
    assert set().union(*map(wrong_ids, found)) == {"pizza", "sushi", "collar", "juguete"}


def test_combo_picks_a_complement_and_unrelated_distractors():
    data = make_data(**FULL)

    found = challenges_of("combo", data)

    for challenge in found:
        anchor = challenge["anchor"]
        assert challenge["answer"] in data.complements[anchor]
        assert challenge["question"].startswith("¿Qué combina con ")
        for other in wrong_ids(challenge):
            assert other != anchor
            assert other not in data.complements.get(anchor, set()), (anchor, other)
            assert other not in data.substitutes.get(anchor, set()), (anchor, other)
            assert other not in data.conflicts.get(anchor, set()), (anchor, other)
    # El pescado no: su único complemento es el vino, y fuera de Licores el agente no lo sugiere.
    assert {c["anchor"] for c in found} == {"pan", "leche"}


def test_combo_says_where_a_complement_from_another_vertical_is_found():
    data = make_data(complements=pairs(("pan", "pizza")))

    challenge = challenges_of("combo", data)[0]

    assert challenge["anchor"] == "pan"
    assert challenge["answer"] == "pizza"
    assert "Lo encuentras sobre todo en Restaurantes." in challenge["explanation"]


def test_sustituto_picks_a_substitute():
    data = make_data(**FULL)

    found = challenges_of("sustituto", data)

    for challenge in found:
        anchor = challenge["anchor"]
        assert challenge["answer"] in data.substitutes[anchor]
        assert challenge["question"].startswith("Si no hay ")
        assert challenge["question"].endswith(f", ¿qué ofrece {config.AGENT_NAME} en su lugar?")
        assert challenge["explanation"].startswith("Cuando no hay ")
        for other in wrong_ids(challenge):
            assert other != anchor
            assert other not in data.complements.get(anchor, set()), (anchor, other)
            assert other not in data.substitutes.get(anchor, set()), (anchor, other)
            assert other not in data.conflicts.get(anchor, set()), (anchor, other)
    assert {c["anchor"] for c in found} == {"cafe", "te"}  # la cerveza pertenece al súper, pero no se ofrece ahí


def test_imposible_picks_a_conflict_against_safe_complements():
    data = make_data(**FULL)

    for challenge in challenges_of("imposible", data, "licores"):
        assert challenge["anchor"] == "cerveza"
        assert challenge["answer"] == "juguete"  # los pañales no: lo de bebé no sale ni en Licores
        assert wrong_ids(challenge) == {"pizza", "sushi", "pan"}
        assert challenge["question"].startswith(f"¿Cuál nunca sugeriría {config.AGENT_NAME} junto a ")


def test_imposible_never_offers_a_conflict_as_a_safe_complement():
    data = make_data(
        complements=pairs(("cerveza", "pizza"), ("cerveza", "sushi"), ("cerveza", "pan"), ("cerveza", "juguete")),
        conflicts=pairs(("cerveza", "juguete")),
    )

    for challenge in challenges_of("imposible", data, "licores"):
        assert "juguete" not in wrong_ids(challenge)
        assert challenge["answer"] == "juguete"


def test_imposible_needs_three_safe_complements():
    data = make_data(
        complements=pairs(("cerveza", "pizza"), ("cerveza", "sushi")), conflicts=pairs(("cerveza", "juguete"))
    )

    kinds = {build_challenge(data, "licores", str(s), MIN)["kind"] for s in range(50)}

    assert "imposible" not in kinds


def test_outside_licores_every_concept_shown_is_one_the_agent_offers():
    """Las guardias de ofertas: fuera de Licores, ni alcohol ni bebé (ni salud) como ancla, respuesta o alternativa."""
    data = make_data(**{**FULL, "complements": pairs(*COMPLEMENTS, *BABY_COMPLEMENTS)})
    kinds = set()

    for vertical in set(LABELS) - {"licores"}:
        for seed in SEEDS:
            challenge = build_challenge(data, vertical, str(seed), MIN)
            if challenge is None:
                continue
            kinds.add(challenge["kind"])
            assert not used_ids(challenge) & (ALCOHOL | BABY), (vertical, seed, challenge)

    assert kinds == {"tipico", "combo", "sustituto"}  # «pareja imposible» queda solo en Licores
    assert build_challenge(data, "farmacia", "0", MIN) is None  # solo pañales y toallitas pertenecen a Farmacia


def test_in_licores_alcohol_is_allowed_but_never_baby():
    """En Licores la persona eligió el alcohol (`is_plannable`): vino y cerveza sí, bebé nunca."""
    data = make_data(**{**FULL, "complements": pairs(*COMPLEMENTS, *BABY_COMPLEMENTS)})

    for seed in SEEDS:
        challenge = build_challenge(data, "licores", str(seed), MIN)
        assert not used_ids(challenge) & BABY, (seed, challenge)
    combos = challenges_of("combo", data, "licores")
    assert {c["anchor"] for c in combos} == {"cerveza", "vino"}
    assert {c["answer"] for c in combos if c["anchor"] == "vino"} == {"pescado"}


def test_same_seed_same_challenge_other_seed_can_differ():
    data = make_data(**FULL)

    first = build_challenge(data, "supermercado", "7", MIN)
    again = build_challenge(data, "supermercado", "7", MIN)
    others = {build_challenge(data, "supermercado", str(s), MIN)["id"] for s in range(30)}

    assert first == again
    assert len(others) > 1


def test_no_kind_available_returns_none():
    data = make_data(**FULL)

    assert build_challenge(data, "viajes", "0", MIN) is None
    assert build_challenge(data, "supermercado", "0", 10_000) is None
    assert build_challenge(ChallengeData({}), "supermercado", "0", MIN) is None


def test_only_the_kinds_with_data_are_offered():
    data = make_data()  # sin relaciones: solo «típico»

    kinds = {build_challenge(data, "supermercado", str(s), MIN)["kind"] for s in range(40)}

    assert kinds == {"tipico"}
    assert set(KINDS) == {"tipico", "combo", "sustituto", "imposible"}


def test_labels_are_emoji_and_name():
    data = make_data(**FULL)

    for kind in KINDS:
        vertical = "licores" if kind == "imposible" else "supermercado"
        for challenge in challenges_of(kind, data, vertical):
            for option in challenge["options"]:
                c = data.concepts[option["id"]]
                assert option["label"] == f"{EMOJIS[c.id]} {c.name}"
            anchor = data.concepts[challenge["anchor"]]
            assert f"{EMOJIS[anchor.id]} {anchor.name}" in challenge["question"] + challenge["explanation"]


def test_explanation_formats_thousands_like_chilean_spanish():
    data = ChallengeData(
        {
            c.id: c
            for c in [
                concept("pan", "supermercado", supermercado=1234),
                concept("pizza", "restaurantes", restaurantes=80),
                concept("sushi", "restaurantes", restaurantes=70),
                concept("collar", "mall", mall=20),
            ]
        }
    )

    challenge = build_challenge(data, "supermercado", "0", MIN)

    assert challenge["answer"] == "pan"
    assert "1.234 productos" in challenge["explanation"]
