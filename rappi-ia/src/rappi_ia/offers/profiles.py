"""Perfiles de gusto: lo que la persona pide seguido arma un perfil («Amante de lo asiático»), y cada perfil tiene una
escalera de verticales que el agente ofrece de a un peldaño, más un viaje opcional («Idea para RappiTravel»).

Todo vive en datos: `perfiles.toml` y `destinos.toml`, junto a este módulo. Se validan al cargar contra la taxonomía,
los segmentos y las guardias de ofertas (`guards.py`): un peldaño nunca nombra lo que el agente no ofrece por su cuenta.

El motor:
- `active_profiles`: los perfiles de una persona del prototipo, desde sus segmentos no sensibles (como
  `personal.py`), con su «por qué» contado en sus pedidos y búsquedas. «Olvidar» borra o recalcula sus segmentos, así
  que el perfil se va con ellos.
- `ladder`: la escalera de un perfil, con productos de verdad: una búsqueda de oferta por peldaño
  (`search_products(..., offer=True)`), así que pasan todas las guardias (nada +18, ni un nombre que dice alcohol, ni
  tiendas Farmacia, Sex shop o Smoking shop).
"""

import tomllib
from dataclasses import dataclass
from functools import cache
from itertools import zip_longest
from pathlib import Path

from psycopg import Connection
from rappi_scraper.storage.search import VERTICALS

from ..agent.grouped_search import SCREEN_VERTICALS
from ..agent.tools import Product, search_products
from ..concepts.taxonomy import load_taxonomy
from ..embeddings.base import MemoizedQueryEmbedder, TextEmbedder
from ..layers.segments import LEVELS, load_segment_rules
from ..text import normalize
from .guards import is_offerable, offerable_vertical
from .personal import Signal, _is_prototype_user

DATA_DIR = Path(__file__).resolve().parent
MIN_STEPS = 2  # con menos peldaños no hay escalera que ofrecer
FACTS = 2  # hechos por destino: los que muestra la tarjeta del viaje
STEP_PRODUCTS = 4  # lo más que muestra un peldaño; basta uno («Lindor Matcha» es el único matcha de chocolaterías)
# Productos que se piden por peldaño, antes de quedarse con los de sus conceptos, con sus palabras y, en restaurantes,
# uno por local que la persona no conoce.
STEP_CANDIDATES = 12
REASON_CONCEPTS = 3  # conceptos que nombra el «por qué»
QUERY_EVENTS = ("search", "chat", "ask")  # lo que cuenta como «buscaste»
# El «por qué» sin nada que contar: un perfil que se armó con lo que el agente no nombra (los cócteles del carrete)
# o con búsquedas sin concepto.
REASON_NEUTRAL = "Por lo que has pedido y buscado últimamente."


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
    avoid: tuple[str, ...] = ()  # el nombre no puede tener ninguna (normalizadas)

    def fits(self, name: str) -> bool:
        """Si el nombre dice alguna de sus `words` (si tiene) y ninguna de `avoid`, cada una al comienzo de una palabra
        del nombre normalizado: «vaso» calza «Vasos», no «Posavasos»; «tiramis» calza «Tiramisú»."""
        text = f" {normalize(name)}"
        says = [f" {word}" in text for word in self.words]
        return (not says or any(says)) and not any(f" {word}" in text for word in self.avoid)


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
    _check_keys(raw, {"vertical", "conceptos", "texto"}, {"palabras", "evitar"}, f"{where}, peldaño")
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
    avoid = tuple(normalize(word) for word in raw.get("evitar", ()))
    return Step(vertical, tuple(raw["conceptos"]), raw["texto"], words, avoid)


def _check_keys(raw: dict, required: set[str], optional: set[str], where: str) -> None:
    """Una clave mal escrita («concepto») o que falta se nota al cargar, no como un peldaño que nunca calza."""
    missing = sorted(required - raw.keys())
    if missing:
        raise ValueError(f"{where}: falta {', '.join(f'«{k}»' for k in missing)}")
    unknown = sorted(raw.keys() - required - optional)
    if unknown:
        raise ValueError(f"{where}: clave desconocida {', '.join(f'«{k}»' for k in unknown)}")


# ── qué perfiles tiene una persona ───────────────────────────────────────────


@dataclass(frozen=True)
class ActiveProfile:
    profile: Profile
    level: str  # el mayor de sus segmentos
    score: float  # la suma de sus segmentos
    reason: str  # «Pediste 🍣 sushi 2 veces, y buscaste 🥡 comida asiática 1 vez.»
    basis: tuple[dict, ...]  # sus segmentos y lo que cuenta el «por qué», con la forma de `reason.basis` de una oferta

    def to_dict(self) -> dict:
        return {
            "id": self.profile.id,
            "nombre": self.profile.name,
            "emoji": self.profile.emoji,
            "nivel": self.level,
            "principal": self.profile.main,
            "por_que": self.reason,
            "basis": list(self.basis),
        }


