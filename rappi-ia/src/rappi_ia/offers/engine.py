"""El motor de ofertas del agente: qué propone en cada momento de la app, siempre desde la base (productos reales,
con su precio vigente) y pasando por las guardias de `offers/guards.py`.

Momentos (`POST /agent/offer`): `plan` (el kit de una ocasión que la persona eligió), `carrito` (un complemento de
otra tienda), `checkout`, `proximo_pedido`, `sin_resultado` (dónde sí está lo que buscó), `vertical_por_probar` (la
vertical del pasaporte sin sello donde más le gusta a la persona; sin historia, la primera) y `perfil` (la escalera de
un perfil de gusto, `offers/profiles.py`, con su forma propia: `ProfileOffer`). Si no hay una buena oferta, no hay
oferta (`None`: 204): el agente no dice nada.

Los textos son plantillas en español. Una oferta nunca nombra un concepto que el agente no puede proponer (el origen
de un complemento puede ser cerveza o pañales, y el texto no lo repite).

Cada oferta dice por qué (`Offer.reason`): las claves de siempre (`occasion`, `concept`, `from_concept`), el `text`
(«Porque…») y la `basis`: las señales del contexto que la motivan (`kind` carrito, pedido, busqueda, ocasion, sello o
perfil, este último en el momento `perfil` sin persona; e `id`; `source` «contexto» y sin `score`, que es de las
señales de una persona en `offers/personal.py`). Lo que el agente no propone no entra a la base. Cuando la oferta se
ordena por lo que le gusta a la persona (`vertical_por_probar` y las ocasiones de la Home), la `basis` son sus señales
(`kind` concepto, con `score` y `source`) de los conceptos que más aportan. Un complemento cuyo primer producto es de
una marca que la persona compra lo dice en el `text` y suma esa señal (`marca`, con los pedidos como `score`). En el
momento `perfil` de una persona, el porqué es el «por qué» de su perfil y la `basis`, la suya (`offers/profiles.py`):
la evidencia de sus segmentos (`source` «segmento:<id>», el peso de su nivel como `score`) y lo que pidió y buscó
(`source` «pedidos» o «busquedas», cuántas veces como `score`).
"""

from dataclasses import dataclass, field

from psycopg import Connection

from .. import config
from ..agent.grouped_search import SCREEN_VERTICALS
from ..agent.tools import VERTICAL_LABELS, Product, search_products, suggest_complement
from ..agent.verticals import contending_verticals, ranked_verticals, typical_verticals
from ..catalog.deals import deals
from ..catalog.stores import product_detail
from ..concepts.taxonomy import Concept, Service, load_taxonomy
from ..embeddings.base import MemoizedQueryEmbedder, TextEmbedder
from ..retrieval.hybrid import _concepts_of, detect_concepts
from ..text import contract_articles, normalize, tokens
from .guards import (
    alcohol_in_name,
    alcohol_section,
    baby_in_name,
    is_offerable,
    is_plannable,
    offerable_vertical,
    plannable_occasion,
    plannable_vertical,
    unofferable_subverticals,
)
from .personal import Interests, Signal, bought_brands, user_interests
from .profiles import (
    ActiveProfile,
    Destination,
    Profile,
    active_profiles,
    ladder,
    load_destinations,
    load_profiles,
    ordered_restaurants,
    person_city,
)

