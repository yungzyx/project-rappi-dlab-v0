"""Herramientas del agente: buscar en un vertical (con precios vigentes por SQL) y sugerir un complemento.

Todo producto que el agente muestra pasa por aquí: sale de la base, con su precio vigente, nunca inventado.
"""

from dataclasses import dataclass, field

from psycopg import Connection
from rappi_scraper.storage.search import MIN_PRICE

from ..concepts.taxonomy import load_taxonomy
from ..embeddings.base import TextEmbedder
from ..offers.guards import (
    alcohol_in_name,
    alcohol_section,
    is_offerable,
    offerable_vertical,
    unofferable_subverticals,
)
from ..retrieval.hybrid import Filters, RetrievalResult, retrieve
from ..text import FILLER_WORDS, LEAFLET_WARNINGS, normalize, tokens
from .verticals import ranked_verticals


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
    store_id: int | None = None
    presentation: str | None = None

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
            "store_id": self.store_id,
            "presentation": self.presentation,
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
    brand: str | None = None  # brand_key del primer producto, si es una marca que la persona compra


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
    symptom: bool = False,
    offer: bool = False,
    adult_ok: bool = False,
    words: bool | None = None,
) -> SearchOutcome:
    """Con `concepts=None`, los conceptos los detecta la búsqueda en la consulta (endpoint /search). Con `symptom` (o
    en farmacia) no se muestra lo que no tiene concepto: podría ser un medicamento sin categoría mapeada. Con `offer`,
    la búsqueda es de una oferta del agente y solo trae lo que puede proponer por su cuenta: nada +18 ni de tiendas
    Farmacia, Sex shop o Smoking shop (offers/guards.py); el concepto y la vertical los elige quien llama. `adult_ok`
    deja pasar lo +18 en una oferta: solo para el kit de una ocasión que la persona eligió (alcohol con su marca).
    `words`: si a la consulta le queda alguna palabra (`retrieval.hybrid.has_words`), si quien llama ya lo sabe."""
    result = retrieve(
        conn, vertical, query, embedder, k=k * 2, filters=Filters(price_max), mode=mode, concepts=concepts, words=words
    )
    concepts = result.query_concepts
    capped = price_max is not None
    strict = symptom or vertical == "farmacia"
    hits = _focus([h for h in result.hits if _allowed(h.concept_id, concepts, strict)], concepts, result.unmet, capped)
    products = _dedupe(_within_budget(_with_prices(conn, vertical, hits, offer, adult_ok), price_max))[:k]
    cheapest = None
    if not products and capped:
        unfiltered = retrieve(conn, vertical, query, embedder, k=k * 2, mode=mode, concepts=concepts, words=words)
        allowed = [h for h in unfiltered.hits if _allowed(h.concept_id, concepts, strict)]
        # «El más barato» es de lo pedido: el mismo foco que con tope.
        candidates = _with_prices(conn, vertical, _focus(allowed, concepts, unfiltered.unmet, capped), offer, adult_ok)
        priced = [p for p in candidates if p.price_value is not None]
        cheapest = min(priced, key=lambda p: p.price_value) if priced else None
    return SearchOutcome(result, products, cheapest)


CANDIDATE_REMEDIES = 30  # se filtran después: muchos calzan solo por las advertencias del prospecto
MIN_REMEDIES = 2  # con menos, lo que calza el síntoma suele ser casualidad (un laxante para «me siento mal»)


# La familia de remedios que trata cada síntoma: el paracetamol no dice «fiebre» en su ficha. Normalizado.
SYMPTOM_REMEDIES = {
    **dict.fromkeys(("fiebre", "cabeza", "dolor", "duele", "migrana"), "analgésico paracetamol ibuprofeno"),
    **dict.fromkeys(("resfrio", "resfriado", "gripe"), "antigripal resfrío"),
    **dict.fromkeys(("tos", "garganta"), "antitusivo jarabe expectorante"),
    **dict.fromkeys(("acidez", "guata"), "antiácido"),
    **dict.fromkeys(("diarrea",), "antidiarreico"),
    **dict.fromkeys(("estrenido", "estrenida", "estrenimiento"), "laxante"),
    **dict.fromkeys(("alergia",), "antialérgico antihistamínico"),
    **dict.fromkeys(("nauseas",), "antináuseas"),
}


