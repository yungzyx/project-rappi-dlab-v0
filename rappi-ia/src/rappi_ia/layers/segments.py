"""Segmentos de usuario por comportamiento. Las reglas son datos (`concepts/segments.toml`): cada una combina piezas
genéricas y el motor no conoce segmentos por nombre.

Una señal (evento) calza una regla si cumple **alguna** pieza de contenido (concepto, grupo, atributo, marca, ocasión,
servicio, palabra de consulta; si la regla no tiene ninguna, basta el contexto) y **todas** las piezas de contexto
(vertical, hora, día, percentil de precio, descuento, tamaño del carro, modalidad, sugerencia, ciudad)."""

import logging
import re
import tomllib
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from rappi_scraper.storage.search import VERTICALS

from ..concepts.taxonomy import load_taxonomy
from ..text import normalize
from .attributes import _phrase_key, load_attribute_rules

log = logging.getLogger(__name__)

RULES_FILE = Path(__file__).resolve().parents[1] / "concepts" / "segments.toml"
CONTENT_PIECES = ("concepts", "groups", "attributes", "brands", "occasions", "services", "query_words")
CONTEXT_PIECES = (
    *("verticals", "hours", "weekdays", "days_of_month", "price_percentile", "discount"),
    *("basket_size", "modality", "from_suggestion", "cities"),
)
EVENT_TYPES = frozenset(
    {
        *("app_open", "search", "chat", "view_store", "view_item", "cart_add", "cart_remove", "checkout_start"),
        *("order_placed", "suggestion_shown", "suggestion_accepted", "suggestion_dismissed", "recommendation_click"),
        *("service_shown", "service_opened", "order_line"),
    }
)
# Métricas por persona calculadas aparte (`user_metrics`): lo que no es una suma de eventos que calzan.
METRICS = frozenset(
    {
        *("dias_sin_pedido", "dias_desde_alta", "verticales_distintas", "tasa_abandono", "aceptacion_sugerencias"),
        *("pedidos_90d", "gasto_90d_percentil", "reactivado", "concentracion_marca", "conceptos_distintos_90d"),
        "ticket_creciente",
    }
)
FAMILIES = (
    *("dieta", "comida", "dulces", "bebidas", "hogar", "cuidado", "intereses"),
    *("momentos", "valor", "relacion", "servicios", "geografia"),
)
LEVELS = ("bajo", "medio", "alto")
MODALITIES = frozenset({"texto", "voz", "foto"})
# Se nombran por lo que la persona compra, nunca por la condición que se les supone; las vistas `capa` no exponen
# sus filas por usuario y sus agregados exigen k ≥ 5.
SENSITIVE_SEGMENTS = frozenset(
    {
        *("compra-sin-gluten", "compra-sin-lactosa", "compra-sin-azucar", "bajo-sodio", "alergia-frutos-secos"),
        *("mama-papa-bebe", "embarazo", "adulto-mayor", "salud-sexual", "farmacia-frecuente", "cuidado-cronico"),
        *("tabaco", "vapeo"),
    }
)
_SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
_LIST_PIECES = ("concepts", "groups", "attributes", "brands", "occasions", "services", "query_words", "verticals")
_LIST_PIECES += ("modality", "cities")
_BASKET_KEYS = {"gte_items", "lte_items", "gte_amount"}


@dataclass(frozen=True)
class SegmentRule:
    id: str
    name: str
    family: str
    sensitive: bool
    description: str
    signals: dict
    events: dict[str, float]
    window_days: int
    half_life_days: float
    min_signals: int
    levels: dict[str, float]
    exclude: dict = field(default_factory=dict)
    metric: dict | None = None


def load_segment_rules(path: Path | None = None) -> tuple[str, list[SegmentRule]]:
    raw = tomllib.loads((path or RULES_FILE).read_text(encoding="utf-8"))
    defaults = raw.get("defaults", {})
    rules, seen = [], set()
    for entry in raw["segment"]:
        merged = {**defaults, **entry}
        rule = _build(merged)
        if rule.id in seen:
            raise ValueError(f"Segmento {rule.id}: id repetido")
        seen.add(rule.id)
        rules.append(rule)
    return raw["version"], rules


