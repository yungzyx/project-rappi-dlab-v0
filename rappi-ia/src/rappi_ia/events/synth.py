"""Usuarios y eventos SIMULADOS para construir el panel antes de tener datos reales.

Todo queda con `source = 'synthetic'`. Los productos son reales (del catálogo), la conducta es inventada con
supuestos explícitos. El panel muestra la mecánica, no evidencia: por construcción, estos supuestos se
"confirman" en los gráficos.

SUPUESTOS (editables aquí):
- Personas con verticales, conceptos y ritmo de compra propios (PERSONAS).
- Quien no encuentra lo que busca (demanda no satisfecha) o abandona carros, se va antes (CHURN_*).
- Parte de quienes encuentran productos se va sin agregar nada al carro (BROWSE_ONLY).
- Parte de los carros abandonados alcanza a iniciar el pago (CHECKOUT_ABANDON_SHARE); el resto se va antes.
- Quien compra en 2+ verticales se va menos (MULTI_VERTICAL_RETENTION): es la hipótesis del proyecto.
- Aceptar una sugerencia cruzada acorta un poco el ritmo de compra (SUGGESTION_CADENCE_BOOST).
- Algunos antojos no existen en el catálogo y crecen con el tiempo (WISHES): alimentan "oportunidades".
"""

import io
import logging
import math
import random
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from psycopg import Connection

from ..agent.verticals import ranked_verticals

log = logging.getLogger(__name__)
CHILE = timezone(timedelta(hours=-3))


@dataclass(frozen=True)
class Persona:
    id: str
    share: float  # fracción de usuarios
    cadence_days: float  # días entre pedidos (mediana)
    hours: tuple[int, ...]  # horas típicas de uso
    interests: dict[str, dict[str, float]]  # vertical → concepto → peso
    abandon: float  # probabilidad de abandonar un carro
    churn: float  # riesgo semanal base


PERSONAS = [
    Persona(
        "carrete",
        0.22,
        10,
        (19, 20, 21, 22, 23),
        {
            "licores": {"cerveza": 5, "pisco": 3, "ron": 1.5, "vodka": 1, "snacks-salados": 2, "hielo": 0.5},
            "conveniencia": {"cerveza": 2, "snacks-salados": 2, "gaseosas": 1.5, "energizantes": 1},
            "restaurantes": {"pizza": 3, "hamburguesa": 2, "sushi": 1},
        },
        0.35,
        0.035,
    ),
    Persona(
        "familia",
        0.26,
        9,
        (10, 11, 17, 18, 19),
        {
            "supermercado": {
                "lacteos": 4,
                "panales": 3,
                "frutas": 3,
                "carnes": 2.5,
                "limpieza": 2,
                "panaderia": 2,
                "cereales": 1.5,
                "alimentacion-bebe": 1.5,
            },
            "restaurantes": {"pizza": 2, "pollo-preparado": 1.5},
            "chocolateria": {"pasteleria": 0.5},
        },
        0.25,
        0.02,
    ),
    Persona(
        "oficina",
        0.2,
        6,
        (12, 13, 14),
        {
            "restaurantes": {"ensaladas-bowls": 3, "sandwiches": 2.5, "sushi": 2, "pastas": 1.5, "asiatica": 1.5},
            "conveniencia": {"cafe": 2, "energizantes": 1, "galletas": 1},
        },
        0.3,
        0.03,
    ),
    Persona(
        "foodie",
        0.14,
        12,
        (20, 21, 22),
        {
            "restaurantes": {"sushi": 3, "pastas": 2.5, "postres": 2, "helados": 1.5, "carnes": 1.5},
            "chocolateria": {"chocolates": 2, "pasteleria": 1.5},
            "licores": {"vino": 2, "espumante": 1},
        },
        0.28,
        0.025,
    ),
    Persona(
        "mascotero",
        0.1,
        20,
        (9, 10, 18, 19),
        {
            "supermercado": {"alimento-perro": 4, "alimento-gato": 3, "accesorios-mascota": 1.5, "limpieza": 1},
            "conveniencia": {"alimento-perro": 1},
        },
        0.2,
        0.015,
    ),
    Persona(
        "hogar",
        0.08,
        30,
        (11, 16, 21),
        {
            "mall": {"cocina-menaje": 3, "decoracion": 2.5, "juguetes-infantiles": 2, "textil-hogar": 1.5, "audio": 1},
            "supermercado": {"limpieza": 1.5},
        },
        0.4,
        0.03,
    ),
]

