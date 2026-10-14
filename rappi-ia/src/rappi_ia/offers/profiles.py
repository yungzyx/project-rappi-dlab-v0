"""Perfiles de gusto: lo que la persona pide seguido arma un perfil («Amante de lo asiático»), y cada perfil tiene una
escalera de verticales que el agente ofrece de a un peldaño, más un viaje opcional («Idea para RappiTravel»).

Todo vive en datos: `perfiles.toml` y `destinos.toml`, junto a este módulo. Se validan al cargar contra la taxonomía,
los segmentos y las guardias de ofertas (`guards.py`): un peldaño nunca nombra lo que el agente no ofrece por su cuenta.
"""

import tomllib
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from rappi_scraper.storage.search import VERTICALS

from ..concepts.taxonomy import load_taxonomy
from ..layers.segments import LEVELS, load_segment_rules
from ..text import normalize
from .guards import is_offerable, offerable_vertical

DATA_DIR = Path(__file__).resolve().parent
MIN_STEPS = 2  # con menos peldaños no hay escalera que ofrecer
FACTS = 2  # hechos por destino: los que muestra la tarjeta del viaje


@dataclass(frozen=True)
class Fact:
    text: str
    source: str
    url: str


@dataclass(frozen=True)
class Destination:
    id: str
    name: str
    text: str  # la pregunta: «¿Y si un día vas a Japón?»
    facts: tuple[Fact, ...]


@dataclass(frozen=True)
class Step:
    vertical: str
    concepts: tuple[str, ...]
    text: str
    words: tuple[str, ...] = ()  # si las hay, el nombre del producto debe tener alguna (normalizadas, `text.normalize`)


@dataclass(frozen=True)
class Profile:
    id: str
    name: str
    emoji: str
    main: bool
    segments: tuple[str, ...]
    min_level: str
    ladder: tuple[Step, ...]
    trip: str | None = None  # id de un destino


@cache
def load_destinations(path: Path = DATA_DIR / "destinos.toml") -> dict[str, Destination]:
    destinations: dict[str, Destination] = {}
    for raw in tomllib.loads(path.read_text(encoding="utf-8")).get("destino", ()):
        where = f"Destino {raw.get('id', '?')}"
        _check_keys(raw, {"id", "nombre", "texto", "hechos"}, set(), where)
        if raw["id"] in destinations:
            raise ValueError(f"{where}: id repetido")
        if len(raw["hechos"]) != FACTS:
            raise ValueError(f"{where}: lleva {FACTS} hechos, no {len(raw['hechos'])}")
        facts = []
        for fact in raw["hechos"]:
            _check_keys(fact, {"texto", "fuente", "url"}, set(), f"{where}, hecho")
            if not fact["url"].startswith("https://"):
                raise ValueError(f"{where}: la url de cada hecho debe ser https ({fact['url']})")
            facts.append(Fact(fact["texto"], fact["fuente"], fact["url"]))
        destinations[raw["id"]] = Destination(raw["id"], raw["nombre"], raw["texto"], tuple(facts))
    return destinations


@cache
def load_profiles(path: Path = DATA_DIR / "perfiles.toml") -> dict[str, Profile]:
    """Los perfiles en el orden del archivo, validados: ids de conceptos, verticales, segmentos y destinos que existen,
    y nada que las guardias de ofertas bloqueen."""
    concepts = load_taxonomy().concepts
    segments = {rule.id: rule for rule in load_segment_rules()[1]}
    destinations = load_destinations()
    profiles: dict[str, Profile] = {}
    for raw in tomllib.loads(path.read_text(encoding="utf-8")).get("perfil", ()):
        where = f"Perfil {raw.get('id', '?')}"
        _check_keys(
            raw, {"id", "nombre", "emoji", "segmentos", "nivel_minimo", "escalera"}, {"principal", "viaje"}, where
        )
        if raw["id"] in profiles:
            raise ValueError(f"{where}: id repetido")
        for segment in raw["segmentos"]:
            if segment not in segments:
                raise ValueError(f"{where}: segmento desconocido «{segment}»")
            if segments[segment].sensitive:
                raise ValueError(f"{where}: el segmento «{segment}» es sensible y no arma perfiles")
        if raw["nivel_minimo"] not in LEVELS:
            raise ValueError(f"{where}: nivel_minimo «{raw['nivel_minimo']}» no es uno de {', '.join(LEVELS)}")
        if raw.get("viaje") is not None and raw["viaje"] not in destinations:
            raise ValueError(f"{where}: viaje a un destino desconocido «{raw['viaje']}»")
        ladder = tuple(_step(entry, concepts, where) for entry in raw["escalera"])
        if len(ladder) < MIN_STEPS:
            raise ValueError(f"{where}: la escalera necesita al menos {MIN_STEPS} peldaños")
        profiles[raw["id"]] = Profile(
            id=raw["id"],
            name=raw["nombre"],
            emoji=raw["emoji"],
            main=raw.get("principal", False),
            segments=tuple(raw["segmentos"]),
            min_level=raw["nivel_minimo"],
            ladder=ladder,
            trip=raw.get("viaje"),
        )
    main = [p.id for p in profiles.values() if p.main]
    if len(main) > 1:
        raise ValueError(f"Solo un perfil puede ser principal: {', '.join(main)}")
    return profiles


def _step(raw: dict, concepts: dict, where: str) -> Step:
    _check_keys(raw, {"vertical", "conceptos", "texto"}, {"palabras"}, f"{where}, peldaño")
    vertical = raw["vertical"]
    if vertical not in VERTICALS:
        raise ValueError(f"{where}: vertical desconocida «{vertical}»")
    if not offerable_vertical(vertical):
        raise ValueError(f"{where}: el agente no ofrece productos de «{vertical}» por su cuenta")
    if not raw["conceptos"]:
        raise ValueError(f"{where}: un peldaño en «{vertical}» sin conceptos")
    for concept in raw["conceptos"]:
        if concept not in concepts:
            raise ValueError(f"{where}: concepto desconocido «{concept}»")
        if not is_offerable(concepts[concept]):
            raise ValueError(f"{where}: el agente no ofrece «{concept}» por su cuenta (offers/guards.py)")
    # Como se comparan con el nombre normalizado: «café» calza «Bombones de Cafe» y «cotillón», «Cotillon».
    words = tuple(normalize(word) for word in raw.get("palabras", ()))
    return Step(vertical, tuple(raw["conceptos"]), raw["texto"], words)


def _check_keys(raw: dict, required: set[str], optional: set[str], where: str) -> None:
    """Una clave mal escrita («concepto») o que falta se nota al cargar, no como un peldaño que nunca calza."""
    missing = sorted(required - raw.keys())
    if missing:
        raise ValueError(f"{where}: falta {', '.join(f'«{k}»' for k in missing)}")
    unknown = sorted(raw.keys() - required - optional)
    if unknown:
        raise ValueError(f"{where}: clave desconocida {', '.join(f'«{k}»' for k in unknown)}")
