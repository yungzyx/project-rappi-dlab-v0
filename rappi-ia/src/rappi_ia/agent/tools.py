"""Herramientas de Bigotes: buscar en un vertical (con precios vigentes por SQL) y sugerir un complemento.

Todo producto que Bigotes muestra pasa por aquí: sale de la base, con su precio vigente, nunca inventado.
"""

from dataclasses import dataclass, field

from psycopg import Connection

from ..concepts.taxonomy import load_taxonomy
from ..embeddings.base import TextEmbedder
from ..retrieval.hybrid import Filters, RetrievalResult, _concepts_of, _hydrate, retrieve


def _sensitive() -> set[str]:
    return {c.id for c in load_taxonomy().concepts.values() if c.sensitive}


VERTICAL_LABELS = {
    "supermercado": "el súper",
    "conveniencia": "Express",
    "turbo": "Turbo",
    "mall": "Rappi Mall",
    "farmacia": "farmacia",
    "licores": "Licores",
    "chocolateria": "chocolaterías",
    "restaurantes": "restaurantes",
}


@dataclass
class Product:
    id: str
    entity_type: str
    entity_id: str
    name: str
    vertical: str
    concept: str | None
    price_value: float | None
    before_value: float | None
    store: str | None
    img: str | None
    age_restricted: bool = False

    def to_dict(self) -> dict:
        discount = None
        if self.price_value and self.before_value and self.before_value > self.price_value:
            discount = f"-{round(100 * (1 - self.price_value / self.before_value))}%"
        return {
            "id": self.id,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "name": self.name,
            "vertical": self.vertical,
            "concept": self.concept,
            "price": clp(self.price_value),
            "price_value": self.price_value,
            "before": clp(self.before_value) if discount else None,
            "discount": discount,
            "store": self.store,
            "img": self.img,
            "age_restricted": self.age_restricted,
        }


@dataclass
class SearchOutcome:
    result: RetrievalResult
    products: list[Product]
    cheapest_without_filter: Product | None = None


@dataclass
class Suggestion:
    concept: str
    source_concept: str
    vertical: str
    reason: str
    products: list[Product] = field(default_factory=list)


def clp(value: float | None) -> str | None:
    return None if value is None else "$" + f"{round(value):,}".replace(",", ".")


def search_products(
    conn: Connection,
    vertical: str,
    query: str,
    concepts: list[str] | None,
    embedder: TextEmbedder | None,
    price_max: float | None = None,
    k: int = 6,
    mode: str = "hibrido",
) -> SearchOutcome:
    """Con `concepts=None`, los conceptos los detecta la búsqueda en la consulta (endpoint /search)."""
    result = retrieve(
        conn, vertical, query, embedder, k=k * 2, filters=Filters(price_max), mode=mode, concepts=concepts
    )
    concepts = result.query_concepts
    hits = _focus([h for h in result.hits if _allowed(h.concept_id, concepts)], concepts, result.unmet)
    products = _dedupe(_within_budget(_with_prices(conn, vertical, hits), price_max))[:k]
    cheapest = None
    if not products and price_max is not None:
        unfiltered = retrieve(conn, vertical, query, embedder, k=k * 2, mode=mode, concepts=concepts)
        allowed = [h for h in unfiltered.hits if _allowed(h.concept_id, concepts)]
        candidates = _with_prices(conn, vertical, _focus(allowed, concepts, unfiltered.unmet))
        priced = [p for p in candidates if p.price_value is not None]
        cheapest = min(priced, key=lambda p: p.price_value) if priced else None
    return SearchOutcome(result, products, cheapest)


def suggest_complement(
    conn: Connection,
    source_concepts: list[str],
    current_vertical: str | None,
    embedder: TextEmbedder | None,
    exclude: set[str] = frozenset(),
) -> Suggestion | None:
    """Mejor complemento no sensible, preferentemente de OTRO vertical, con productos reales."""
    taxonomy = load_taxonomy()
    sources = [c for c in source_concepts if c in taxonomy.concepts and not taxonomy.concepts[c].sensitive]
    if not sources:
        return None
    edges = conn.execute(
        """SELECT from_concept, to_concept, max(weight) AS weight
           FROM concept_edges
           WHERE from_concept = ANY(%s) AND (method = 'curado' OR data_source <> 'synthetic')
           GROUP BY 1, 2
           ORDER BY weight DESC""",
        (sources,),
    ).fetchall()
    for source, target, _ in edges:
        concept = taxonomy.concepts.get(target)
        if concept is None or concept.sensitive or target in exclude or target in sources:
            continue
        for vertical in _verticals_for(conn, target, current_vertical):
            outcome = search_products(conn, vertical, concept.name, [target], embedder, k=4)
            products = _dedupe([p for p in outcome.products if p.concept == target])
            if products:
                origin = taxonomy.concepts[source]
                reason = f"Porque llevas {origin.emoji} {origin.name.lower()}"
                return Suggestion(target, source, vertical, reason, products[:3])
    return None


def _within_budget(products: list[Product], price_max: float | None) -> list[Product]:
    """El filtro de la búsqueda usa el precio del índice; aquí se revisa contra el precio vigente que se muestra."""
    if price_max is None:
        return products
    return [p for p in products if p.price_value is not None and p.price_value <= price_max]