# Antojos que el catálogo no tiene (o casi): (vertical, texto, concepto, peso inicial, crecimiento semanal)
WISHES = [
    ("restaurantes", "comida peruana, un lomo saltado", "peruana", 0.4, 0.12),
    ("restaurantes", "tacos mexicanos", "mexicana", 0.5, 0.04),
    ("restaurantes", "shawarma de pollo", "arabe", 0.25, 0.06),
    ("restaurantes", "desayuno a domicilio", "desayuno", 0.3, 0.1),
    ("supermercado", "kombucha", None, 0.2, 0.08),
    ("mall", "neumáticos para el auto", "automotriz", 0.1, 0.0),
]

CHURN_UNMET = 0.35  # +35% de riesgo por cada búsqueda sin resultado en las últimas 4 semanas
CHURN_ABANDON = 0.2  # +20% por cada carro abandonado en las últimas 4 semanas
CHECKOUT_ABANDON_SHARE = 0.4  # de los carros abandonados, la parte que alcanza a iniciar el pago
MULTI_VERTICAL_RETENTION = 0.55  # riesgo × 0,55 si compró en 2+ verticales en 60 días
BROWSE_ONLY = 0.12  # encuentra productos y se va sin agregar nada al carro
SUGGESTION_ACCEPT = 0.22  # probabilidad base de aceptar una sugerencia cruzada (× peso de la arista)
SUGGESTION_CADENCE_BOOST = 0.93  # aceptar una sugerencia acorta el ritmo 7%
MODALITIES = (("texto", 0.8), ("voz", 0.12), ("foto", 0.08))


@dataclass
class Catalog:
    """Ítems reales por (vertical, concepto): (entity_type, entity_id, precio)."""

    items: dict[tuple[str, str], list[tuple[str, str, float]]]
    edges: dict[str, list[tuple[str, float]]]
    names: dict[str, str]
    ranked: dict[str, list[str]]  # concepto sugerible → verticales en el orden de Bigotes (`ranked_verticals`)

    def pick(self, rng: random.Random, vertical: str, concept: str):
        options = self.items.get((vertical, concept))
        return rng.choice(options) if options else None


@dataclass
class UserState:
    user_id: str
    persona: Persona
    city: str
    cadence: float
    active: bool = True
    orders_by_vertical: dict[str, list[datetime]] = field(default_factory=dict)
    recent_unmet: list[datetime] = field(default_factory=list)
    recent_abandon: list[datetime] = field(default_factory=list)


def load_catalog(conn: Connection, per_concept: int = 40) -> Catalog:
    rows = conn.execute(
        """SELECT vertical, concept_id, entity_type, entity_id, price FROM (
               SELECT d.vertical, ic.concept_id, d.entity_type, d.entity_id,
                      coalesce((d.metadata->>'precio_min')::numeric, (d.metadata->>'precio')::numeric) AS price,
                      row_number() OVER (PARTITION BY d.vertical, ic.concept_id ORDER BY md5(d.entity_id)) AS rn
               FROM search_documents d
               JOIN item_concepts ic USING (entity_type, entity_id)
               WHERE d.entity_type IN ('catalog_item', 'menu_item')
           ) s
           WHERE rn <= %s AND price IS NOT NULL""",
        (per_concept,),
    ).fetchall()
    items: dict[tuple[str, str], list] = {}
    for vertical, concept, etype, eid, price in rows:
        items.setdefault((vertical, concept), []).append((etype, eid, float(price)))
    edges: dict[str, list] = {}
    for source, target, weight in conn.execute(
        "SELECT from_concept, to_concept, weight FROM concept_edges WHERE method = 'curado'"
    ):
        edges.setdefault(source, []).append((target, float(weight)))
    names = dict(conn.execute("SELECT concept_id, name FROM concepts").fetchall())
    targets = {target for options in edges.values() for target, _ in options}
    ranked = {target: ranked_verticals(conn, [target]) for target in targets}
    return Catalog(items, edges, names, ranked)


