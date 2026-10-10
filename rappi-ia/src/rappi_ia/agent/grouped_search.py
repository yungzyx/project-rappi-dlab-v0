"""La búsqueda de la app sin vertical: la misma consulta en todas las verticales que corresponden, agrupada.

Es la búsqueda que la persona escribe, así que no lleva las guardias de las ofertas de Mochi (la cerveza trae
Licores) ni se personaliza. Los resultados son productos y platos, nunca tiendas.
"""

from dataclasses import dataclass, field

from psycopg import Connection
from rappi_scraper.storage.search import VERTICALS

from ..embeddings.base import MemoizedQueryEmbedder, TextEmbedder
from ..retrieval.hybrid import detect_concepts
from .bigotes import PROTOTYPE_VERTICALS
from .tools import Product, search_products
from .verticals import ranked_verticals

TYPICAL_VERTICALS = 3  # con un concepto detectado, las verticales donde es más típico

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


def _verticals_to_search(conn: Connection, concepts: list[str], current: str | None) -> list[str]:
    """Con un concepto detectado, sus verticales típicas (hasta 3) y la de la pantalla; si no, las 8."""
    typical = ranked_verticals(conn, concepts)[:TYPICAL_VERTICALS] if concepts else []
    if not typical:
        return list(VERTICALS)
    return typical + [current] if current in VERTICALS and current not in typical else typical


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
    orden es el de sus verticales típicas (la pantalla actual al final); si no, primero las que calzan palabras de la
    consulta y luego por la cercanía vectorial. `unmet` solo si ningún grupo trae productos."""
    concepts = detect_concepts(q)
    memo = MemoizedQueryEmbedder(embedder) if embedder is not None else None
    outcomes = [
        (vertical, search_products(conn, vertical, q, concepts, memo, price_max, k=limit, mode=mode))
        for vertical in _verticals_to_search(conn, concepts, current)
    ]
    if not concepts:  # sorted es estable: a igual relevancia queda el orden de VERTICALS
        outcomes.sort(key=lambda o: (o[1].result.strict_lexical_matches == 0, -(o[1].result.max_cosine or 0.0)))
    groups = [
        VerticalGroup(vertical, SCREEN_VERTICALS[vertical], outcome.products)
        for vertical, outcome in outcomes
        if outcome.products
    ]
    if groups:
        return GroupedResult(q, groups)
    reason = next((o.result.unmet_reason for _, o in outcomes if o.result.unmet_reason), None)
    return GroupedResult(q, [], unmet=True, unmet_reason=reason)
