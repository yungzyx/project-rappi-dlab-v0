"""Asigna un concepto a cada producto del catálogo y a cada plato, con procedencia.

Prioridad (la primera que responda gana):
- Producto del catálogo: categoría de Rappi mapeada → reglas sobre el nombre.
- Plato: reglas sobre el nombre del plato → sección del menú mapeada → cocina del restaurante mapeada.

En los platos manda el nombre porque las secciones suelen ser genéricas ("Promociones", "Combos");
en los productos manda la categoría porque el nombre trae marcas y ruido ("Fanta Naranja 1,5 L").
"""

from dataclasses import dataclass

from .matcher import KeywordMatcher
from .taxonomy import Taxonomy

MIN_MAP_CONFIDENCE = 0.6  # bajo esto, el mapeo de categoría se considera dudoso y se prueban las reglas
RULE_CONFIDENCE = 0.7  # confianza de una regla por palabra clave sobre el nombre


@dataclass(frozen=True)
class MappedName:
    concept_id: str
    method: str
    confidence: float
    model_version: str | None = None


@dataclass(frozen=True)
class Assignment:
    entity_type: str
    entity_id: str
    concept_id: str
    method: str
    confidence: float
    model_version: str | None
    source: str


def concept_matcher(taxonomy: Taxonomy) -> KeywordMatcher:
    return KeywordMatcher((c.id, kw) for c in taxonomy.concepts.values() for kw in (c.name, *c.keywords))


def assign_catalog_item(
    item_id: str, name: str, category: str | None, category_map: dict[str, MappedName], matcher: KeywordMatcher
) -> Assignment | None:
    mapped = category_map.get(_key(category)) if category else None
    if mapped and mapped.confidence >= MIN_MAP_CONFIDENCE:
        return _from_map("catalog_item", item_id, mapped, f"categoria:{category}")
    return _from_rule("catalog_item", item_id, name, matcher) or (
        _from_map("catalog_item", item_id, mapped, f"categoria:{category}") if mapped else None
    )


def assign_menu_item(
    item_id: str,
    name: str,
    section: str | None,
    cuisines: list[str],
    section_map: dict[str, MappedName],
    cuisine_map: dict[str, MappedName],
    matcher: KeywordMatcher,
) -> Assignment | None:
    by_name = _from_rule("menu_item", item_id, name, matcher)
    if by_name:
        return by_name
    mapped = section_map.get(_key(section)) if section else None
    if mapped and mapped.confidence >= MIN_MAP_CONFIDENCE:
        return _from_map("menu_item", item_id, mapped, f"seccion:{section}")
    for cuisine in cuisines:
        mapped = cuisine_map.get(_key(cuisine))
        if mapped and mapped.confidence >= MIN_MAP_CONFIDENCE:
            # La cocina solo dice qué tipo de local es: menos confianza que la sección o el nombre.
            return _from_map("menu_item", item_id, mapped, f"cocina:{cuisine}", factor=0.8)
    return None


def _key(name: str | None) -> str:
    return (name or "").strip().lower()


def _from_map(entity_type: str, entity_id: str, mapped: MappedName, source: str, factor: float = 1.0) -> Assignment:
    return Assignment(
        entity_type,
        entity_id,
        mapped.concept_id,
        mapped.method,
        round(mapped.confidence * factor, 3),
        mapped.model_version,
        source,
    )


def _from_rule(entity_type: str, entity_id: str, name: str, matcher: KeywordMatcher) -> Assignment | None:
    match = matcher.best(name)
    if match is None:
        return None
    return Assignment(entity_type, entity_id, match.target, "regla", RULE_CONFIDENCE, None, f"nombre:{match.keyword}")