def _dedupe(products: list[Product]) -> list[Product]:
    """Un solo producto por nombre (el catálogo repite nombres entre presentaciones y tiendas)."""
    seen: set[str] = set()
    unique = []
    for product in products:
        key = " ".join(product.name.lower().split())
        if key not in seen:
            seen.add(key)
            unique.append(product)
    return unique


def _focus(hits, concepts: list[str], unmet: bool):
    """Si la consulta nombra conceptos, solo esos: pedir cigarrillos no debe traer cerveza.

    Si ningún resultado es del concepto pedido y la búsqueda quedó "sin resultado", no se muestra nada
    (mostrar una pizza a quien pidió kebab sería inventar una respuesta).
    """
    if not concepts:
        return hits
    matching = [h for h in hits if h.concept_id in concepts]
    if matching:
        return matching
    return [] if unmet else hits


def _allowed(concept_id: str | None, requested: list[str]) -> bool:
    """Los conceptos sensibles (medicamentos, salud sexual, tabaco, vapeo, adultos) solo aparecen si se piden
    por su nombre: nunca por un síntoma, una ocasión o la cercanía vectorial (regla 6, Ley 20.105)."""
    return concept_id not in _sensitive() or concept_id in requested


def _verticals_for(conn: Connection, concept_id: str, current_vertical: str | None) -> list[str]:
    rows = conn.execute(
        "SELECT vertical FROM concept_assortment WHERE concept_id = %s AND items > 0 ORDER BY items DESC",
        (concept_id,),
    ).fetchall()
    verticals = [r[0] for r in rows]
    # Primero otros verticales (el valor de la propuesta es cruzar), después el actual.
    return [v for v in verticals if v != current_vertical] + [v for v in verticals if v == current_vertical]


def _with_prices(conn: Connection, vertical: str, hits) -> list[Product]:
    catalog_ids = [h.entity_id for h in hits if h.entity_type == "catalog_item"]
    menu_ids = [h.entity_id for h in hits if h.entity_type == "menu_item"]
    prices: dict[tuple[str, str], tuple] = {}
    if catalog_ids:
        for pid, name, price, real, store, age in conn.execute(
            """WITH latest AS (
                   SELECT DISTINCT ON (ps.store_id, ps.sku) ps.store_id, ps.sku, ps.price, ps.real_price, ps.in_stock
                   FROM price_snapshots ps
                   JOIN store_products sp USING (store_id, sku)
                   WHERE sp.master_product_id = ANY(%(ids)s::bigint[])
                   ORDER BY ps.store_id, ps.sku, ps.scraped_at DESC
               )
               SELECT DISTINCT ON (sp.master_product_id) sp.master_product_id::text, ci.name, l.price, l.real_price,
                      coalesce(b.name, s.name), ci.is_alcoholic OR ci.age_restricted
               FROM latest l
               JOIN store_products sp USING (store_id, sku)
               JOIN stores s ON s.store_id = sp.store_id
               LEFT JOIN brands b ON b.brand_id = s.brand_id
               JOIN catalog_items ci ON ci.master_product_id = sp.master_product_id
               JOIN v_store_verticals v ON v.store_id = s.store_id AND v.vertical = %(vertical)s
               WHERE l.in_stock IS NOT FALSE
               ORDER BY sp.master_product_id, l.price""",
            {"ids": catalog_ids, "vertical": vertical},
        ):
            prices[("catalog_item", pid)] = (name, price, real, store, age)
    if menu_ids:
        for iid, name, price, real, store in conn.execute(
            """SELECT DISTINCT ON (mi.item_id) mi.item_id::text, mi.name, mp.price, mp.real_price, s.name
               FROM menu_items mi
               JOIN stores s USING (store_id)
               LEFT JOIN menu_price_snapshots mp ON mp.item_id = mi.item_id
               WHERE mi.item_id = ANY(%s::bigint[])
               ORDER BY mi.item_id, mp.scraped_at DESC NULLS LAST""",
            (menu_ids,),
        ):
            prices[("menu_item", iid)] = (name, price, real, store, False)
    taxonomy = load_taxonomy()
    products = []
    for hit in hits:
        found = prices.get((hit.entity_type, hit.entity_id))
        if found is None:  # sin precio vigente en el vertical (agotado o sin stock): no se ofrece
            continue
        name, price, real, store, age = found
        concept = taxonomy.concepts.get(hit.concept_id) if hit.concept_id else None
        prefix = "cat" if hit.entity_type == "catalog_item" else "menu"
        products.append(
            Product(
                id=f"{prefix}-{hit.entity_id}",
                entity_type=hit.entity_type,
                entity_id=hit.entity_id,
                name=name,
                vertical=hit.vertical,
                concept=hit.concept_id,
                price_value=float(price) if price is not None else None,
                before_value=float(real) if real is not None else None,
                store=store or hit.metadata.get("restaurante"),
                img=hit.metadata.get("imagen"),
                age_restricted=bool(age) or bool(concept and concept.age_restricted),
            )
        )
    return [p for p in products if p.price_value is not None]


def products_for_keys(
    conn: Connection, vertical: str, keys: list[tuple[str, str]], scores: list[float]
) -> list[Product]:
    """Productos (con precio vigente) para ítems ya elegidos, p. ej. los de foto parecida."""
    concepts = _concepts_of(conn, keys)
    hits = _hydrate(conn, vertical, keys, dict(zip(keys, scores, strict=True)), concepts, {}, {})
    return _with_prices(conn, vertical, [h for h in hits if _allowed(h.concept_id, [])])