def _treats(content: str, words: set[str]) -> bool:
    """El nombre, la categoría o la indicación (lo que va antes de las advertencias) dice alguna de esas palabras."""
    said = normalize(content)
    head = said[: m.start()] if (m := LEAFLET_WARNINGS.search(said)) else said
    return any(token[:7] in words for token in head.split())


def search_remedies(
    conn: Connection, query: str, embedder: TextEmbedder | None, price_max: float | None = None, k: int = 6
) -> SearchOutcome:
    """Remedios de farmacia para un síntoma: medicamentos sin receta cuya ficha (sin las advertencias) nombra el
    síntoma o la familia que lo trata (búsqueda por palabras, no solo cercanía vectorial). Con menos de MIN_REMEDIES
    no devuelve ninguno."""
    families = " ".join(dict.fromkeys(SYMPTOM_REMEDIES[w] for w in tokens(query) if w in SYMPTOM_REMEDIES))
    query = f"{query} {families}".strip()
    skip = FILLER_WORDS | {"tengo", "para", "algo"}
    words = {w[:7] for w in tokens(query) if len(w) >= 3 and w not in skip}
    result = retrieve(
        conn, "farmacia", query, embedder, k=CANDIDATE_REMEDIES, filters=Filters(price_max), concepts=["medicamentos"]
    )
    hits = [
        h
        for h in result.hits
        if h.concept_id == "medicamentos"
        and not h.metadata.get("receta")
        and "lexico" in h.ranks
        and _treats(h.content, words)
    ]
    products = _dedupe(_within_budget(_with_prices(conn, "farmacia", hits), price_max))[:k]
    return SearchOutcome(result, products if len(products) >= MIN_REMEDIES else [])


def suggest_complement(
    conn: Connection,
    source_concepts: list[str],
    current_vertical: str | None,
    embedder: TextEmbedder | None,
    exclude: set[str] = frozenset(),
    prefer_brands: dict[str, int] | None = None,
) -> Suggestion | None:
    """Mejor complemento que el agente pueda proponer (offers/guards.py: ni alcohol, farmacia, bebé, salud ni
    sensibles), preferentemente de OTRO vertical, con productos reales.

    Con `prefer_brands` (brand_key → pedidos de la persona), se miran más candidatos del concepto y el de la marca
    comprada con más pedidos va primero. Si ninguno es de sus marcas, el resultado es el de siempre."""
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
        if concept is None or not is_offerable(concept) or target in exclude or target in sources:
            continue
        for vertical in _verticals_for(conn, target, current_vertical):
            if not offerable_vertical(vertical):
                continue
            brand = None
            if prefer_brands:
                pool = search_products(conn, vertical, concept.name, [target], embedder, k=BRAND_CANDIDATES, offer=True)
                products, brand = _brand_first(conn, [p for p in pool.products if p.concept == target], prefer_brands)
            if brand is None:
                outcome = search_products(conn, vertical, concept.name, [target], embedder, k=4, offer=True)
                products = [p for p in outcome.products if p.concept == target]
            products = _dedupe(products)
            if products:
                origin = taxonomy.concepts[source]
                reason = f"Porque llevas {origin.emoji} {origin.name.lower()}"
                return Suggestion(target, source, vertical, reason, products[:3], brand)
    return None


BRAND_CANDIDATES = 12  # productos del concepto que se miran para encontrar una marca que la persona compra