def _build(entry: dict) -> SegmentRule:
    seg = entry.get("id", "?")

    def fail(message: str):
        raise ValueError(f"Segmento {seg}: {message}")

    for key in ("id", "name", "family", "description", "window_days", "half_life_days", "min_signals", "levels"):
        if key not in entry:
            fail(f"falta `{key}`")
    if not _SLUG.match(seg):
        fail("el id debe ser un slug (minúsculas, números y guiones)")
    if entry["family"] not in FAMILIES:
        fail(f"familia desconocida `{entry['family']}`")
    signals, exclude, metric = entry.get("signals", {}), entry.get("exclude", {}), entry.get("metric")
    if bool(signals) == bool(metric):
        fail("debe tener `signals` o `metric`, y solo uno")
    _check_pieces(signals, fail, "signals")
    _check_pieces(exclude, fail, "exclude")
    events = {k: float(v) for k, v in entry.get("events", {}).items()}
    if signals and not events:
        fail("una regla con `signals` necesita `events`")
    if unknown := set(events) - EVENT_TYPES:
        fail(f"eventos desconocidos {sorted(unknown)}")
    if any(w <= 0 for w in events.values()):
        fail("el peso de un evento debe ser positivo")
    if metric is not None:
        _check_metric(metric, fail)
    levels = entry["levels"]
    values = [levels.get(level) for level in LEVELS]
    if list(levels) != list(LEVELS) or None in values:
        fail(f"`levels` debe traer {', '.join(LEVELS)} en ese orden")
    if values[0] <= 0 or values != sorted(set(values)):
        fail("`levels` debe ser positivo y estrictamente creciente")
    if int(entry["min_signals"]) < 1 or int(entry["window_days"]) < 1 or float(entry["half_life_days"]) <= 0:
        fail("min_signals y window_days deben ser ≥ 1 y half_life_days > 0")
    return SegmentRule(
        id=seg,
        name=entry["name"],
        family=entry["family"],
        sensitive=bool(entry.get("sensitive", False)),
        description=entry["description"],
        signals=signals,
        events=events,
        window_days=int(entry["window_days"]),
        half_life_days=float(entry["half_life_days"]),
        min_signals=int(entry["min_signals"]),
        levels={level: float(levels[level]) for level in LEVELS},
        exclude=exclude,
        metric=metric,
    )


def _check_pieces(pieces: dict, fail, where: str) -> None:
    taxonomy = load_taxonomy()
    attributes = {a.attribute_id for a in load_attribute_rules()[1]}
    if unknown := set(pieces) - {*CONTENT_PIECES, *CONTEXT_PIECES}:
        fail(f"`{where}` con piezas desconocidas {sorted(unknown)}")
    for key in _LIST_PIECES:
        if key in pieces and (not isinstance(pieces[key], list) or not pieces[key]):
            fail(f"`{where}.{key}` debe ser una lista no vacía")
    known = {
        "concepts": set(taxonomy.concepts),
        "groups": set(taxonomy.groups),
        "attributes": attributes,
        "occasions": set(taxonomy.occasions),
        "services": set(taxonomy.services),
        "verticals": set(VERTICALS),
        "modality": MODALITIES,
    }
    for key, valid in known.items():
        if missing := [v for v in pieces.get(key, ()) if v not in valid]:
            fail(f"`{where}.{key}` nombra algo que no existe: {missing}")
    if "hours" in pieces:
        hours = pieces["hours"]
        if not (
            isinstance(hours, list) and len(hours) == 2 and all(isinstance(h, int) and 0 <= h <= 23 for h in hours)
        ):
            fail(f"`{where}.hours` debe ser [desde, hasta] con horas de 0 a 23")
    for key, low, high in (("weekdays", 1, 7), ("days_of_month", 1, 31)):
        if key in pieces and not (
            isinstance(pieces[key], list)
            and pieces[key]
            and all(isinstance(d, int) and low <= d <= high for d in pieces[key])
        ):
            fail(f"`{where}.{key}` debe ser una lista de enteros entre {low} y {high}")
    if "price_percentile" in pieces:
        pp = pieces["price_percentile"]
        if not (isinstance(pp, dict) and pp and set(pp) <= {"gte", "lte"} and all(0 <= v <= 1 for v in pp.values())):
            fail(f"`{where}.price_percentile` debe ser {{ gte|lte = 0..1 }}")
    if "basket_size" in pieces:
        bs = pieces["basket_size"]
        if not (isinstance(bs, dict) and bs and set(bs) <= _BASKET_KEYS and all(v > 0 for v in bs.values())):
            fail(f"`{where}.basket_size` debe usar {sorted(_BASKET_KEYS)} con valores positivos")
    for key in ("discount", "from_suggestion"):
        if key in pieces and not isinstance(pieces[key], bool):
            fail(f"`{where}.{key}` debe ser true o false")


