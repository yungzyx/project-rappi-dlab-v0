"""Registro de eventos de la app (prototipo) y perfil de intereses por concepto.

Privacidad (docs/diseno-ia.md §2): las consultas se guardan con datos personales redactados y se borran a los
90 días; los conceptos sensibles no entran al perfil; "Olvidar" borra los eventos, no solo el perfil.
"""

import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime

from psycopg import Connection
from psycopg.types.json import Jsonb

from ..concepts.taxonomy import load_taxonomy

EVENT_TYPES = {
    "app_open",
    "search",
    "chat",
    "view_store",
    "view_item",
    "cart_add",
    "cart_remove",
    "checkout_start",
    "order_placed",
    "suggestion_shown",
    "suggestion_accepted",
    "suggestion_dismissed",
    "recommendation_click",
}
QUERY_RETENTION_DAYS = 90
HALF_LIFE_DAYS = 14  # el interés se reduce a la mitad cada 2 semanas sin actividad
WEIGHTS = {
    "order_placed": 5.0,
    "cart_add": 3.0,
    "suggestion_accepted": 3.0,
    "view_item": 1.5,
    "view_store": 1.0,
    "search": 1.0,
    "chat": 1.0,
    "recommendation_click": 2.0,
}

_PATTERNS = [
    (re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b"), "[correo]"),
    (re.compile(r"\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]\b"), "[rut]"),
    (re.compile(r"(?:\+?56\s?)?\b9\s?\d{4}\s?\d{4}\b"), "[teléfono]"),
    (re.compile(r"\b(?:calle|av\.?|avenida|pasaje|psje\.?)\s+[\w\sáéíóúñ]+?\s\d{1,5}\b", re.IGNORECASE), "[dirección]"),
]


def redact(text: str | None) -> str | None:
    """Quita correo, RUT, teléfono y direcciones antes de guardar una consulta."""
    if text is None:
        return None
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


@dataclass
class Event:
    user_id: str
    session_id: str
    type: str
    ts: datetime | None = None
    vertical: str | None = None
    concept_id: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    cart_id: str | None = None
    query: str | None = None
    modality: str | None = None
    results: int | None = None
    unmet: bool | None = None
    value: float | None = None
    payload: dict = field(default_factory=dict)


def ensure_user(conn: Connection, user_id: str, source: str = "prototype", **extra) -> None:
    conn.execute(
        """INSERT INTO app_users (user_id, source, segment, city, consent_notifications)
           VALUES (%s, %s, %s, %s, %s) ON CONFLICT (user_id) DO NOTHING""",
        (user_id, source, extra.get("segment"), extra.get("city"), extra.get("consent", False)),
    )


def record(conn: Connection, events: list[Event], source: str = "prototype") -> int:
    """Guarda eventos válidos (tipo conocido, concepto existente) y devuelve cuántos."""
    known = set(load_taxonomy().concepts)
    rows = []
    for e in events:
        if e.type not in EVENT_TYPES:
            raise ValueError(f"Tipo de evento desconocido: {e.type}")
        ensure_user(conn, e.user_id, source)
        rows.append(
            (
                e.user_id,
                e.session_id,
                e.ts,
                e.type,
                e.vertical,
                e.concept_id if e.concept_id in known else None,
                e.entity_type,
                e.entity_id,
                e.cart_id,
                redact(e.query),
                e.modality,
                e.results,
                e.unmet,
                e.value,
                Jsonb(e.payload),
                source,
            )
        )
    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO app_events (user_id, session_id, ts, type, vertical, concept_id, entity_type, entity_id,
                                       cart_id, query, modality, results, unmet, value, payload, source)
               VALUES (%s, %s, coalesce(%s, now()), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            rows,
        )
    return len(rows)


def record_order(
    conn: Connection,
    user_id: str,
    session_id: str,
    cart_id: str,
    vertical: str,
    lines: list[dict],
    source: str = "prototype",
    ts: datetime | None = None,
) -> str:
    """Pedido + líneas (producto o plato) + evento `order_placed`."""
    order_id = f"ord-{uuid.uuid4().hex[:12]}"
    total = sum(float(line.get("unit_price") or 0) * int(line.get("qty", 1)) for line in lines)
    ensure_user(conn, user_id, source)
    conn.execute(
        """INSERT INTO app_orders (order_id, user_id, session_id, cart_id, ts, vertical, total, source)
           VALUES (%s, %s, %s, %s, coalesce(%s, now()), %s, %s, %s)""",
        (order_id, user_id, session_id, cart_id, ts, vertical, total, source),
    )
    known = set(load_taxonomy().concepts)
    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO app_order_lines (order_id, line_no, entity_type, entity_id, concept_id, qty, unit_price,
                                            from_suggestion)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            [
                (
                    order_id,
                    i,
                    line["entity_type"],
                    line["entity_id"],
                    line.get("concept_id") if line.get("concept_id") in known else None,
                    int(line.get("qty", 1)),
                    line.get("unit_price"),
                    bool(line.get("from_suggestion")),
                )
                for i, line in enumerate(lines, start=1)
            ],
        )
    record(
        conn,
        [
            Event(
                user_id,
                session_id,
                "order_placed",
                ts=ts,
                vertical=vertical,
                cart_id=cart_id,
                value=total,
                payload={"order_id": order_id, "lines": len(lines)},
            )
        ],
        source,
    )
    return order_id


def profile(conn: Connection, user_id: str, now: datetime | None = None) -> dict[str, float]:
    """Interés por concepto con decaimiento exponencial (vida media 14 días). Sin conceptos sensibles."""
    sensitive = [c.id for c in load_taxonomy().concepts.values() if c.sensitive]
    rows = conn.execute(
        """SELECT concept_id, type, extract(epoch FROM (coalesce(%(now)s, now()) - ts)) / 86400.0 AS days
           FROM app_events
           WHERE user_id = %(user)s AND concept_id IS NOT NULL AND concept_id <> ALL(%(sensitive)s)""",
        {"now": now, "user": user_id, "sensitive": sensitive},
    ).fetchall()
    scores: dict[str, float] = {}
    for concept_id, event_type, days in rows:
        weight = WEIGHTS.get(event_type, 0.5) * 0.5 ** (max(float(days), 0) / HALF_LIFE_DAYS)
        scores[concept_id] = scores.get(concept_id, 0.0) + weight
    return {c: round(s, 3) for c, s in sorted(scores.items(), key=lambda kv: -kv[1]) if s >= 0.05}


def forget(conn: Connection, user_id: str, concept_id: str | None = None) -> int:
    """'Olvidar': borra los eventos del concepto (o todos los del usuario). No basta con limpiar el perfil."""
    if concept_id:
        return conn.execute(
            "DELETE FROM app_events WHERE user_id = %s AND concept_id = %s", (user_id, concept_id)
        ).rowcount
    return conn.execute("DELETE FROM app_events WHERE user_id = %s", (user_id,)).rowcount


def purge_old_queries(conn: Connection, days: int = QUERY_RETENTION_DAYS) -> int:
    """Borra el texto de consultas más antiguas que `days` (quedan los agregados por concepto)."""
    return conn.execute(
        "UPDATE app_events SET query = NULL WHERE query IS NOT NULL AND ts < now() - make_interval(days => %s)",
        (days,),
    ).rowcount
