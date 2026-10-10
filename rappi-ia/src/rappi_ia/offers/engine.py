"""El motor de ofertas de Mochi: qué propone en cada momento de la app, siempre desde la base (productos reales, con su
precio vigente) y pasando por las guardias de `offers/guards.py`.

Momentos (`POST /mochi/offer`): `plan` (el kit de una ocasión que la persona eligió), `carrito` (un complemento de
otra tienda), `checkout`, `proximo_pedido`, `sin_resultado` (dónde sí está lo que buscó) y `vertical_por_probar` (la
primera vertical del pasaporte sin sello). Si no hay una buena oferta, no hay oferta (`None`: 204): Mochi no dice nada.

Los textos son plantillas en español. Una oferta nunca nombra un concepto que Mochi no puede proponer (el origen de un
complemento puede ser cerveza o pañales, y el texto no lo repite).
"""

from dataclasses import dataclass, field

from psycopg import Connection

from ..agent.grouped_search import SCREEN_VERTICALS
from ..agent.tools import VERTICAL_LABELS, Product, search_products, suggest_complement
from ..agent.verticals import contending_verticals, ranked_verticals
from ..catalog.deals import deals
from ..catalog.stores import product_detail
from ..concepts.taxonomy import Concept, load_taxonomy
from ..embeddings.base import MemoizedQueryEmbedder, TextEmbedder
from ..retrieval.hybrid import _concepts_of, detect_concepts
from .guards import (
    is_offerable,
    is_plannable,
    offerable_vertical,
    plannable_occasion,
    plannable_vertical,
    unofferable_subverticals,
)

KIT_SIZE = 4  # productos del kit de una ocasión
# El concepto ya está elegido: la búsqueda léxica de su nombre (miles de platos «pizza») costaba ~140 ms por búsqueda en
# restaurantes y la vectorial ~11 ms. Se prueba primero la vectorial y, si no trae nada (sin modelo, o documentos sin
# embeddings), la de siempre.
KIT_VERTICALS = 3  # verticales que se prueban por concepto del kit (las más típicas)
SHOWN_PRODUCTS = 3  # productos de una oferta que no es un kit
FALLBACK_VERTICALS = 3  # verticales que se prueban para decir dónde sí está lo que no se encontró
DEAL_POOL = 12  # ofertas que se piden por vertical antes de quitar las que Mochi no propone

# El orden de la Home: lo que ya muestra hoy (la app tiene «Película» para panorama); después, el resto de la taxonomía.
HOME_OCCASIONS = ("once", "carrete", "asado", "panorama", "regalo")

# El pasaporte del juego (prototipo-app/src/game/verticals.js, PASSPORT_ORDER): las verticales del catálogo en el orden
# de DATA.order (prototipo-app/src/data/verticales.json) y Viajes, que no tiene catálogo y aquí no cuenta. Si cambia
# allá, cambia aquí.
PASSPORT_ORDER = (
    "supermercado",
    "conveniencia",
    "turbo",
    "licores",
    "chocolateria",
    "restaurantes",
    "farmacia",
    "mall",
)

# Plantillas. {origen} es el concepto de lo que ya lleva (solo si Mochi puede proponerlo), {destino} el que se ofrece.
PLAN_TEXT = "Tu kit «{occasion}»: {concepts}, de {verticals}."  # el nombre de la ocasión va tal cual, sin gramática
PLAN_ACTION = "Más ideas"
CART_TEXT = "Para acompañar {origen}: {destino}, en {vertical}."
CART_TEXT_ANONYMOUS = "Para completar tu pedido: {destino}, en {vertical}."
CHECKOUT_TEXT = "Antes de pagar: {destino}, en {vertical}. Combina con lo que llevas."
NEXT_ORDER_TEXT = "Para tu próximo pedido: {destino}, en {vertical}. Combina con lo que pediste."
NO_RESULT_TEXT = "No encontré «{query}», pero {destino} sí hay en {vertical}."
TO_TRY_TEXT = "Aún no pruebas {vertical}: mira {what}."
TO_TRY_DEALS = "estas ofertas"
TO_TRY_DISHES = "lo que más piden"
SEE_ACTION = "Ver {destino}"
OPEN_ACTION = "Abrir {vertical}"


class OfferError(ValueError):
    """La petición no tiene sentido (una ocasión que no existe o que Mochi no arma): un 422, no un «sin oferta»."""


