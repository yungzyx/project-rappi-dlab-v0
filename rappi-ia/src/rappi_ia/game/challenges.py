"""Desafíos de 4 alternativas del juego, armados en vivo con los conceptos y las relaciones de la base.

Las reglas son las del prototipo (`prototipo-app/src/game/challenges.js`): un concepto «pertenece» a una vertical si
tiene ahí al menos `min_items` productos, y es «típico» de la vertical donde más pesa (`typical_verticals`). Los
conceptos sensibles no entran nunca, ni como pregunta ni como alternativa. La misma vertical y semilla dan el mismo
desafío mientras la base no cambie.
"""

import random
from dataclasses import dataclass, field

from psycopg import Connection

from .. import config
from ..agent.verticals import typical_verticals

KINDS = ("tipico", "combo", "sustituto", "imposible")

LABELS = {
    "supermercado": "Súper",
    "conveniencia": "Express",
    "turbo": "Turbo",
    "licores": "Licores",
    "chocolateria": "Chocolatería",
    "restaurantes": "Restaurantes",
    "farmacia": "Farmacia",
    "mall": "Rappi Mall",
}
OPTIONS = 4
MIN_SAFE_COMPLEMENTS = 3  # «pareja imposible» necesita 3 distractores seguros


@dataclass(frozen=True)
class ConceptInfo:
    id: str
    name: str
    emoji: str
    home: str | None  # la vertical donde es más típico
    items: dict[str, int]  # productos por vertical


@dataclass
class ChallengeData:
    """Lo que los desafíos necesitan de la base, leído una vez por llamada. Las relaciones son simétricas."""

    concepts: dict[str, ConceptInfo]
    complements: dict[str, set[str]] = field(default_factory=dict)
    substitutes: dict[str, set[str]] = field(default_factory=dict)
    conflicts: dict[str, set[str]] = field(default_factory=dict)


_CONCEPTS = """
    SELECT c.concept_id, c.name, coalesce(c.emoji, ''), a.vertical, a.items
    FROM concepts c JOIN concept_assortment a USING (concept_id)
    WHERE NOT c.sensitive AND c.parent_id IS NOT NULL AND a.items > 0
    ORDER BY c.concept_id, a.vertical"""

_EDGES = """
    SELECT from_id, to_id FROM knowledge_edges
    WHERE relation = %s AND method = 'curado' AND from_kind = 'concept' AND to_kind = 'concept'"""

# «Nunca juntos» se cura de un grupo a un concepto (alcohol → pañales): se abre a cada concepto del grupo.
_GROUP_CONFLICTS = """
    SELECT c.concept_id, e.to_id FROM knowledge_edges e
    JOIN concepts c ON c.parent_id = e.from_id
    WHERE e.relation = 'conflicto' AND e.method = 'curado' AND e.from_kind = 'group' AND e.to_kind = 'concept'"""


def read_challenge_data(conn: Connection) -> ChallengeData:
    """Conceptos no sensibles con producto en alguna vertical, y sus relaciones curadas entre ellos."""
    items: dict[str, dict[str, int]] = {}
    names: dict[str, tuple[str, str]] = {}
    for concept_id, name, emoji, vertical, count in conn.execute(_CONCEPTS):
        names[concept_id] = (name, emoji)
        items.setdefault(concept_id, {})[vertical] = count
    homes = typical_verticals(conn)
    concepts = {
        cid: ConceptInfo(cid, names[cid][0], names[cid][1], homes.get(cid), items[cid]) for cid in sorted(items)
    }

    def symmetric(pairs) -> dict[str, set[str]]:
        related: dict[str, set[str]] = {}
        for a, b in pairs:
            if a in concepts and b in concepts and a != b:
                related.setdefault(a, set()).add(b)
                related.setdefault(b, set()).add(a)
        return related

    return ChallengeData(
        concepts=concepts,
        complements=symmetric(conn.execute(_EDGES, ("complementa",))),
        substitutes=symmetric(conn.execute(_EDGES, ("sustituye",))),
        conflicts=symmetric(conn.execute(_GROUP_CONFLICTS)),
    )