KIT_SIZE = 4  # productos del kit de una ocasión
# El concepto ya está elegido: la búsqueda léxica de su nombre (miles de platos «pizza») costaba ~140 ms por búsqueda en
# restaurantes y la vectorial ~11 ms. Se prueba primero la vectorial y, si no trae nada (sin modelo, o documentos sin
# embeddings), la de siempre.
KIT_VERTICALS = 3  # verticales que se prueban por concepto del kit (las más típicas)
KIT_CANDIDATES = 6  # productos que se piden por concepto y vertical: se saltan los de nombre pelado
ARTICLES = frozenset({"el", "la", "los", "las", "un", "una", "unos", "unas"})  # normalizados
SHOWN_PRODUCTS = 3  # productos de una oferta que no es un kit
FALLBACK_VERTICALS = 3  # verticales que se prueban para decir dónde sí está lo que no se encontró
# Ofertas que se piden por vertical antes de quitar las que el agente no propone y de poner primero las típicas de la
# vertical. Con 12, en la base real las más rebajadas del súper eran mantas y accesorios de auto, y ninguna típica; con
# 60 había 4 típicas y con 200, 28. El costo de `deals()` no depende del tope.
DEAL_POOL = 200
# Las verticales donde se compra comida (el súper, Express y Turbo) y los grupos de la taxonomía que se comen o se
# beben: en ellas, una oferta de otro grupo (cera para auto, papel higiénico) va después de la comida.
FOOD_VERTICALS = ("supermercado", "conveniencia", "turbo")
FOOD_GROUPS = ("bebidas", "snacks", "dulces", "despensa", "frescos", "comida")

# El orden de la Home: lo que ya muestra hoy (la app tiene «Película» para panorama); después, el resto de la taxonomía.
HOME_OCCASIONS = ("once", "carrete", "asado", "panorama", "regalo")

# El pasaporte del juego (prototipo-app/src/game/verticals.js, PASSPORT_ORDER): las verticales del catálogo en ese
# orden y Viajes, que no tiene catálogo y aquí no cuenta. Si cambia allá, cambia aquí.
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

# Plantillas. {origen} es el concepto de lo que ya lleva (solo si el agente puede proponerlo), {destino} el que se
# ofrece.
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
# Por qué se ofrece (`reason.text`). {emoji} {name} es el concepto de lo que ya hay en el carrito o en el pedido.
REASON_PLAN = "Porque elegiste «{occasion}»."
REASON_CART = "Porque llevas {emoji} {name}."
REASON_CART_ANONYMOUS = "Porque combina con lo que llevas."
REASON_NEXT = "Porque pediste {emoji} {name}."
REASON_NEXT_ANONYMOUS = "Porque combina con lo que pediste."
REASON_NO_RESULT = "Porque buscaste «{query}» y aquí sí hay."
REASON_TO_TRY = "Porque aún no tienes el sello de {vertical}."
SEE_ACTION = "Ver {destino}"
OPEN_ACTION = "Abrir {vertical}"
REASON_LIKES_VERTICAL = "Porque te gusta {emoji} {name}, y en {vertical} hay más."
REASON_LIKES_OCCASION = "Porque te gusta {emoji} {name}."
REASON_BRAND = " Es {brand}, la marca que compras."  # se suma al porqué de un complemento de su marca
# El momento `perfil`: «Como te gusta» y el `gusto` del perfil (offers/perfiles.toml); sin él, el nombre del perfil.
PROFILE_TEXT = "Como te gusta {likes}, mira esto en otras verticales."
PROFILE_TEXT_NAMED = "Para tu perfil {emoji} {name}: mira esto en otras verticales."
REASON_PROFILE = "Porque elegiste «{name}»."  # sin persona, o con un perfil que no es suyo
TRIP_SERVICE = "rappitravel"  # el servicio de la taxonomía al que lleva el viaje (sin catálogo)
TRIP_LABEL = "Idea para {service}"
BASIS_CONCEPTS = 3  # conceptos que más aportan, de los que la `basis` de una oferta lleva las señales


class OfferError(ValueError):
    """La petición no tiene sentido (una ocasión o un perfil que no existe, o una ocasión que el agente no arma): un
    422, no un «sin oferta»."""


@dataclass
class Offer:
    moment: str
    text: str
    products: list[dict]  # `Product.to_dict()`
    vertical: str | None  # en el kit, la de su primer producto; cada producto trae la suya
    reason: dict = field(default_factory=dict)  # concept, from_concept u occasion, más text y basis
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