@dataclass
class Offer:
    moment: str
    text: str
    products: list[dict]  # `Product.to_dict()`
    vertical: str | None  # en el kit, la de su primer producto; cada producto trae la suya
    reason: dict = field(default_factory=dict)  # concept, from_concept u occasion
    actions: list[dict] = field(default_factory=list)  # label y, según el caso, route (pantalla) o query (búsqueda)

    def to_dict(self) -> dict:
        return {
            "moment": self.moment,
            "text": self.text,
            "products": self.products,
            "vertical": self.vertical,
            "prototype_vertical": SCREEN_VERTICALS.get(self.vertical),
            "reason": self.reason,
            "actions": self.actions,
        }


def home_occasions() -> list[dict]:
    """Las ocasiones que Mochi arma como kit, en el orden de la Home (guagua y enfermo no)."""
    occasions = load_taxonomy().occasions
    ids = [i for i in HOME_OCCASIONS if i in occasions] + [i for i in occasions if i not in HOME_OCCASIONS]
    return [
        {"id": o.id, "name": o.name, "emoji": o.emoji} for o in (occasions[i] for i in ids) if plannable_occasion(o)
    ]


def make_offer(
    conn: Connection, embedder: TextEmbedder | None, moment: str, context: dict, user_id: str | None = None
) -> Offer | None:
    """La oferta de un momento, o None si no hay una buena. `user_id` no cambia la oferta: viaja para los eventos."""
    if moment == "plan":
        return plan(conn, embedder, context["occasion"])
    if moment == "carrito":
        return complement(conn, embedder, "carrito", [context["product"]])
    if moment == "checkout":
        return complement(conn, embedder, "checkout", context["cart"])
    if moment == "proximo_pedido":
        return complement(conn, embedder, "proximo_pedido", context["items"])
    if moment == "sin_resultado":
        return where_is_it(conn, embedder, context["query"])
    if moment == "vertical_por_probar":
        return vertical_to_try(conn, context["stamped"])
    raise OfferError(f"Momento desconocido: {moment}")


# ── plan ─────────────────────────────────────────────────────────────────────
def plan(conn: Connection, embedder: TextEmbedder | None, occasion_id: str) -> Offer | None:
    """El kit de una ocasión: un producto por concepto (hasta KIT_SIZE), de la vertical donde es típico y repartido
    entre verticales, salvo que la ocasión tenga una fija (`vertical` en la taxonomía: «Hambre ya» es pedir comida
    lista): entonces sale de ahí. Es lo único que Mochi arma con alcohol, con su marca +18, porque la persona eligió
    la ocasión; nunca con lo sensible, farmacia, bebé ni salud."""
    taxonomy = load_taxonomy()
    occasion = taxonomy.occasions.get(occasion_id)
    if occasion is None or not plannable_occasion(occasion):
        raise OfferError(f"Mochi no arma un kit de «{occasion_id}»")
    concepts = [c for c in (taxonomy.concepts[i] for i in occasion.concepts) if is_plannable(c)]
    if embedder is not None:  # cada concepto se embebe una vez, en un solo lote, aunque se busque en varias verticales
        embedder = MemoizedQueryEmbedder(embedder)
        embedder.embed_queries([c.name for c in concepts])
    candidates = {c.id: _kit_verticals(conn, c, occasion.vertical) for c in concepts}
    found: dict[tuple[str, str], Product | None] = {}

    def pick(concept: Concept, avoid: set[str]) -> Product | None:
        for vertical in candidates[concept.id]:
            if vertical in avoid:
                continue
            if (concept.id, vertical) not in found:
                found[concept.id, vertical] = _kit_product(conn, embedder, concept, vertical)
            if found[concept.id, vertical]:
                return found[concept.id, vertical]
        return None

    kit: list[tuple[Concept, Product]] = []
    used: set[str] = set()
    left: list[Concept] = []
    for concept in concepts:  # primero cada concepto en su vertical típica, si nadie la usó todavía…
        if len(kit) >= KIT_SIZE:
            break
        typical = candidates[concept.id][:1]
        spread = occasion.vertical is None
        product = None if spread and typical and typical[0] in used else pick(concept, used if spread else set())
        if product:
            kit.append((concept, product))
            used.add(product.vertical)
        else:
            left.append(concept)
    for concept in left:  # …y lo que falte, de otra vertical si la hay y, si no, de una ya usada
        if len(kit) >= KIT_SIZE:
            break
        if product := pick(concept, used) or pick(concept, set()):
            kit.append((concept, product))
            used.add(product.vertical)
    if not kit:
        return None
    verticals = list(dict.fromkeys(p.vertical for _, p in kit))
    text = PLAN_TEXT.format(
        occasion=occasion.name,
        concepts=_join([c.name.lower() for c, _ in kit]),
        verticals=_join([VERTICAL_LABELS.get(v, v) for v in verticals]),
    )
    # «Más ideas» busca lo que Bigotes busca para una ocasión: los nombres de sus primeros conceptos que Mochi arma
    query = " ".join(c.name for c in concepts[:4])
    return Offer(
        "plan",
        text,
        [p.to_dict() for _, p in kit],
        verticals[0],
        {"occasion": occasion.id},
        [{"label": PLAN_ACTION, "query": query}],
    )