def make_challenge(conn: Connection, vertical: str, seed: str, min_items: int | None = None) -> dict | None:
    """El desafío de la vertical para la semilla, o `None` si no hay datos para armar uno."""
    return build_challenge(
        read_challenge_data(conn), vertical, seed, config.GAME_MIN_ITEMS if min_items is None else min_items
    )


def build_challenge(data: ChallengeData, vertical: str, seed: str, min_items: int) -> dict | None:
    """Desafío de 4 alternativas, puro y determinista: la misma vertical y semilla dan el mismo desafío."""
    view = _View(data, vertical, min_items)
    kinds = [kind for kind in KINDS if GENERATORS[kind][0](view)]
    if not kinds:
        return None
    rng = random.Random(f"{vertical}|{seed}")
    kind = rng.choice(kinds)
    made = GENERATORS[kind][1](view, rng)
    options = [made["correct"], *made["distractors"]]
    rng.shuffle(options)
    return {
        "id": f"{vertical}:{kind}:{made['anchor']}:{seed}",
        "kind": kind,
        "vertical": vertical,
        "anchor": made["anchor"],
        "question": made["question"],
        "options": options,
        "answer": made["correct"]["id"],
        "explanation": made["explanation"],
    }


class _View:
    """Los datos vistos desde una vertical y un mínimo de productos."""

    def __init__(self, data: ChallengeData, vertical: str, min_items: int):
        self.data, self.vertical, self.min_items = data, vertical, min_items
        self.concepts = data.concepts
        self.belonging = sorted(
            (c for c in data.concepts.values() if self.belongs(c)),
            key=lambda c: (-c.items[vertical], c.id),
        )

    def belongs(self, concept: ConceptInfo) -> bool:
        return concept.items.get(self.vertical, 0) >= self.min_items

    @property
    def label(self) -> str:
        return LABELS.get(self.vertical, self.vertical)

    @property
    def unit(self) -> str:
        return "platos" if self.vertical == "restaurantes" else "productos"

    def typical(self) -> list[ConceptInfo]:
        return [c for c in self.belonging if c.home == self.vertical]

    def outside(self) -> list[ConceptInfo]:
        """Distractores de «típico»: ni pertenecen a la vertical ni la tienen como típica."""
        return [c for c in self.concepts.values() if not self.belongs(c) and c.home != self.vertical]

    def with_relation(self, relations: dict[str, set[str]]) -> list[ConceptInfo]:
        return [c for c in self.belonging if relations.get(c.id)]

    def unrelated_to(self, concept_id: str) -> list[ConceptInfo]:
        """Conceptos sin ninguna relación con el ancla (ni el ancla misma): distractores seguros."""
        d = self.data
        return [
            c
            for c in self.concepts.values()
            if c.id != concept_id
            and c.id not in d.complements.get(concept_id, ())
            and c.id not in d.substitutes.get(concept_id, ())
            and c.id not in d.conflicts.get(concept_id, ())
        ]

    def safe_complements(self, concept_id: str) -> list[str]:
        """Complementos que no son pareja imposible: los únicos distractores seguros de «pareja imposible»."""
        conflicts = self.data.conflicts.get(concept_id, set())
        return sorted(self.data.complements.get(concept_id, set()) - conflicts)

    def impossible_anchors(self) -> list[ConceptInfo]:
        return [
            c
            for c in self.with_relation(self.data.conflicts)
            if len(self.safe_complements(c.id)) >= MIN_SAFE_COMPLEMENTS
        ]


def _name(concept: ConceptInfo) -> str:
    return f"{concept.emoji} {concept.name}"


def _option(concept: ConceptInfo) -> dict:
    return {"id": concept.id, "label": _name(concept)}


def _number(n: int) -> str:
    return f"{n:,}".replace(",", ".")  # 1.234, como en es-CL


def _sample(rng: random.Random, items: list, k: int) -> list:
    shuffled = list(items)
    rng.shuffle(shuffled)
    return shuffled[:k]