@dataclass
class ProfileOffer:
    """La oferta del momento `perfil`: la escalera de un perfil, de a un peldaño, y su viaje (una idea para
    RappiTravel)."""

    text: str
    profile: dict  # id, nombre y emoji; con persona, además su nivel y su «por qué»
    steps: list[dict]  # `LadderStep.to_dict()`
    trip: dict | None
    reason: dict
    actions: list[dict]

    def to_dict(self) -> dict:
        return {
            "moment": "perfil",
            "text": self.text,
            "perfil": self.profile,
            "escalera": self.steps,
            "viaje": self.trip,
            "reason": self.reason,
            "actions": self.actions,
        }


def home_occasions(conn: Connection, interests: Interests) -> list[dict]:
    """Las ocasiones que el agente arma como kit (guagua y enfermo no). Primero las que suman puntaje con lo que le
    gusta a la persona (la suma de sus conceptos ofrecibles), de más a menos y con su `reason`; el resto, en el orden de
    la Home (`HOME_OCCASIONS` y después la taxonomía), que también desempata."""
    occasions = load_taxonomy().occasions
    ids = [i for i in HOME_OCCASIONS if i in occasions] + [i for i in occasions if i not in HOME_OCCASIONS]
    home = [
        {"id": o.id, "name": o.name, "emoji": o.emoji} for o in (occasions[i] for i in ids) if plannable_occasion(o)
    ]
    scores: dict[str, float] = {}
    for item in home:
        contributions = {c: interests.concepts[c] for c in occasions[item["id"]].concepts if c in interests.concepts}
        scores[item["id"]] = sum(contributions.values())
        if contributions:
            item["reason"] = _likes_reason(REASON_LIKES_OCCASION, contributions, interests)
    return sorted(home, key=lambda o: -scores[o["id"]])  # estable: puntaje 0 y empates siguen el orden de la Home


def _likes_reason(template: str, contributions: dict[str, float], interests: Interests, **format_args: str) -> dict:
    """«Porque te gusta…»: el concepto que más aporta da el texto y la `basis`, las señales de los que más aportan."""
    top = sorted(contributions, key=lambda c: (-contributions[c], c))[:BASIS_CONCEPTS]
    concept = load_taxonomy().concepts[top[0]]
    text = template.format(emoji=concept.emoji, name=concept.name.lower(), **format_args)
    return _reason(text, [s.to_dict() for c in top for s in interests.basis[c]])


def make_offer(
    conn: Connection, embedder: TextEmbedder | None, moment: str, context: dict, user_id: str | None = None
) -> Offer | ProfileOffer | None:
    """La oferta de un momento, o None si no hay una buena. Con `user_id` de alguien del prototipo, los momentos que
    personalizan se ordenan por lo que le gusta (`vertical_por_probar`; sus intereses se calculan una sola vez),
    prefieren las marcas que compra (el complemento de `carrito`, `checkout` y `proximo_pedido`) o parten de sus
    perfiles de gusto (`perfil`)."""
    if moment == "plan":
        return plan(conn, embedder, context["occasion"])
    if moment == "carrito":
        return complement(conn, embedder, "carrito", [context["product"]], bought_brands(conn, user_id))
    if moment == "checkout":
        return complement(conn, embedder, "checkout", context["cart"], bought_brands(conn, user_id))
    if moment == "proximo_pedido":
        return complement(conn, embedder, "proximo_pedido", context["items"], bought_brands(conn, user_id))
    if moment == "sin_resultado":
        return where_is_it(conn, embedder, context["query"])
    if moment == "vertical_por_probar":
        return vertical_to_try(conn, context["stamped"], user_interests(conn, user_id))
    if moment == "perfil":
        return profile_offer(conn, embedder, context.get("perfil"), user_id)
    raise OfferError(f"Momento desconocido: {moment}")