def generate(conn: Connection, users: int = 1500, weeks: int = 20, seed: int = 7, until: date | None = None) -> dict:
    """Borra los datos simulados anteriores y genera nuevos (reproducible con la misma semilla y fecha)."""
    rng = random.Random(seed)
    catalog = load_catalog(conn)
    end = datetime.combine(until or date.today(), datetime.min.time(), CHILE)
    start = end - timedelta(weeks=weeks)
    conn.execute("DELETE FROM app_users WHERE source = 'synthetic'")

    buffers = {"users": io.StringIO(), "events": io.StringIO(), "orders": io.StringIO(), "lines": io.StringIO()}
    counts = {"usuarios": 0, "eventos": 0, "pedidos": 0}
    for n in range(users):
        persona = rng.choices(PERSONAS, weights=[p.share for p in PERSONAS])[0]
        state = UserState(
            user_id=f"syn-{seed}-{n:05d}",
            persona=persona,
            city=rng.choices(["Santiago", "Valparaíso", "Concepción", "Antofagasta"], [0.7, 0.12, 0.1, 0.08])[0],
            cadence=persona.cadence_days * math.exp(rng.gauss(0, 0.35)),
        )
        signup = start + timedelta(days=rng.uniform(0, weeks * 7 * 0.6))
        _write(buffers["users"], state.user_id, "synthetic", persona.id, state.city, rng.random() < 0.4, _iso(signup))
        counts["usuarios"] += 1
        _simulate_user(rng, catalog, state, signup, end, start, buffers, counts)

    _copy(conn, "app_users (user_id, source, segment, city, consent_notifications, created_at)", buffers["users"])
    _copy(conn, "app_orders (order_id, user_id, session_id, cart_id, ts, vertical, total, source)", buffers["orders"])
    _copy(
        conn,
        "app_order_lines (order_id, line_no, entity_type, entity_id, concept_id, qty, unit_price, from_suggestion)",
        buffers["lines"],
    )
    _copy(
        conn,
        "app_events (user_id, session_id, ts, type, vertical, concept_id, entity_type, entity_id, cart_id, query,"
        " modality, results, unmet, value, payload, source)",
        buffers["events"],
    )
    conn.commit()
    log.info("Simulados: %s", counts)
    return counts


def _simulate_user(
    rng, catalog: Catalog, s: UserState, signup: datetime, end: datetime, start: datetime, buffers, counts
):
    day = signup
    while day < end and s.active:
        gap = max(1.0, rng.expovariate(1 / s.cadence))
        day = day + timedelta(days=gap)
        if day >= end:
            break
        ts = day.replace(hour=rng.choice(s.persona.hours), minute=rng.randrange(60))
        _session(rng, catalog, s, ts, start, buffers, counts)
        s.active = rng.random() > _weekly_churn(s, ts) * (gap / 7)


def _session(rng, catalog: Catalog, s: UserState, ts: datetime, start: datetime, buffers, counts) -> None:
    session_id = uuid.UUID(int=rng.getrandbits(128)).hex[:16]
    events = buffers["events"]

    def emit(kind, when, **kw):
        _write(
            events,
            s.user_id,
            session_id,
            _iso(when),
            kind,
            kw.get("vertical"),
            kw.get("concept"),
            kw.get("etype"),
            kw.get("eid"),
            kw.get("cart"),
            kw.get("query"),
            kw.get("modality"),
            kw.get("results"),
            _bool(kw.get("unmet")),
            kw.get("value"),
            "{}",
            "synthetic",
        )
        counts["eventos"] += 1

    emit("app_open", ts)
    clock = ts + timedelta(seconds=rng.randint(5, 40))
    week = (ts - start).days / 7

    wish = _maybe_wish(rng, week)
    if wish:  # un antojo que el catálogo no tiene: búsqueda sin resultado, se va sin comprar
        vertical, text, concept, _, _ = wish
        emit(
            "search",
            clock,
            vertical=vertical,
            concept=concept,
            query=text,
            modality=_modality(rng),
            results=0,
            unmet=True,
        )
        s.recent_unmet.append(ts)
        return

    vertical = _weighted(rng, {v: sum(c.values()) for v, c in s.persona.interests.items()})
    concept = _weighted(rng, s.persona.interests[vertical])
    item = catalog.pick(rng, vertical, concept)
    kind = "chat" if rng.random() < 0.3 else "search"
    emit(
        kind,
        clock,
        vertical=vertical,
        concept=concept,
        query=catalog.names.get(concept, concept).lower(),
        modality=_modality(rng),
        results=0 if item is None else rng.randint(4, 20),
        unmet=item is None,
    )
    if item is None:
        s.recent_unmet.append(ts)
        return
    if rng.random() < BROWSE_ONLY:
        return
    cart_id = uuid.UUID(int=rng.getrandbits(128)).hex[:12]
    lines = []
    for _ in range(1 + int(rng.random() < 0.5) + int(rng.random() < 0.2)):
        item = catalog.pick(rng, vertical, concept) or item
        clock += timedelta(seconds=rng.randint(10, 90))
        emit("view_item", clock, vertical=vertical, concept=concept, etype=item[0], eid=item[1], value=item[2])
        emit(
            "cart_add",
            clock + timedelta(seconds=5),
            vertical=vertical,
            concept=concept,
            etype=item[0],
            eid=item[1],
            cart=cart_id,
            value=item[2],
        )
        lines.append((item, concept, False))

    suggestion = _suggestion(catalog, concept, vertical)
    if suggestion:
        target, sug_vertical, weight = suggestion
        clock += timedelta(seconds=rng.randint(5, 30))
        emit("suggestion_shown", clock, vertical=sug_vertical, concept=target)
        if rng.random() < SUGGESTION_ACCEPT * (0.5 + weight):
            sug_item = catalog.pick(rng, sug_vertical, target)
            emit("suggestion_accepted", clock + timedelta(seconds=4), vertical=sug_vertical, concept=target)
            if sug_item:
                emit(
                    "cart_add",
                    clock + timedelta(seconds=8),
                    vertical=sug_vertical,
                    concept=target,
                    etype=sug_item[0],
                    eid=sug_item[1],
                    cart=cart_id,
                    value=sug_item[2],
                )
                lines.append((sug_item, target, True))
                s.cadence *= SUGGESTION_CADENCE_BOOST
        else:
            emit("suggestion_dismissed", clock + timedelta(seconds=3), vertical=sug_vertical, concept=target)

    clock += timedelta(seconds=rng.randint(20, 120))
    abandon = rng.random() < s.persona.abandon
    if abandon and rng.random() >= CHECKOUT_ABANDON_SHARE:  # se va antes de ir a pagar
        s.recent_abandon.append(ts)
        return
    by_vertical: dict[str, list] = {}
    for line in lines:
        line_vertical = vertical if not line[2] else suggestion[1]
        by_vertical.setdefault(line_vertical, []).append(line)
    for order_vertical in by_vertical:  # un pago por tienda/vertical, antes de saber si termina en pedido
        emit("checkout_start", clock, vertical=order_vertical, cart=cart_id)
    if abandon:  # inició el pago y no lo terminó
        s.recent_abandon.append(ts)
        return
    for order_vertical, order_lines in by_vertical.items():  # un pedido por tienda/vertical
        order_id = f"ord-syn-{uuid.UUID(int=rng.getrandbits(128)).hex[:12]}"
        total = 0.0
        for i, ((etype, eid, price), line_concept, from_suggestion) in enumerate(order_lines, start=1):
            qty = 1 + int(rng.random() < 0.25)
            total += price * qty
            _write(buffers["lines"], order_id, i, etype, eid, line_concept, qty, price, _bool(from_suggestion))
        when = clock + timedelta(seconds=30)
        _write(
            buffers["orders"],
            order_id,
            s.user_id,
            session_id,
            cart_id,
            _iso(when),
            order_vertical,
            round(total),
            "synthetic",
        )
        emit("order_placed", when, vertical=order_vertical, cart=cart_id, value=round(total))
        counts["pedidos"] += 1
        s.orders_by_vertical.setdefault(order_vertical, []).append(ts)