def _tipico(view: _View) -> bool:
    return bool(view.typical()) and len(view.outside()) >= OPTIONS - 1


def _make_tipico(view: _View, rng: random.Random) -> dict:
    correct = rng.choice(view.typical())
    return {
        "anchor": correct.id,
        "question": f"¿Cuál de estos es típico de {view.label}?",
        "correct": _option(correct),
        "distractors": [_option(c) for c in _sample(rng, view.outside(), OPTIONS - 1)],
        "explanation": (
            f"{config.AGENT_NAME} asocia {_name(correct)} con {view.label}, donde tiene "
            f"{_number(correct.items[view.vertical])} {view.unit}. "
            f"Las otras opciones tienen menos de {view.min_items} ahí."
        ),
    }


def _combo(view: _View) -> bool:
    return bool(_with_distractors(view, view.data.complements))


def _make_combo(view: _View, rng: random.Random) -> dict:
    anchor = rng.choice(_with_distractors(view, view.data.complements))
    correct = view.concepts[rng.choice(sorted(view.data.complements[anchor.id]))]
    elsewhere = ""
    if correct.home is not None and correct.home != view.vertical:
        elsewhere = f" Lo encuentras sobre todo en {LABELS.get(correct.home, correct.home)}."
    return {
        "anchor": anchor.id,
        "question": f"¿Qué combina con {_name(anchor)}?",
        "correct": _option(correct),
        "distractors": [_option(c) for c in _sample(rng, view.unrelated_to(anchor.id), OPTIONS - 1)],
        "explanation": f"{config.AGENT_NAME} sugiere {_name(anchor)} y {_name(correct)} juntos.{elsewhere}",
    }


def _sustituto(view: _View) -> bool:
    return bool(_with_distractors(view, view.data.substitutes))


def _make_sustituto(view: _View, rng: random.Random) -> dict:
    anchor = rng.choice(_with_distractors(view, view.data.substitutes))
    correct = view.concepts[rng.choice(sorted(view.data.substitutes[anchor.id]))]
    return {
        "anchor": anchor.id,
        "question": f"Si no hay {_name(anchor)}, ¿qué ofrece {config.AGENT_NAME} en su lugar?",
        "correct": _option(correct),
        "distractors": [_option(c) for c in _sample(rng, view.unrelated_to(anchor.id), OPTIONS - 1)],
        "explanation": f"Cuando no hay {_name(anchor)}, {config.AGENT_NAME} ofrece {_name(correct)} en su lugar.",
    }


def _imposible(view: _View) -> bool:
    return bool(view.impossible_anchors())


def _make_imposible(view: _View, rng: random.Random) -> dict:
    anchor = rng.choice(view.impossible_anchors())
    correct = view.concepts[rng.choice(sorted(view.data.conflicts[anchor.id]))]
    safe = [view.concepts[x] for x in _sample(rng, view.safe_complements(anchor.id), OPTIONS - 1)]
    return {
        "anchor": anchor.id,
        "question": f"¿Cuál nunca sugeriría {config.AGENT_NAME} junto a {_name(anchor)}?",
        "correct": _option(correct),
        "distractors": [_option(c) for c in safe],
        "explanation": (
            f"{config.AGENT_NAME} nunca sugiere {_name(anchor)} y {_name(correct)} juntos. "
            f"Las otras opciones sí las sugiere con {_name(anchor)}."
        ),
    }


def _with_distractors(view: _View, relations: dict[str, set[str]]) -> list[ConceptInfo]:
    """Anclas de la vertical con la relación y distractores de sobra para armar las 4 alternativas."""
    return [c for c in view.with_relation(relations) if len(view.unrelated_to(c.id)) >= OPTIONS - 1]


# Cada tipo: (¿hay datos en esta vertical?, cómo armarlo).
GENERATORS = {
    "tipico": (_tipico, _make_tipico),
    "combo": (_combo, _make_combo),
    "sustituto": (_sustituto, _make_sustituto),
    "imposible": (_imposible, _make_imposible),
}
