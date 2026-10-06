"""Segmentos de usuario por comportamiento. Las reglas son datos (`concepts/segments.toml`): cada una combina piezas
genéricas y el motor no conoce segmentos por nombre.

Una señal (evento) calza una regla si cumple **alguna** pieza de contenido (concepto, grupo, atributo, marca, ocasión,
servicio, palabra de consulta; si la regla no tiene ninguna, basta el contexto) y **todas** las piezas de contexto
(vertical, hora, día, percentil de precio, descuento, tamaño del carro, modalidad, sugerencia, ciudad)."""

import logging
import re
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from rappi_scraper.storage.search import VERTICALS

from ..concepts.taxonomy import load_taxonomy
from .attributes import load_attribute_rules

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