def _kit_verticals(conn: Connection, concept: Concept, fixed: str | None) -> list[str]:
    """Dónde se busca el concepto de un kit: la vertical fija de la ocasión, si tiene, y las verticales donde el
    concepto compite (con masa mínima: unos pocos productos de otra no lo representan), las más típicas primero."""
    allowed = [v for v in contending_verticals(conn, [concept.id]) if plannable_vertical(v, concept)]
    if fixed and plannable_vertical(fixed, concept):
        allowed = [fixed] + [v for v in allowed if v != fixed]
    return allowed[:KIT_VERTICALS]


def _kit_product(conn: Connection, embedder: TextEmbedder | None, concept: Concept, vertical: str) -> Product | None:
    for mode in ("vector", "hibrido") if embedder is not None else ("hibrido",):
        outcome = search_products(
            conn,
            vertical,
            concept.name,
            [concept.id],
            embedder,
            k=3,
            mode=mode,
            offer=True,
            adult_ok=concept.age_restricted,
        )
        if product := next((p for p in outcome.products if p.concept == concept.id), None):
            return product
    return None


# ── carrito, checkout y próximo pedido ───────────────────────────────────────
def complement(conn: Connection, embedder: TextEmbedder | None, moment: str, entities: list[dict]) -> Offer | None:
    """Un complemento ofrecible (arista «complementa») de lo que hay en el carrito, el pedido o el producto, de otra
    vertical si la hay, y que no esté ya ahí. Lo que ya está puede ser cualquier cosa: solo se ofrece lo que Mochi
    puede proponer."""
    keys = [(e["entity_type"], e["entity_id"]) for e in entities]
    known = _concepts_of(conn, keys)
    sources = list(dict.fromkeys(known[key] for key in keys if key in known))
    if not sources:
        return None
    current = (ranked_verticals(conn, [sources[0]]) or [None])[0]  # de dónde es lo primero que lleva
    suggestion = suggest_complement(conn, sources, current, embedder, set(sources))
    if suggestion is None:
        return None
    products = [p.to_dict() for p in suggestion.products if (p.entity_type, p.entity_id) not in set(keys)]
    if not products:
        return None
    concepts = load_taxonomy().concepts
    target, origin = concepts[suggestion.concept], concepts[suggestion.source_concept]
    vertical = VERTICAL_LABELS.get(suggestion.vertical, suggestion.vertical)
    if moment == "carrito":
        template = CART_TEXT if is_offerable(origin) else CART_TEXT_ANONYMOUS
    else:
        template = CHECKOUT_TEXT if moment == "checkout" else NEXT_ORDER_TEXT
    text = template.format(origen=origin.name.lower(), destino=target.name.lower(), vertical=vertical)
    reason = {"concept": target.id, "from_concept": origin.id}
    return Offer(moment, text, products, suggestion.vertical, reason, [_see_action(target, suggestion.vertical)])


# ── sin resultado ────────────────────────────────────────────────────────────
def where_is_it(conn: Connection, embedder: TextEmbedder | None, query: str) -> Offer | None:
    """La vertical que Mochi puede proponer y que sí tiene el concepto de la consulta, con hasta tres productos."""
    concepts = load_taxonomy().concepts
    for concept_id in detect_concepts(query):
        concept = concepts.get(concept_id)
        if concept is None or not is_offerable(concept):
            continue
        for vertical in [v for v in ranked_verticals(conn, [concept_id]) if offerable_vertical(v)][:FALLBACK_VERTICALS]:
            outcome = search_products(
                conn, vertical, concept.name, [concept_id], embedder, k=SHOWN_PRODUCTS, offer=True
            )
            products = [p.to_dict() for p in outcome.products if p.concept == concept_id]
            if products:
                text = NO_RESULT_TEXT.format(
                    query=query.strip(), destino=concept.name.lower(), vertical=VERTICAL_LABELS.get(vertical, vertical)
                )
                return Offer(
                    "sin_resultado", text, products, vertical, {"concept": concept_id}, [_see_action(concept, vertical)]
                )
    return None


