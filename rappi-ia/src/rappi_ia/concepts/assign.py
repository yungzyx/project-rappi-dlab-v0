"""Asigna un concepto a cada producto del catálogo y a cada plato, con procedencia.

Prioridad (la primera que responda gana):
- Producto del catálogo: categoría de Rappi mapeada → reglas sobre el nombre.
- Plato: reglas sobre el nombre del plato → sección del menú mapeada → cocina del restaurante mapeada.

En los platos manda el nombre porque las secciones suelen ser genéricas ("Promociones", "Combos"), salvo que la
regla caiga fuera de lo que vende un restaurante ("Perro caliente" no es alimento para perros): ahí gana la sección
o la cocina mapeada. En los productos manda la categoría porque el nombre trae marcas y ruido ("Fanta Naranja 1,5 L"),
salvo que el nombre calce un concepto sensible y la categoría no (un lubricante en "Agua saborizada"), fuera de
mascotas y juguetes (un analgésico veterinario sigue en mascotas).
"""

from dataclasses import dataclass
from functools import cache

from ..text import tokens
from .matcher import KeywordMatcher
from .taxonomy import Concept, Taxonomy, keeps_sensitive, load_taxonomy

MIN_MAP_CONFIDENCE = 0.6  # bajo esto, el mapeo de categoría se considera dudoso y se prueban las reglas
RULE_CONFIDENCE = 0.7  # confianza de una regla por palabra clave sobre el nombre
MENU_GROUPS = frozenset({"alcohol", "bebidas", "snacks", "dulces", "despensa", "frescos", "comida"})  # lo de un menú
# Grupos cuya categoría manda aunque el nombre calce un sensible: ahí la palabra tiene otro sentido (un analgésico
# veterinario, un insecto vibrador de juguete) y el concepto sensible los ocultaría.
CATEGORY_WINS_GROUPS = frozenset({"mascotas", "juguetes"})


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


def concept_matcher(taxonomy: Taxonomy, for_queries: bool = False) -> KeywordMatcher:
    """`for_queries`: para entender consultas, no para asignar productos. Suma el nombre de los sensibles y sus
    `query_keywords`: «necesito medicamentos» pide medicamentos aunque «Dosificador de medicamentos» no sea uno."""
    return KeywordMatcher(
        (c.id, kw)
        for c in taxonomy.concepts.values()
        for kw in (*_name_keyword(c, for_queries), *c.keywords, *(c.query_keywords if for_queries else ()))
    )


def _name_keyword(concept: Concept, for_queries: bool) -> tuple[str, ...]:
    """El nombre del concepto también es keyword, salvo al asignar el de un sensible de una sola palabra:
    «Dosificador de medicamentos» no es un medicamento."""
    if concept.sensitive and len(tokens(concept.name)) == 1 and not for_queries:
        return ()
    return (concept.name,)


def assign_catalog_item(
    item_id: str, name: str, category: str | None, category_map: dict[str, MappedName], matcher: KeywordMatcher
) -> Assignment | None:
    mapped = category_map.get(_key(category)) if category else None
    rule = _from_rule("catalog_item", item_id, name, matcher)
    # Guardia simétrica: un nombre sensible manda sobre una categoría común (un lubricante en «Agua saborizada»).
    sensitive_name = (
        rule is not None
        and mapped is not None
        and keeps_sensitive(rule.concept_id, mapped.concept_id)
        and mapped.concept_id not in _category_always_wins()
    )
    if mapped and mapped.confidence >= MIN_MAP_CONFIDENCE and not sensitive_name:
        return _from_map("catalog_item", item_id, mapped, f"categoria:{category}")
    if rule and not (mapped and keeps_sensitive(mapped.concept_id, rule.concept_id)):
        return rule
    return _from_map("catalog_item", item_id, mapped, f"categoria:{category}") if mapped else None


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
    if by_name and by_name.concept_id in _name_wins_in_menus():
        return by_name
    return _from_menu_maps(item_id, section, cuisines, section_map, cuisine_map) or by_name


@cache
def _category_always_wins() -> frozenset[str]:
    return frozenset(c.id for c in load_taxonomy().concepts.values() if c.parent in CATEGORY_WINS_GROUPS)


@cache
def _name_wins_in_menus() -> frozenset[str]:
    """Conceptos que el nombre de un plato impone sobre la sección: lo que vende un restaurante y los sensibles
    (un cigarrillo en la sección «Bebidas» no pasa a gaseosas). «Perro», «calzones» o «aros» sueltos ceden."""
    return frozenset(c.id for c in load_taxonomy().concepts.values() if c.parent in MENU_GROUPS or c.sensitive)


def _from_menu_maps(
    item_id: str,
    section: str | None,
    cuisines: list[str],
    section_map: dict[str, MappedName],
    cuisine_map: dict[str, MappedName],
) -> Assignment | None:
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