# ── plan ─────────────────────────────────────────────────────────────────────
def plan(conn: Connection, embedder: TextEmbedder | None, occasion_id: str) -> Offer | None:
    """El kit de una ocasión: un producto por concepto (hasta KIT_SIZE), de la vertical donde es típico y repartido
    entre verticales, salvo que la ocasión tenga una fija (`vertical` en la taxonomía: «Hambre ya» es pedir comida
    lista): entonces sale de ahí. Es lo único que el agente arma con alcohol, con su marca +18, porque la persona eligió
    la ocasión; nunca con lo sensible, farmacia, bebé ni salud."""
    taxonomy = load_taxonomy()
    occasion = taxonomy.occasions.get(occasion_id)
    if occasion is None or not plannable_occasion(occasion):
        raise OfferError(f"{config.AGENT_NAME} no arma un kit de «{occasion_id}»")
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
    text = contract_articles(
        PLAN_TEXT.format(
            occasion=occasion.name,
            concepts=_join([c.name.lower() for c, _ in kit]),
            verticals=_join([VERTICAL_LABELS.get(v, v) for v in verticals]),
        )
    )
    # «Más ideas» busca lo que el agente busca para una ocasión: los nombres de sus primeros conceptos que arma
    query = " ".join(c.name for c in concepts[:4])
    return Offer(
        "plan",
        text,
        [p.to_dict() for _, p in kit],
        verticals[0],
        _reason(
            REASON_PLAN.format(occasion=occasion.name),
            [_context_signal("ocasion", occasion.id)],
            occasion=occasion.id,
        ),
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
    """El primer producto del concepto en la vertical que dice qué es: se saltan los de nombre pelado."""
    for mode in ("vector", "hibrido") if embedder is not None else ("hibrido",):
        outcome = search_products(
            conn,
            vertical,
            concept.name,
            [concept.id],
            embedder,
            k=KIT_CANDIDATES,
            mode=mode,
            offer=True,
            adult_ok=concept.age_restricted,
        )
        if product := next((p for p in outcome.products if p.concept == concept.id and not _bare(p, concept)), None):
            return product
    return None


def _bare(product: Product, concept: Concept) -> bool:
    """«POLLO», «Queso» o «el Pollo»: el nombre es una sola palabra (sin contar el artículo) o el del concepto mismo, y
    no dice qué producto es."""
    words = [w for w in tokens(product.name) if w not in ARTICLES]
    return len(words) <= 1 or normalize(product.name) == normalize(concept.name)


# ── carrito, checkout y próximo pedido ───────────────────────────────────────
def complement(
    conn: Connection,
    embedder: TextEmbedder | None,
    moment: str,
    entities: list[dict],
    brands: dict[str, int] | None = None,
) -> Offer | None:
    """Un complemento ofrecible (arista «complementa») de lo que hay en el carrito, el pedido o el producto, de otra
    vertical si la hay, y que no esté ya ahí. Lo que ya está puede ser cualquier cosa: solo se ofrece lo que el agente
    puede proponer. Con `brands` (las que la persona compra: brand_key → pedidos), si el primer producto es de una de
    ellas, el porqué la nombra."""
    keys = [(e["entity_type"], e["entity_id"]) for e in entities]
    known = _concepts_of(conn, keys)
    sources = list(dict.fromkeys(known[key] for key in keys if key in known))
    if not sources:
        return None
    current = (ranked_verticals(conn, [sources[0]]) or [None])[0]  # de dónde es lo primero que lleva
    suggestion = suggest_complement(conn, sources, current, embedder, set(sources), brands)
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
    reason = complement_reason(moment, origin, target)
    if suggestion.brand and products[0]["id"] == suggestion.products[0].id:  # su marca sigue encabezando la oferta
        name = conn.execute("SELECT name FROM product_brands WHERE brand_key = %s", (suggestion.brand,)).fetchone()[0]
        reason["text"] += REASON_BRAND.format(brand=name)
        reason["basis"].append(Signal("marca", suggestion.brand, brands[suggestion.brand], "pedidos").to_dict())
    return Offer(moment, text, products, suggestion.vertical, reason, [_see_action(target, suggestion.vertical)])


def complement_reason(moment: str, origin: Concept, target: Concept) -> dict:
    """Por qué se ofrece `target` en `carrito`, `checkout` o `proximo_pedido`. Si el agente no propone el origen
    (cerveza, pañales), ni el texto ni la base lo nombran."""
    ordered = moment == "proximo_pedido"
    if is_offerable(origin):
        template = REASON_NEXT if ordered else REASON_CART
        text = template.format(emoji=origin.emoji, name=origin.name.lower())
        basis = [_context_signal("pedido" if ordered else "carrito", origin.id)]
    else:
        text, basis = REASON_NEXT_ANONYMOUS if ordered else REASON_CART_ANONYMOUS, []
    return _reason(text, basis, concept=target.id, from_concept=origin.id)


# ── sin resultado ────────────────────────────────────────────────────────────
def where_is_it(conn: Connection, embedder: TextEmbedder | None, query: str) -> Offer | None:
    """La vertical que el agente puede proponer y que sí tiene el concepto de la consulta, con hasta tres productos."""
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
                reason = _reason(
                    REASON_NO_RESULT.format(query=query.strip()),
                    [_context_signal("busqueda", query.strip())],
                    concept=concept_id,
                )
                return Offer("sin_resultado", text, products, vertical, reason, [_see_action(concept, vertical)])
    return None


# ── vertical por probar ──────────────────────────────────────────────────────
def vertical_to_try(conn: Connection, stamped: list[str], interests: Interests) -> Offer | None:
    """La vertical del pasaporte sin sello que el agente puede proponer (nunca farmacia ni Licores) donde más le
    gusta a la persona, o la primera del pasaporte si no hay afinidad (el orden de `PASSPORT_ORDER` desempata). Muestra
    hasta tres de sus ofertas o, en restaurantes (que no tiene ofertas), sus platos más pedidos; una vertical sin nada
    que mostrar se salta. `stamped`: códigos del backend."""
    candidates = [v for v in PASSPORT_ORDER if v not in stamped and offerable_vertical(v)]
    affinity = _vertical_affinity(conn, interests) if interests.concepts else {}
    for vertical in sorted(candidates, key=lambda v: -sum(affinity.get(v, {}).values())):
        if products := _popular_dishes(conn) if vertical == "restaurantes" else _offerable_deals(conn, vertical):
            label = VERTICAL_LABELS.get(vertical, vertical)
            what = TO_TRY_DISHES if vertical == "restaurantes" else TO_TRY_DEALS
            action = {"label": OPEN_ACTION.format(vertical=label), "route": [SCREEN_VERTICALS[vertical]]}
            text = TO_TRY_TEXT.format(vertical=label, what=what)
            if likes := affinity.get(vertical):
                reason = _likes_reason(REASON_LIKES_VERTICAL, likes, interests, vertical=label)
            else:
                reason = _reason(
                    contract_articles(REASON_TO_TRY.format(vertical=label)), [_context_signal("sello", vertical)]
                )
            return Offer("vertical_por_probar", text, products, vertical, reason, [action])
    return None


def _vertical_affinity(conn: Connection, interests: Interests) -> dict[str, dict[str, float]]:
    """vertical → {concepto: puntaje} de los conceptos que le gustan a la persona y cuya vertical típica es esa."""
    typical = typical_verticals(conn)
    affinity: dict[str, dict[str, float]] = {}
    for concept_id, score in interests.concepts.items():
        if vertical := typical.get(concept_id):
            affinity.setdefault(vertical, {})[concept_id] = score
    return affinity


# ── perfil ───────────────────────────────────────────────────────────────────
def profile_offer(
    conn: Connection, embedder: TextEmbedder | None, profile_id: str | None, user_id: str | None
) -> ProfileOffer | None:
    """La escalera de un perfil de gusto. Sin `profile_id`, el primero de los perfiles de la persona (el principal y
    después por puntaje); con él, ese perfil, y con su «por qué» solo si es uno de los suyos (si no, «Porque elegiste…»,
    como sin persona: lo que usan la demo y el contrato). El peldaño de restaurantes deja fuera los locales donde la
    persona ya pidió y muestra los de su ciudad (`person_city`). None (204) sin perfil o sin escalera; un perfil que
    no existe es un `OfferError` (422)."""
    profiles = load_profiles()
    if profile_id is not None and profile_id not in profiles:
        raise OfferError(f"Perfil desconocido: «{profile_id}»")
    mine = {active.profile.id: active for active in active_profiles(conn, user_id)}  # en su orden
    if profile_id is None and not mine:
        return None
    profile = profiles[profile_id] if profile_id is not None else next(iter(mine.values())).profile
    active = mine.get(profile.id)
    steps = ladder(conn, embedder, profile, ordered_restaurants(conn, user_id), person_city(conn, user_id))
    if not steps:
        return None
    shown = {"id": profile.id, "nombre": profile.name, "emoji": profile.emoji}
    if active:
        shown |= {"nivel": active.level, "por_que": active.reason}
    actions = [
        {
            "label": OPEN_ACTION.format(vertical=VERTICAL_LABELS[s.step.vertical]),
            "route": [SCREEN_VERTICALS[s.step.vertical]],
        }
        for s in steps
    ]
    trip = None
    if profile.trip:
        travel = load_taxonomy().services[TRIP_SERVICE]
        trip = _trip(load_destinations()[profile.trip], travel)
        actions.append(
            {"label": OPEN_ACTION.format(vertical=travel.name), "route": [travel.route], "service": travel.id}
        )
    return ProfileOffer(
        _profile_text(profile),
        shown,
        [s.to_dict() for s in steps],
        trip,
        _profile_reason(profile, active),
        actions,
    )


def _profile_text(profile: Profile) -> str:
    """«Como te gusta lo asiático…», con el `gusto` del perfil; sin él, el nombre del perfil con su emoji."""
    if profile.likes:
        return PROFILE_TEXT.format(likes=profile.likes)
    return PROFILE_TEXT_NAMED.format(emoji=profile.emoji, name=profile.name)


def _profile_reason(profile: Profile, active: ActiveProfile | None) -> dict:
    if active:
        return _reason(active.reason, list(active.basis))
    return _reason(REASON_PROFILE.format(name=profile.name), [_context_signal("perfil", profile.id)])


def _trip(destination: Destination, travel: Service) -> dict:
    """El último peldaño: un destino curado, rotulado como idea para RappiTravel (sin precios ni fechas)."""
    return {
        "id": destination.id,
        "nombre": destination.name,
        "texto": destination.text,
        "hechos": [{"texto": f.text, "fuente": f.source, "url": f.url} for f in destination.facts],
        "etiqueta": TRIP_LABEL.format(service=travel.name),
        "route": [travel.route],
    }


def _offerable_deals(conn: Connection, vertical: str) -> list[dict]:
    """Las ofertas de la vertical que el agente puede proponer: ni +18 (tampoco un nombre que dice alcohol), ni un
    nombre que dice bebé, ni de un concepto que no ofrece, ni de una tienda Farmacia, Sex shop o Smoking shop (`deals`
    ya quita lo sensible, pero con vertical no quita esas tiendas). Un producto que está dos veces con otro id (el
    catálogo repite nombres) sale una vez. Las de un concepto típico de la vertical van primero."""
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
        and not alcohol_in_name("catalog_item", d["name"])  # las ofertas de `deals` son del catálogo
        and not baby_in_name("catalog_item", d["name"])
        and d["store_id"] not in blocked
        and (d["concept"] not in concepts or is_offerable(concepts[d["concept"]]))
    ]
    unique: dict[str, dict] = {}
    for deal in offerable:
        unique.setdefault(" ".join(deal["name"].lower().split()), deal)
    return _typical_first(list(unique.values()), vertical, typical_verticals(conn))[:SHOWN_PRODUCTS]