# ── vertical por probar ──────────────────────────────────────────────────────
def vertical_to_try(conn: Connection, stamped: list[str]) -> Offer | None:
    """La primera vertical del pasaporte sin sello que Mochi puede proponer (nunca farmacia ni Licores), con hasta tres
    de sus ofertas o, en restaurantes (que no tiene ofertas), sus platos más pedidos. Una vertical sin nada que mostrar
    se salta. `stamped`: códigos del backend."""
    for vertical in PASSPORT_ORDER:
        if vertical in stamped or not offerable_vertical(vertical):
            continue
        if products := _popular_dishes(conn) if vertical == "restaurantes" else _offerable_deals(conn, vertical):
            label = VERTICAL_LABELS.get(vertical, vertical)
            what = TO_TRY_DISHES if vertical == "restaurantes" else TO_TRY_DEALS
            action = {"label": OPEN_ACTION.format(vertical=label), "route": [SCREEN_VERTICALS[vertical]]}
            text = TO_TRY_TEXT.format(vertical=label, what=what)
            return Offer("vertical_por_probar", text, products, vertical, {}, [action])
    return None


def _offerable_deals(conn: Connection, vertical: str) -> list[dict]:
    """Las ofertas de la vertical que Mochi puede proponer: ni +18, ni de un concepto que no ofrece, ni de una tienda
    Farmacia, Sex shop o Smoking shop (`deals` ya quita lo sensible, pero con vertical no quita esas tiendas). Un
    producto que está dos veces con otro id (el catálogo repite nombres) sale una vez."""
    concepts = load_taxonomy().concepts
    found = deals(conn, vertical, DEAL_POOL)
    blocked = {
        store_id
        for (store_id,) in conn.execute(
            "SELECT store_id FROM store_verticals WHERE store_id = ANY(%s) AND subvertical = ANY(%s)",
            ([d["store_id"] for d in found if d["store_id"]], unofferable_subverticals()),
        )
    }
    offerable = [
        d
        for d in found
        if not d["age_restricted"]
        and d["store_id"] not in blocked
        and (d["concept"] not in concepts or is_offerable(concepts[d["concept"]]))
    ]
    unique: dict[str, dict] = {}
    for deal in offerable:
        unique.setdefault(" ".join(deal["name"].lower().split()), deal)
    return list(unique.values())[:SHOWN_PRODUCTS]


def _popular_dishes(conn: Connection) -> list[dict]:
    """Los platos populares (`is_popular`) de los conceptos que más se piden hechos en restaurantes, uno por concepto y
    solo de los que Mochi puede proponer. Restaurantes no tiene ofertas ni otro dato de pedidos."""
    concepts = load_taxonomy().concepts
    ranked = [
        concept_id
        for (concept_id,) in conn.execute(
            """SELECT a.concept_id FROM concept_assortment a JOIN concepts c USING (concept_id)
               WHERE a.vertical = 'restaurantes' AND a.items > 0 AND c.prepared ORDER BY a.items DESC, a.concept_id"""
        )
        if concept_id in concepts and is_offerable(concepts[concept_id])
    ]
    dishes = dict(
        conn.execute(
            """SELECT DISTINCT ON (ic.concept_id) ic.concept_id, mi.item_id::text
               FROM menu_items mi
               JOIN item_concepts ic ON ic.entity_type = 'menu_item' AND ic.entity_id = mi.item_id::text
               WHERE mi.is_popular AND ic.concept_id = ANY(%s)
               ORDER BY ic.concept_id, mi.item_id""",
            (ranked,),
        ).fetchall()
    )
    products: list[dict] = []
    for concept_id in ranked:
        if concept_id in dishes and (dish := product_detail(conn, "menu_item", dishes[concept_id])):
            products.append(dish)
        if len(products) >= SHOWN_PRODUCTS:
            break
    return products


def _see_action(concept: Concept, vertical: str) -> dict:
    return {
        "label": SEE_ACTION.format(destino=concept.name.lower()),
        "route": [SCREEN_VERTICALS.get(vertical)],
        "query": concept.name.lower(),
    }


def _join(items: list[str]) -> str:
    """«a, b y c»."""
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " y " + items[-1]