def active_profiles(conn: Connection, user_id: str | None) -> list[ActiveProfile]:
    """Los perfiles de la persona: los que tienen alguno de sus segmentos (no sensibles) en `nivel_minimo` o más. El
    nivel es el mayor de sus segmentos y el puntaje, la suma. El «por qué» cuenta sus pedidos y búsquedas en la ventana
    de esos segmentos (la mayor: 120 días). El principal primero y después por puntaje (con empate, el orden del
    archivo). Vacío si no es del prototipo."""
    if not _is_prototype_user(conn, user_id):
        return []
    profiles = load_profiles()
    rows = conn.execute(
        """SELECT s.segment_id, s.level, s.score
           FROM user_segments s JOIN segment_defs d USING (segment_id)
           WHERE s.user_id = %s AND NOT d.sensitive AND s.segment_id = ANY(%s)""",
        (user_id, sorted({segment for p in profiles.values() for segment in p.segments})),
    ).fetchall()
    held = {segment: (level, float(score)) for segment, level, score in rows}
    found: list[tuple[Profile, str, float, list[Signal]]] = []
    for profile in profiles.values():
        mine = [(segment, *held[segment]) for segment in profile.segments if segment in held]
        level = max((level for _, level, _ in mine), key=LEVELS.index, default=None)
        if level is None or LEVELS.index(level) < LEVELS.index(profile.min_level):
            continue
        signals = [Signal("segmento", segment, round(score, 3), "segmentos") for segment, _, score in mine]
        found.append((profile, level, round(sum(score for *_, score in mine), 3), signals))
    if not found:
        return []
    rules = {rule.id: rule for rule in load_segment_rules()[1]}
    wanted = {profile.id: _counted_concepts(profile, rules) for profile, *_ in found}
    days = max(rules[segment].window_days for profile, *_ in found for segment in profile.segments)
    counts = _counts(conn, user_id, sorted({c for concepts in wanted.values() for c in concepts}), days)
    active = []
    for profile, level, score, signals in found:
        own = {c: counts[c] for c in wanted[profile.id] if c in counts}
        counted = [Signal("concepto", c, n, source) for c, by_source in own.items() for source, n in by_source.items()]
        basis = tuple(s.to_dict() for s in signals + counted)
        active.append(ActiveProfile(profile, level, score, _reason(wanted[profile.id], own), basis))
    return sorted(active, key=lambda a: (not a.profile.main, -a.score))


def _counted_concepts(profile: Profile, rules: dict) -> list[str]:
    """Los conceptos que miran los segmentos del perfil y que el agente puede nombrar (el carrete se activa también con
    cócteles y espumante, que no se nombran), en el orden de sus segmentos."""
    concepts = load_taxonomy().concepts
    named = [c for segment in profile.segments for c in rules[segment].signals.get("concepts", ())]
    return [c for c in dict.fromkeys(named) if c in concepts and is_offerable(concepts[c])]


def _counts(conn: Connection, user_id: str, concepts: list[str], days: int) -> dict[str, dict[str, int]]:
    """concepto → {"pedidos": pedidos distintos, "busquedas": búsquedas} de la persona en los últimos `days` días (la
    ventana de sus segmentos), sin lo de «Rappi hoy» (ahí la app no aprende)."""
    rows = conn.execute(
        """SELECT l.concept_id, 'pedidos', count(DISTINCT o.order_id)
           FROM app_orders o JOIN app_order_lines l USING (order_id)
           WHERE o.user_id = %(user)s AND o.mode = 'propuesta' AND l.concept_id = ANY(%(concepts)s)
             AND o.ts >= now() - make_interval(days => %(days)s)
           GROUP BY 1
           UNION ALL
           SELECT e.concept_id, 'busquedas', count(*)
           FROM app_events e
           WHERE e.user_id = %(user)s AND e.type = ANY(%(types)s) AND e.concept_id = ANY(%(concepts)s)
             AND coalesce(e.payload ->> 'mode', '') <> 'actual' AND e.ts >= now() - make_interval(days => %(days)s)
           GROUP BY 1""",
        {"user": user_id, "concepts": concepts, "days": days, "types": list(QUERY_EVENTS)},
    ).fetchall()
    counts: dict[str, dict[str, int]] = {}
    for concept_id, source, n in sorted(rows, key=lambda row: row[1] != "pedidos"):  # los pedidos primero
        counts.setdefault(concept_id, {})[source] = n
    return counts