def _check_metric(metric: dict, fail) -> None:
    if metric.get("name") not in METRICS:
        fail(f"métrica desconocida `{metric.get('name')}`")
    if not ({"min", "max"} & set(metric)) or set(metric) - {"name", "min", "max"}:
        fail("`metric` es { name, min?, max? } con al menos un límite")
    if "min" in metric and "max" in metric and metric["min"] >= metric["max"]:
        fail("`metric.min` debe ser menor que `metric.max`")


@dataclass(frozen=True)
class Signal:
    """Un evento de una persona con lo que se sabe de su ítem: lo único que el motor mira."""

    ts: datetime
    type: str  # tipo de app_events o `order_line`
    concept: str | None
    group: str | None
    attributes: frozenset[str]
    vertical: str | None
    brand: str | None
    query: str | None
    modality: str | None
    price_percentile: float | None  # posición del precio entre los ítems de su concepto (0 a 1)
    discounted: bool
    basket_items: int | None
    basket_total: float | None
    from_suggestion: bool
    event_key: str  # identifica el evento: dos filas con la misma clave cuentan una sola vez
    city: str | None = None
    service: str | None = None


@dataclass(frozen=True)
class Membership:
    segment_id: str
    score: float
    level: str
    signals: int
    evidence: dict
    first_seen: datetime | None
    last_signal: datetime | None


def score_user(
    signals: list[Signal], metrics: dict[str, float], rules: list[SegmentRule], now: datetime
) -> list[Membership]:
    """Los segmentos de una persona. Puntaje = Σ peso(evento) × 0,5^(edad / vida media) sobre las señales de la
    ventana que calzan la regla y ninguna exclusión; sin `min_signals` señales distintas o bajo el primer umbral no
    hay segmento. Una regla con `metric` ignora los eventos: el valor de la métrica, en [min, max), decide."""
    found = []
    for rule in rules:
        member = _by_metric(rule, metrics) if rule.metric else _by_signals(rule, signals, now)
        if member:
            found.append(member)
    return found


def _level(rule: SegmentRule, score: float) -> str | None:
    reached = [level for level in LEVELS if score >= rule.levels[level]]
    return reached[-1] if reached else None


def _by_metric(rule: SegmentRule, metrics: dict[str, float]) -> Membership | None:
    value = metrics.get(rule.metric["name"])
    if value is None or value < rule.metric.get("min", float("-inf")) or value >= rule.metric.get("max", float("inf")):
        return None
    return Membership(
        rule.id, value, _level(rule, value) or LEVELS[0], 0, {"metric": rule.metric["name"], "value": value}, None, None
    )


