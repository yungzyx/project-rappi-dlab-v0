"""Atributos de ítem (sin gluten, vegano, familiar…): lo que Rappi declara, lo que dicen el nombre y la descripción,
y lo derivado de precios y marcas. Las reglas viven en `concepts/attributes.toml`."""

import tomllib
from dataclasses import dataclass
from pathlib import Path

from ..concepts.matcher import KeywordMatcher
from ..text import LEAFLET_WARNINGS, normalize

RULES_FILE = Path(__file__).resolve().parents[1] / "concepts" / "attributes.toml"
RAPPI_CONFIDENCE = 0.95
RULE_CONFIDENCE = 0.8
FAMILIES = {"dieta", "alergenos", "publico", "formato", "precio", "origen", "sustentable", "ocasion", "platos"}
_TRUE = {"true", "si", "sí", "yes", "1"}


@dataclass(frozen=True)
class AttributeRule:
    attribute_id: str
    name: str
    family: str
    applies_to: str  # catalog_item | menu_item | both
    value_type: str
    description: str
    rappi: tuple[dict, ...] = ()
    phrases: tuple[str, ...] = ()
    negations: tuple[str, ...] = ()
    derived: bool = False

    def applies(self, entity_type: str) -> bool:
        return self.applies_to in ("both", entity_type)


@dataclass(frozen=True)
class Detected:
    attribute_id: str
    value: str | None
    source: str
    confidence: float
    evidence: str


def load_attribute_rules(path: Path | None = None) -> tuple[str, list[AttributeRule]]:
    raw = tomllib.loads((path or RULES_FILE).read_text(encoding="utf-8"))
    rules = [
        AttributeRule(
            attribute_id=a["id"],
            name=a["name"],
            family=a["family"],
            applies_to=a["applies_to"],
            value_type=a.get("value_type", "flag"),
            description=a.get("description", ""),
            rappi=tuple(a.get("rappi", ())),
            phrases=tuple(a.get("phrases", ())),
            negations=tuple(a.get("negations", ())),
            derived=a.get("derived", False),
        )
        for a in raw["attribute"]
    ]
    return raw["version"], rules


class _Detector:
    """Los matchers se arman una vez por juego de reglas."""

    def __init__(self, rules: list[AttributeRule]):
        self.rules = [r for r in rules if not r.derived]
        self.phrases = KeywordMatcher((r.attribute_id, p) for r in self.rules for p in r.phrases)
        self.negations = KeywordMatcher((r.attribute_id, n) for r in self.rules for n in r.negations)
        self.by_id = {r.attribute_id: r for r in self.rules}


_CACHE: dict[int, _Detector] = {}


def _detector(rules: list[AttributeRule]) -> _Detector:
    key = id(rules)
    if key not in _CACHE:
        _CACHE.clear()
        _CACHE[key] = _Detector(rules)
    return _CACHE[key]


def _rappi_says(rule: AttributeRule, rappi: dict) -> tuple[str | None, bool]:
    """(campo que lo dice, bloqueado): un `false` explícito de Rappi en una bandera bloquea las frases."""
    blocked = False
    for spec in rule.rappi:
        values = spec.get("values")
        for key in spec["keys"]:
            if key not in rappi:
                continue
            value = rappi[key]
            if values:
                if str(value).strip().lower() in {v.lower() for v in values}:
                    return key, False
            elif values is not None:  # `values = []`: basta con que el campo traiga algo
                if value not in (None, "", False):
                    return key, False
            elif value is True or str(value).strip().lower() in _TRUE:
                return key, False
            elif value is False or str(value).strip().lower() in ("false", "no", "0"):
                blocked = True
    return None, blocked


def detect_attributes(
    entity_type: str,
    name: str,
    category: str | None,
    description: str | None,
    rappi: dict | None,
    rules: list[AttributeRule],
) -> list[Detected]:
    detector = _detector(rules)
    rappi = rappi or {}
    head = description or ""
    if m := LEAFLET_WARNINGS.search(normalize(head)):
        head = normalize(head)[: m.start()]
    text = ". ".join(part for part in (name, category, head) if part)
    phrase_hits = {m.target: m.keyword for m in detector.phrases.matches(text)}
    negated = {m.target for m in detector.negations.matches(text)}
    found = []
    for rule in detector.rules:
        if not rule.applies(entity_type):
            continue
        key, blocked = _rappi_says(rule, rappi)
        if key is not None:
            found.append(Detected(rule.attribute_id, None, "rappi", RAPPI_CONFIDENCE, key))
        elif not blocked and rule.attribute_id in phrase_hits and rule.attribute_id not in negated:
            found.append(Detected(rule.attribute_id, None, "regla", RULE_CONFIDENCE, phrase_hits[rule.attribute_id]))
    return found