def _reason(concepts: list[str], counts: dict[str, dict[str, int]]) -> str:
    """«Pediste 🍣 sushi 2 veces, y buscaste 🥡 comida asiática 1 vez.»: los `REASON_CONCEPTS` que más cuentan (los
    pedidos antes que las búsquedas); de un concepto pedido no se dicen sus búsquedas."""
    taxonomy = load_taxonomy().concepts
    ranked = sorted(
        counts, key=lambda c: (-counts[c].get("pedidos", 0), -counts[c].get("busquedas", 0), concepts.index(c))
    )[:REASON_CONCEPTS]

    def times(concept_id: str, n: int) -> str:
        concept = taxonomy[concept_id]
        return f"{concept.emoji} {concept.name.lower()} {n} {'vez' if n == 1 else 'veces'}"

    ordered = [times(c, counts[c]["pedidos"]) for c in ranked if counts[c].get("pedidos")]
    searched = [times(c, counts[c]["busquedas"]) for c in ranked if not counts[c].get("pedidos")]
    parts = [verb + _join(said) for verb, said in (("pediste ", ordered), ("buscaste ", searched)) if said]
    if not parts:
        return REASON_NEUTRAL
    text = ", y ".join(parts)
    return text[0].upper() + text[1:] + "."


def _join(items: list[str]) -> str:
    """«a, b y c»."""
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " y " + items[-1]


def ordered_restaurants(conn: Connection, user_id: str | None) -> set[int]:
    """Los locales donde la persona ya pidió (sin «Rappi hoy»): el peldaño de restaurantes ofrece los que no conoce.
    Vacío si no es del prototipo."""
    if not _is_prototype_user(conn, user_id):
        return set()
    rows = conn.execute(
        """SELECT DISTINCT store_id FROM menu_items
           WHERE item_id = ANY(ARRAY(SELECT l.entity_id FROM app_orders o JOIN app_order_lines l USING (order_id)
                                     WHERE o.user_id = %s AND o.mode = 'propuesta' AND l.entity_type = 'menu_item'
                                       AND l.entity_id ~ '^[0-9]+$')::bigint[])""",
        (user_id,),
    )
    return {store_id for (store_id,) in rows}


# ── la escalera ──────────────────────────────────────────────────────────────


@dataclass
class LadderStep:
    step: Step
    products: list[Product]

    def to_dict(self) -> dict:
        return {
            "vertical": self.step.vertical,
            "prototype_vertical": SCREEN_VERTICALS.get(self.step.vertical),
            "texto": self.step.text,
            "products": [p.to_dict() for p in self.products],
        }


def ladder(
    conn: Connection,
    embedder: TextEmbedder | None,
    profile: Profile,
    exclude_stores: set[int] | None = None,
) -> list[LadderStep]:
    """Los peldaños del perfil que tienen productos, en su orden: de 1 a `STEP_PRODUCTS` por peldaño. Una lista vacía
    si quedan menos de `MIN_STEPS`: no hay escalera. `exclude_stores` (`ordered_restaurants`): los locales que el
    peldaño de restaurantes deja fuera. Una búsqueda de oferta por peldaño; cada consulta se embebe una vez, en un
    solo lote."""
    queries = [_step_query(step) for step in profile.ladder]
    if embedder is not None:
        if not isinstance(embedder, MemoizedQueryEmbedder):
            embedder = MemoizedQueryEmbedder(embedder)
        embedder.embed_queries(list(dict.fromkeys(queries)))
    steps = []
    for step, query in zip(profile.ladder, queries, strict=True):
        known = set(exclude_stores or ()) if step.vertical == "restaurantes" else set()
        if products := _step_products(conn, embedder, step, query, known):
            steps.append(LadderStep(step, products))
    return steps if len(steps) >= MIN_STEPS else []


def _step_query(step: Step) -> str:
    """Lo que busca un peldaño: sus palabras, si tiene (es lo que el nombre debe decir), y si no, los nombres de sus
    conceptos."""
    concepts = load_taxonomy().concepts
    return " ".join(step.words) if step.words else " ".join(concepts[c].name for c in step.concepts)


def _step_products(
    conn: Connection, embedder: TextEmbedder | None, step: Step, query: str, known: set[int]
) -> list[Product]:
    """Los productos de los conceptos del peldaño que calzan sus palabras, primero los con foto y alternando sus
    conceptos (la despensa italiana no son cuatro pastas). Los platos, uno por local y no de los que ya conoce."""
    outcome = search_products(conn, step.vertical, query, list(step.concepts), embedder, k=STEP_CANDIDATES, offer=True)
    by_concept: dict[str, list[Product]] = {c: [] for c in step.concepts}
    places = set(known)
    for product in sorted(outcome.products, key=lambda p: p.img is None):  # estable: sigue el orden de la búsqueda
        if product.concept not in by_concept or not step.fits(product.name):
            continue
        if product.entity_type == "menu_item":
            if product.store_id in places:
                continue
            places.add(product.store_id)
        by_concept[product.concept].append(product)
    mixed = [p for group in zip_longest(*by_concept.values()) for p in group if p is not None]
    return mixed[:STEP_PRODUCTS]
