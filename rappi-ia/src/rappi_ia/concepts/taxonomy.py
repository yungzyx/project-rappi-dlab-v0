"""Carga la taxonomía propia (`taxonomy.toml`) y los complementos curados (`complements.toml`)."""

import tomllib
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from rappi_scraper.storage.search import VERTICALS

DATA_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Concept:
    id: str
    name: str
    emoji: str
    parent: str | None
    keywords: tuple[str, ...] = ()
    sensitive: bool = False
    age_restricted: bool = False

    @property
    def label(self) -> str:
        return f"{self.emoji} {self.name}"


@dataclass(frozen=True)
class Occasion:
    id: str
    name: str
    emoji: str
    keywords: tuple[str, ...]
    concepts: tuple[str, ...]
    vertical: str | None = None  # vertical fijo ("hambre ya" = pedir a un restaurante); si no, el del surtido


@dataclass(frozen=True)
class Taxonomy:
    version: str
    groups: dict[str, Concept]
    concepts: dict[str, Concept]  # solo hojas
    occasions: dict[str, Occasion]

    def get(self, concept_id: str) -> Concept:
        return self.concepts.get(concept_id) or self.groups[concept_id]

    def all_nodes(self) -> list[Concept]:
        """Grupos primero (son padres de las hojas)."""
        return [*self.groups.values(), *self.concepts.values()]


@cache
def load_taxonomy(path: Path = DATA_DIR / "taxonomy.toml") -> Taxonomy:
    raw = tomllib.loads(path.read_text(encoding="utf-8"))
    groups = {g["id"]: Concept(g["id"], g["name"], g["emoji"], None) for g in raw["group"]}
    concepts = {
        c["id"]: Concept(
            id=c["id"],
            name=c["name"],
            emoji=c["emoji"],
            parent=c["parent"],
            keywords=tuple(c.get("keywords", ())),
            sensitive=c.get("sensitive", False),
            age_restricted=c.get("age_restricted", False),
        )
        for c in raw["concept"]
    }
    occasions = {
        o["id"]: Occasion(o["id"], o["name"], o["emoji"], tuple(o["keywords"]), tuple(o["concepts"]), o.get("vertical"))
        for o in raw.get("occasion", ())
    }
    _validate(groups, concepts, occasions)
    return Taxonomy(raw["version"], groups, concepts, occasions)


@cache
def load_complements(path: Path = DATA_DIR / "complements.toml") -> tuple[tuple[str, str, float], ...]:
    edges = tomllib.loads(path.read_text(encoding="utf-8"))["edges"]
    taxonomy = load_taxonomy()
    for source, target, weight in edges:
        if source not in taxonomy.concepts or target not in taxonomy.concepts:
            raise ValueError(f"Complemento con concepto desconocido: {source} → {target}")
        if not 0 <= weight <= 1:
            raise ValueError(f"Peso fuera de [0, 1]: {source} → {target} = {weight}")
    return tuple((s, t, float(w)) for s, t, w in edges)


def _validate(groups: dict, concepts: dict, occasions: dict) -> None:
    clashes = groups.keys() & concepts.keys()
    if clashes:
        raise ValueError(f"Ids repetidos entre grupos y conceptos: {sorted(clashes)}")
    orphans = [c.id for c in concepts.values() if c.parent not in groups]
    if orphans:
        raise ValueError(f"Conceptos con grupo inexistente: {orphans}")
    for occasion in occasions.values():
        unknown = [c for c in occasion.concepts if c not in concepts]
        if unknown:
            raise ValueError(f"Ocasión {occasion.id} con conceptos inexistentes: {unknown}")
        if occasion.vertical and occasion.vertical not in VERTICALS:
            raise ValueError(f"Ocasión {occasion.id} con vertical inexistente: {occasion.vertical}")
