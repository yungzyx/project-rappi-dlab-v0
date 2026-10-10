"""La búsqueda de la app sin vertical: la misma consulta en todas las verticales que corresponden, agrupada.

Es la búsqueda que la persona escribe, así que no lleva las guardias de las ofertas de Mochi (la cerveza trae
Licores) ni se personaliza; lo sensible, como siempre, solo si se nombra (`_allowed` en agent/tools.py). Los resultados
son productos y platos, nunca tiendas.
"""

from dataclasses import dataclass, field

from psycopg import Connection
from rappi_scraper.storage.search import VERTICALS

from ..concepts.matcher import KeywordMatcher
from ..concepts.taxonomy import Occasion, load_taxonomy
from ..embeddings.base import MemoizedQueryEmbedder, TextEmbedder
from ..retrieval.hybrid import detect_concepts
from ..text import normalize
from .bigotes import PROTOTYPE_VERTICALS
from .tools import Product, search_products
from .verticals import ranked_verticals

TYPICAL_VERTICALS = 3  # con un concepto detectado, las verticales donde es más típico
# Sin concepto ni ocasión, la consulta va a las 8 verticales y el τ de cada una (calibrado buscando solo en ella; 0,70
# en el Mall y las chocolaterías) deja pasar vecinos sin relación: «xyzzy» traía un pastillero y libros. Si ninguna
# vertical calza todas las palabras, una vertical solo entra con este coseno. Calibrado con e5 en la base real: las
# negativas sin concepto de eval/queries.json llegan a 0,840 («sofá de tres cuerpos») y la basura a 0,801.
ALL_VERTICALS_TAU = 0.85

# Pantalla de la app de cada vertical: la de `PROTOTYPE_VERTICALS`, salvo que Turbo abre su propia pantalla
# (el resto de la API lo agrupa con Express).
SCREEN_VERTICALS = {**PROTOTYPE_VERTICALS, "turbo": "turbo"}


@dataclass
class VerticalGroup:
    vertical: str
    prototype_vertical: str
    products: list[Product]

    def to_dict(self) -> dict:
        return {
            "vertical": self.vertical,
            "prototype_vertical": self.prototype_vertical,
            "products": [p.to_dict() for p in self.products],
        }


@dataclass
class GroupedResult:
    query: str
    groups: list[VerticalGroup] = field(default_factory=list)
    unmet: bool = False
    unmet_reason: str | None = None

    def to_dict(self) -> dict:
        return {
            "query": self.query,
            "groups": [g.to_dict() for g in self.groups],
            "unmet": self.unmet,
            "unmet_reason": self.unmet_reason,
        }


_OCCASIONS = None


def _occasion(q: str) -> Occasion | None:
    """La ocasión que nombra la consulta («algo para el carrete»), con las keywords de taxonomy.toml."""
    global _OCCASIONS
    taxonomy = load_taxonomy()
    if _OCCASIONS is None:
        _OCCASIONS = KeywordMatcher((o.id, kw) for o in taxonomy.occasions.values() for kw in o.keywords)
    match = _OCCASIONS.best(normalize(q))
    return taxonomy.occasions[match.target] if match else None


def _verticals_to_search(
    conn: Connection, concepts: list[str], current: str | None, fixed: str | None = None
) -> list[str]:
    """Con un concepto detectado, sus verticales típicas (hasta 3; primero la fija de la ocasión, si tiene) y la de la
    pantalla; si no, las 8."""
    typical = ranked_verticals(conn, concepts)[:TYPICAL_VERTICALS] if concepts else []
    if fixed:
        typical = [fixed, *[v for v in typical if v != fixed]][:TYPICAL_VERTICALS]
    if not typical:
        return list(VERTICALS)
    return typical + [current] if current in VERTICALS and current not in typical else typical


def _related(outcomes: list) -> list:
    """Sin concepto: las verticales que calzan todas las palabras; si ninguna, las de coseno ≥ ALL_VERTICALS_TAU."""
    exact = [o for o in outcomes if o[1].result.strict_lexical_matches]
    return exact or [o for o in outcomes if (o[1].result.max_cosine or 0.0) >= ALL_VERTICALS_TAU]


def search_grouped(
    conn: Connection,
    q: str,
    embedder: TextEmbedder | None,
    current: str | None,
    limit: int,
    price_max: float | None = None,
    mode: str = "hibrido",
) -> GroupedResult:
    """Productos por vertical, con `limit` por grupo y solo los grupos que traen algo. Con un concepto detectado el
    orden es el de sus verticales típicas. Una ocasión sin concepto nombrado («algo para el carrete») se busca como
    Bigotes: sus conceptos (sin los sensibles: una ocasión no los nombra), en sus verticales típicas. Sin ninguno de
    los dos, solo las verticales que calzan todas las palabras o, si ninguna, las muy cercanas (ALL_VERTICALS_TAU):
    primero las que calzan y luego por la cercanía vectorial. La pantalla actual (`current`), si trae productos, va
    siempre primero (el resto conserva su orden); sin productos, no aparece. `unmet` solo si ningún grupo trae
    productos."""
    concepts = detect_concepts(q)
    occasion = None if concepts else _occasion(q)
    query, fixed = q, None
    if occasion:
        taxonomy = load_taxonomy()
        concepts = [c for c in occasion.concepts if not taxonomy.concepts[c].sensitive]
        query, fixed = " ".join(taxonomy.concepts[c].name for c in concepts[:4]), occasion.vertical
    memo = MemoizedQueryEmbedder(embedder) if embedder is not None else None
    searched = [
        (vertical, search_products(conn, vertical, query, concepts, memo, price_max, k=limit, mode=mode))
        for vertical in _verticals_to_search(conn, concepts, current, fixed)
    ]
    outcomes = searched if concepts else _related(searched)
    if not concepts:  # sorted es estable: a igual relevancia queda el orden de VERTICALS
        outcomes.sort(key=lambda o: (o[1].result.strict_lexical_matches == 0, -(o[1].result.max_cosine or 0.0)))
    groups = [
        VerticalGroup(vertical, SCREEN_VERTICALS[vertical], outcome.products)
        for vertical, outcome in outcomes
        if outcome.products
    ]
    if groups:
        groups.sort(key=lambda group: group.vertical != current)  # estable: solo sube la de la pantalla actual
        return GroupedResult(q, groups)
    reason = next((o.result.unmet_reason for _, o in searched if o.result.unmet_reason), None)
    if reason is None and not concepts:
        best = max((o.result.max_cosine or 0.0 for _, o in searched), default=0.0)
        reason = f"sin coincidencia léxica ni concepto; coseno máx {best:.3f} < τ {ALL_VERTICALS_TAU} en todas"
    return GroupedResult(q, [], unmet=True, unmet_reason=reason)
