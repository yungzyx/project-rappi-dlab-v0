"""Los desafíos del juego: lógica pura sobre un `ChallengeData` armado a mano.

Cada propiedad se revisa en TODOS los desafíos de un tipo que dan 200 semillas, no en uno solo: un error de la regla
(un distractor que sí pertenece a la vertical, uno relacionado con el ancla) aparece en alguna semilla.
"""

from rappi_ia import config
from rappi_ia.game.challenges import KINDS, ChallengeData, ConceptInfo, build_challenge

MIN = 20
SEEDS = range(200)
EMOJIS = {
    "pan": "🍞",
    "leche": "🥛",
    "cafe": "☕",
    "te": "🍵",
    "jugo": "🧃",
    "cerveza": "🍺",
    "vino": "🍷",
    "pizza": "🍕",
    "sushi": "🍣",
    "panales": "🧷",
    "collar": "📿",
}


def concept(concept_id: str, home: str | None, **items: int) -> ConceptInfo:
    return ConceptInfo(concept_id, concept_id.capitalize(), EMOJIS.get(concept_id, "🍎"), home, items)


def pairs(*couples: tuple[str, str]) -> dict[str, set[str]]:
    related: dict[str, set[str]] = {}
    for a, b in couples:
        related.setdefault(a, set()).add(b)
        related.setdefault(b, set()).add(a)
    return related


def make_data(**relations) -> ChallengeData:
    """El súper tiene 5 típicos; la cerveza pertenece al súper (21 >= 20) pero su vertical típica es licores."""
    concepts = [
        concept("pan", "supermercado", supermercado=50),
        concept("leche", "supermercado", supermercado=40),
        concept("cafe", "supermercado", supermercado=30),
        concept("te", "supermercado", supermercado=25),
        concept("jugo", "supermercado", supermercado=22),
        concept("cerveza", "licores", licores=60, supermercado=21),
        concept("vino", "licores", licores=50),
        concept("pizza", "restaurantes", restaurantes=80),
        concept("sushi", "restaurantes", restaurantes=70),
        concept("panales", "farmacia", farmacia=30, supermercado=5),
        concept("collar", "mall", mall=20),
    ]
    return ChallengeData({c.id: c for c in concepts}, **relations)


FULL = {
    "complements": pairs(("pan", "leche"), ("cerveza", "pizza"), ("cerveza", "sushi"), ("cerveza", "pan")),
    "substitutes": pairs(("cafe", "te"), ("cerveza", "vino")),
    "conflicts": pairs(("cerveza", "panales")),
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


def test_tipico_picks_a_typical_concept_and_three_outside_the_vertical():
    data = make_data(**FULL)

    for challenge in challenges_of("tipico", data):
        answer = data.concepts[challenge["answer"]]
        assert (
            answer.home == "supermercado"
        )  # típico, no solo «pertenece»: la cerveza (21 ítems) no puede ser la respuesta
        assert answer.items["supermercado"] >= MIN
        assert challenge["anchor"] == challenge["answer"]
        assert challenge["question"] == "¿Cuál de estos es típico de Súper?"
        for other in map(data.concepts.get, wrong_ids(challenge)):
            assert other.items.get("supermercado", 0) < MIN, other.id  # la cerveza pertenece al súper
            assert other.home != "supermercado", other.id
        assert challenge["explanation"].startswith(f"{config.AGENT_NAME} asocia ")
        assert "menos de 20 ahí" in challenge["explanation"]


def test_tipico_reaches_every_typical_concept_and_every_outsider_except_those_that_belong():
    data = make_data(**FULL)

    found = challenges_of("tipico", data)

    assert {c["answer"] for c in found} == {"pan", "leche", "cafe", "te", "jugo"}
    assert set().union(*map(wrong_ids, found)) == {"vino", "pizza", "sushi", "panales", "collar"}


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
    assert {c["anchor"] for c in found} >= {"cerveza", "pan"}  # el ancla con conflicto y sustituto también sale


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
    assert {c["anchor"] for c in found} == {"cafe", "te", "cerveza"}


def test_imposible_picks_a_conflict_against_safe_complements():
    data = make_data(**FULL)

    for challenge in challenges_of("imposible", data):
        assert challenge["anchor"] == "cerveza"
        assert challenge["answer"] == "panales"
        assert wrong_ids(challenge) == {"pizza", "sushi", "pan"}
        assert challenge["question"].startswith(f"¿Cuál nunca sugeriría {config.AGENT_NAME} junto a ")


def test_imposible_never_offers_a_conflict_as_a_safe_complement():
    data = make_data(
        complements=pairs(("cerveza", "pizza"), ("cerveza", "sushi"), ("cerveza", "pan"), ("cerveza", "panales")),
        conflicts=pairs(("cerveza", "panales")),
    )

    for challenge in challenges_of("imposible", data):
        assert "panales" not in wrong_ids(challenge)
        assert challenge["answer"] == "panales"


def test_imposible_needs_three_safe_complements():
    data = make_data(
        complements=pairs(("cerveza", "pizza"), ("cerveza", "sushi")), conflicts=pairs(("cerveza", "panales"))
    )

    kinds = {build_challenge(data, "licores", str(s), MIN)["kind"] for s in range(50)}

    assert "imposible" not in kinds


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
        for challenge in challenges_of(kind, data):
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