def _weekly_churn(s: UserState, now: datetime) -> float:
    window = now - timedelta(days=28)
    unmet = sum(1 for t in s.recent_unmet if t >= window)
    abandon = sum(1 for t in s.recent_abandon if t >= window)
    recent_verticals = [v for v, ts in s.orders_by_vertical.items() if any(t >= now - timedelta(days=60) for t in ts)]
    risk = s.persona.churn * (1 + CHURN_UNMET * unmet) * (1 + CHURN_ABANDON * abandon)
    return risk * (MULTI_VERTICAL_RETENTION if len(recent_verticals) >= 2 else 1.0)


def _maybe_wish(rng, week: float):
    for wish in WISHES:
        _, _, _, base, growth = wish
        if rng.random() < 0.02 * base * (1 + growth) ** week:
            return wish
    return None


def _suggestion(catalog: Catalog, concept: str, vertical: str):
    """Complemento curado en OTRO vertical con ítems reales: el primero en el orden de Bigotes (`ranked_verticals`,
    donde el concepto es más típico y restaurantes solo para lo que se pide hecho), no uno al azar."""
    for target, weight in sorted(catalog.edges.get(concept, []), key=lambda e: -e[1]):
        verticals = [v for v in catalog.ranked.get(target, []) if v != vertical and (v, target) in catalog.items]
        if verticals:
            return target, verticals[0], weight
    return None


def _weighted(rng, weights: dict[str, float]) -> str:
    keys = list(weights)
    return rng.choices(keys, weights=[weights[k] for k in keys])[0]


def _modality(rng) -> str:
    return rng.choices([m for m, _ in MODALITIES], weights=[w for _, w in MODALITIES])[0]


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _bool(value) -> str | None:
    return None if value is None else ("t" if value else "f")


def _write(buffer: io.StringIO, *values) -> None:
    buffer.write("\t".join("\\N" if v is None else str(v).replace("\t", " ").replace("\n", " ") for v in values) + "\n")


def _copy(conn: Connection, target: str, buffer: io.StringIO) -> None:
    buffer.seek(0)
    with conn.cursor() as cur, cur.copy(f"COPY {target} FROM STDIN") as copy:
        while chunk := buffer.read(1 << 20):
            copy.write(chunk)