def _brand_first(conn: Connection, products: list[Product], brands: dict[str, int]) -> tuple[list[Product], str | None]:
    """El producto de la marca comprada con más pedidos, primero (con empate, el mejor de la búsqueda); el resto en
    su orden. Sin ninguno de sus marcas: (products, None)."""
    rows = conn.execute(
        """SELECT entity_type, entity_id, brand_key FROM item_brands
           WHERE (entity_type, entity_id) IN (SELECT * FROM unnest(%s::text[], %s::text[]))""",
        ([p.entity_type for p in products], [p.entity_id for p in products]),
    )
    found = {(kind, entity): brand for kind, entity, brand in rows}
    owned = [(i, brand) for i, p in enumerate(products) if (brand := found.get((p.entity_type, p.entity_id))) in brands]
    if not owned:
        return products, None
    best, brand = min(owned, key=lambda pair: (-brands[pair[1]], pair[0]))
    return [products[best], *products[:best], *products[best + 1 :]], brand


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


def _focus(hits, concepts: list[str], unmet: bool, capped: bool = False):
    """Si la consulta nombra conceptos, solo esos: pedir cigarrillos no debe traer cerveza.

    - "Sin resultado" no muestra nada, nombre o no un concepto: mostrar una pizza a quien pidió kebab, o los vecinos
      de un coseno bajo τ, sería inventar una respuesta (y la demanda no se anotaría).
    - Con tope de precio (`capped`), si nada del concepto pedido cabe bajo el tope tampoco se muestra otra cosa:
      El agente dice cuánto cuesta lo más barato de lo pedido.
    - El foco no cede ante productos de otro concepto que calzan las palabras: esa coincidencia mira todo el texto y
      el stemming junta palabras («flores» calza con azúcar flor). Que el concepto de la consulta (keywords) y el de
      los productos (categoría) coincidan se asegura en la taxonomía.
    """
    if not concepts:
        return [] if unmet else hits
    matching = [h for h in hits if h.concept_id in concepts]
    if matching:
        return matching
    return [] if unmet or capped else hits


def _allowed(concept_id: str | None, requested: list[str], strict: bool = False) -> bool:
    """Los conceptos sensibles (medicamentos, salud sexual, tabaco, vapeo, adultos) solo aparecen si se piden
    por su nombre: nunca por un síntoma, una ocasión o la cercanía vectorial (regla 6, Ley 20.105). Con `strict`
    (síntomas o farmacia), lo que no tiene concepto tampoco: ahí suele ser un medicamento sin categoría mapeada
    (laxantes, analgésicos, antidiarreicos)."""
    if concept_id is None:
        return not strict
    return concept_id not in _sensitive() or concept_id in requested


def _verticals_for(conn: Connection, concept_id: str, current_vertical: str | None) -> list[str]:
    verticals = ranked_verticals(conn, [concept_id])
    # Primero otros verticales (el valor de la propuesta es cruzar), después el actual.
    return [v for v in verticals if v != current_vertical] + [v for v in verticals if v == current_vertical]


# Una oferta del agente no sale de una tienda que Rappi rotula Farmacia, Sex shop o Smoking shop, esté en la vertical
# que esté: entre las tiendas que quedan, vale la más barata.
_OFFER_STORES = """
                     AND NOT EXISTS (SELECT 1 FROM store_verticals own
                                     WHERE own.store_id = l.store_id AND own.subvertical = ANY(%(blocked)s))"""