def _by_signals(rule: SegmentRule, signals: list[Signal], now: datetime) -> Membership | None:
    window = rule.window_days * 86400
    taxonomy = load_taxonomy()
    counted: dict[str, tuple[Signal, float]] = {}
    for signal in signals:
        age = max(0.0, (now - signal.ts).total_seconds())
        weight = rule.events.get(signal.type)
        if weight is None or age > window or signal.event_key in counted:
            continue
        if not _matches(signal, rule.signals, taxonomy) or (rule.exclude and _matches(signal, rule.exclude, taxonomy)):
            continue
        counted[signal.event_key] = (signal, weight * 0.5 ** (age / 86400 / rule.half_life_days))
    if len(counted) < rule.min_signals:
        return None
    score = sum(points for _signal, points in counted.values())
    level = _level(rule, score)
    if level is None:
        return None
    seen = [signal.ts for signal, _points in counted.values()]
    return Membership(rule.id, score, level, len(counted), _evidence(rule, counted.values()), min(seen), max(seen))


def _evidence(rule: SegmentRule, counted) -> dict:
    """Los 3 conceptos o atributos que más aportan al puntaje."""
    by_item: dict[tuple[str, str], float] = defaultdict(float)
    named = set(rule.signals.get("attributes", ()))
    for signal, points in counted:
        if signal.concept:
            by_item[("concepto", signal.concept)] += points
        for attribute in signal.attributes & named:
            by_item[("atributo", attribute)] += points
    top = sorted(by_item.items(), key=lambda item: (-item[1], item[0]))[:3]
    return {"top": [{"kind": kind, "id": ident, "score": round(points, 3)} for (kind, ident), points in top]}


def _matches(signal: Signal, pieces: dict, taxonomy) -> bool:
    """Alguna pieza de contenido (si la regla trae) y todas las de contexto."""
    content = [key for key in CONTENT_PIECES if key in pieces]
    if content and not any(_content_hit(signal, key, pieces[key], taxonomy) for key in content):
        return False
    return all(_context_hit(signal, key, pieces[key]) for key in CONTEXT_PIECES if key in pieces)


def _content_hit(signal: Signal, key: str, wanted: list[str], taxonomy) -> bool:
    if key == "concepts":
        return signal.concept in wanted
    if key == "groups":
        return signal.group in wanted
    if key == "attributes":
        return bool(signal.attributes & set(wanted))
    if key == "brands":
        return signal.brand in wanted
    if key == "services":
        return signal.service in wanted
    if key == "occasions":
        return any(signal.concept in taxonomy.occasions[o].concepts for o in wanted)
    return signal.query is not None and any(_has_phrase(signal.query, phrase) for phrase in wanted)


def _has_phrase(text: str, phrase: str) -> bool:
    words, target = [_phrase_key(w)[0] for w in normalize(text).split()], _phrase_key(phrase)
    return any(tuple(words[i : i + len(target)]) == target for i in range(len(words) - len(target) + 1))


def _context_hit(signal: Signal, key: str, wanted) -> bool:
    if key == "verticals":
        return signal.vertical in wanted
    if key == "cities":
        return signal.city in wanted
    if key == "modality":
        return signal.modality in wanted
    if key == "hours":
        start, end = wanted
        hour = signal.ts.hour
        return start <= hour <= end if start <= end else hour >= start or hour <= end
    if key == "weekdays":
        return signal.ts.isoweekday() in wanted
    if key == "days_of_month":
        return signal.ts.day in wanted
    if key == "discount":
        return signal.discounted == wanted
    if key == "from_suggestion":
        return signal.from_suggestion == wanted
    if key == "price_percentile":
        value = signal.price_percentile
        return value is not None and value >= wanted.get("gte", 0) and value <= wanted.get("lte", 1)
    items, total = signal.basket_items, signal.basket_total  # basket_size
    return (
        ("gte_items" not in wanted or (items is not None and items >= wanted["gte_items"]))
        and ("lte_items" not in wanted or (items is not None and items <= wanted["lte_items"]))
        and ("gte_amount" not in wanted or (total is not None and total >= wanted["gte_amount"]))
    )