def _typical_first(found: list[dict], vertical: str, typical: dict[str, str]) -> list[dict]:
    """Primero las ofertas de un concepto típico de la vertical (el súper ofrecía mantas y silicona para auto con 60 %
    de descuento), después las de cualquier otro concepto y al final las sin concepto. En las verticales de comida
    (`FOOD_VERTICALS`), lo que no es de un grupo de comida va después de la comida aunque sea típico (Express partía
    con una cera para auto: `automotriz` es típico de las tiendas de las bencineras). Dentro de cada grupo se mantiene
    el orden de llegada (el mayor descuento primero); si las primeras no alcanzan, completan las demás."""
    concepts = load_taxonomy().concepts

    def group(deal: dict) -> int:
        if not deal["concept"]:
            return 3
        concept = concepts.get(deal["concept"])
        if vertical in FOOD_VERTICALS and concept and (concept.parent or concept.id) not in FOOD_GROUPS:
            return 2
        return 0 if typical.get(deal["concept"]) == vertical else 1

    return sorted(found, key=group)


def _popular_dishes(conn: Connection) -> list[dict]:
    """Los platos populares (`is_popular`) de los conceptos que más se piden hechos en restaurantes, uno por concepto y
    solo de los que el agente puede proponer, sin un nombre que diga alcohol ni de una sección de tragos
    (`alcohol_in_name`, `alcohol_section`). Restaurantes no tiene ofertas ni otro dato de pedidos."""
    concepts = load_taxonomy().concepts
    ranked = [
        concept_id
        for (concept_id,) in conn.execute(
            """SELECT a.concept_id FROM concept_assortment a JOIN concepts c USING (concept_id)
               WHERE a.vertical = 'restaurantes' AND a.items > 0 AND c.prepared ORDER BY a.items DESC, a.concept_id"""
        )
        if concept_id in concepts and is_offerable(concepts[concept_id])
    ]
    dishes: dict[str, str] = {}
    for concept_id, item_id, name, section in conn.execute(
        """SELECT ic.concept_id, mi.item_id::text, mi.name, ms.name
           FROM menu_items mi
           JOIN item_concepts ic ON ic.entity_type = 'menu_item' AND ic.entity_id = mi.item_id::text
           LEFT JOIN menu_sections ms ON ms.store_id = mi.store_id AND ms.section_id = mi.section_id
           WHERE mi.is_popular AND ic.concept_id = ANY(%s)
           ORDER BY ic.concept_id, mi.item_id""",
        (ranked,),
    ):
        if concept_id in dishes or alcohol_in_name("menu_item", name, concept_id) or alcohol_section(section):
            continue
        dishes[concept_id] = item_id
    products: list[dict] = []
    for concept_id in ranked:
        if concept_id in dishes and (dish := product_detail(conn, "menu_item", dishes[concept_id])):
            products.append(dish)
        if len(products) >= SHOWN_PRODUCTS:
            break
    return products


def _context_signal(kind: str, signal_id: str) -> dict:
    return {"kind": kind, "id": signal_id, "source": "contexto"}


def _reason(text: str, basis: list[dict], **ids: str) -> dict:
    return {**ids, "text": text, "basis": basis}


def _see_action(concept: Concept, vertical: str) -> dict:
    return {
        "label": SEE_ACTION.format(destino=concept.name.lower()),
        "route": [SCREEN_VERTICALS.get(vertical)],
        "query": concept.name.lower(),
    }


def _join(items: list[str]) -> str:
    """«a, b y c»."""
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " y " + items[-1]