def _with_prices(conn: Connection, vertical: str, hits, offer: bool = False, adult_ok: bool = False) -> list[Product]:
    catalog_ids = [h.entity_id for h in hits if h.entity_type == "catalog_item"]
    menu_ids = [h.entity_id for h in hits if h.entity_type == "menu_item"]
    prices: dict[tuple[str, str], tuple] = {}
    store_filter = _OFFER_STORES if offer else ""
    if catalog_ids:
        # Solo ofertas vigentes, con la misma regla que la búsqueda (v_latest_offers): una sucursal que la última
        # corrida de su formato ya no bajó no pone el precio, así el tope y el precio mostrado coinciden.
        # El precio, el precio anterior y la tienda (id y nombre) son los de una misma oferta: la más barata de las
        # tiendas que la app abre con este producto en un pasillo (como /catalog/stores). Una tienda sin pasillos,
        # importada de un CSV antiguo, no tiene página: sin ninguna que se abra vale la oferta más barata de todas y
        # el id es nulo.
        for pid, name, price, real, store, age, store_id, presentation in conn.execute(
            f"""WITH offers AS (
                   SELECT sp.master_product_id, ci.name, l.price, l.real_price, l.store_id,
                          btrim(coalesce(b.name, s.name)) AS store, ci.is_alcoholic OR ci.age_restricted AS adult,
                          ci.presentation,
                          EXISTS (SELECT 1 FROM aisles a WHERE a.store_id = l.store_id AND a.aisle_id = sp.aisle_id
                                                           AND a.parent_aisle_id IS NULL) AS openable
                   FROM store_products sp
                   JOIN v_latest_offers l ON l.store_id = sp.store_id AND l.sku = sp.sku
                   JOIN stores s ON s.store_id = sp.store_id
                   LEFT JOIN brands b ON b.brand_id = s.brand_id
                   JOIN catalog_items ci ON ci.master_product_id = sp.master_product_id
                   JOIN v_store_verticals v ON v.store_id = s.store_id AND v.vertical = %(vertical)s
                   WHERE sp.master_product_id = ANY(%(ids)s::bigint[]) AND l.current
                     AND l.in_stock IS NOT FALSE{store_filter}
               )
               SELECT DISTINCT ON (master_product_id) master_product_id::text, name, price, real_price, store, adult,
                      CASE WHEN openable THEN store_id END, presentation
               FROM offers
               ORDER BY master_product_id, openable DESC, price, store_id""",  # con igual precio, siempre la misma
            {"ids": catalog_ids, "vertical": vertical, "blocked": unofferable_subverticals() if offer else []},
        ):
            prices[("catalog_item", pid)] = (name, price, real, store, age, store_id, presentation)
    if menu_ids:
        for iid, name, price, real, store, store_id, section in conn.execute(
            """SELECT mi.item_id::text, mi.name, mp.price, mp.real_price, s.name, mi.store_id, ms.name
               FROM menu_items mi
               JOIN stores s USING (store_id)
               LEFT JOIN latest_menu_prices mp ON mp.item_id = mi.item_id
               LEFT JOIN menu_sections ms ON ms.store_id = mi.store_id AND ms.section_id = mi.section_id
               WHERE mi.item_id = ANY(%s::bigint[])""",
            (menu_ids,),
        ):
            # En una oferta, un plato de una sección de tragos cuenta como +18 (offers/guards.py).
            prices[("menu_item", iid)] = (name, price, real, store, offer and alcohol_section(section), store_id, None)
    taxonomy = load_taxonomy()
    products = []
    for hit in hits:
        found = prices.get((hit.entity_type, hit.entity_id))
        if found is None:  # sin precio vigente en el vertical (agotado o sin stock): no se ofrece
            continue
        name, price, real, store, age, store_id, presentation = found
        # En una oferta, un nombre que dice alcohol cuenta como +18 aunque la tienda no lo marque (offers/guards.py).
        age = age or (offer and alcohol_in_name(hit.entity_type, name, hit.concept_id))
        if offer and age and not adult_ok:  # +18 aunque su concepto sea corriente: el catálogo lo marca
            continue
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
                # Un precio de relleno ($0, $1) cuenta como desconocido: el producto no se ofrece.
                price_value=float(price) if price is not None and price >= MIN_PRICE else None,
                before_value=float(real) if real is not None else None,
                store=store or hit.metadata.get("restaurante"),
                img=hit.metadata.get("imagen"),
                age_restricted=bool(age) or bool(concept and concept.age_restricted),
                store_id=store_id,
                presentation=presentation or None,
            )
        )
    return [p for p in products if p.price_value is not None]
