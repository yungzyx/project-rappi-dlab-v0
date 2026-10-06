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

from dataclasses import dataclass, replace
from functools import cache

from ..text import FILLER_WORDS, tokens
from .matcher import KeywordMatcher, Match
from .taxonomy import Concept, Taxonomy, keeps_sensitive, load_taxonomy

MIN_MAP_CONFIDENCE = 0.6  # bajo esto, el mapeo de categoría se considera dudoso y se prueban las reglas
RULE_CONFIDENCE = 0.7  # confianza de una regla por palabra clave sobre el nombre
# Lo que un nombre de plato impone sobre su sección. Sin «frescos»: un ingrediente en el nombre («Mechada palta mayo»,
# «Phad Kee Maoo Vacuno») no dice qué plato es; la sección sí (juicio de precisión del 06-10-2026).
MENU_GROUPS = frozenset({"alcohol", "bebidas", "snacks", "dulces", "despensa", "comida"})
# La cocina del local es la pista más débil: solo cuenta con un mapeo muy confiable (Sushi → sushi). Con mapeos
# dudosos (Americana → pizza, Asiática → sushi) acertaba el 62 %.
CUISINE_MIN_CONFIDENCE = 0.85
# Un plato no es el ingrediente crudo que nombra («Macarrón Frutilla», «Papas Familiar», «Queso» en Empanadas): por el
# nombre acertaban 1 de cada 3. Los que nombran la proteína (pescados, pollo, carnes) sí se quedan.
INGREDIENT_CONCEPTS = frozenset({"frutas", "verduras", "lacteos", "quesos", "fiambres", "huevos"})
PROTEIN_CONCEPTS = frozenset({"pollo", "pescados-mariscos"})
# Grupos cuya categoría manda aunque el nombre calce un sensible: ahí la palabra tiene otro sentido (un analgésico
# veterinario, un insecto vibrador de juguete) y el concepto sensible los ocultaría.
CATEGORY_WINS_GROUPS = frozenset({"mascotas", "juguetes"})
# La categoría «Cigarrillos» de las tabaquerías de Rappi Mall trae también vapers, líquidos y papelillos. Dentro de
# ella (y solo ahí: «Cereal Puffs» no es un vaper) estas palabras del nombre deciden el concepto.
TOBACCONIST = KeywordMatcher(
    [
        *(("vapeo", kw) for kw in ("puff", "puffs", "e-liquid", "eliquid", "vape", "vaper", "vaporizador", "pod")),
        *(("vapeo", kw) for kw in ("sales de nicotina", "nic salt", "desechable")),
        *(("accesorios-fumador", kw) for kw in ("wrap", "blunt", "papelillo", "papel", "filtro", "boquilla")),
        *(("accesorios-fumador", kw) for kw in ("tabaquera", "grinder", "moledor", "cenicero", "encendedor", "pipa")),
    ]
)


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


def concept_matcher(taxonomy: Taxonomy, for_queries: bool = False) -> "KeywordMatcher | QueryMatcher":
    """`for_queries`: para entender consultas, no para asignar productos. Suma el nombre de los sensibles y sus
    `query_keywords`: «necesito medicamentos» pide medicamentos aunque «Dosificador de medicamentos» no sea uno."""
    entries = [
        (c.id, kw)
        for c in taxonomy.concepts.values()
        for kw in (*_name_keyword(c, for_queries), *c.keywords, *(c.query_keywords if for_queries else ()))
    ]
    avoid = [(c.id, word) for c in taxonomy.concepts.values() for word in c.avoid]
    if not for_queries:
        return KeywordMatcher(entries, avoid)
    alone = [(c.id, kw) for c in taxonomy.concepts.values() for kw in _query_only_words(c)]
    return QueryMatcher(KeywordMatcher((e for e in entries if e not in alone), avoid), KeywordMatcher(alone))


# Acompañan un pedido sin nombrar otra cosa («venden los medicamentos», «algún lubricante barato»).
_NOT_CONTENT = FILLER_WORDS | {
    *("el", "la", "los", "las", "de", "del", "y", "o"),
    *("algo", "algun", "alguna", "algunos", "algunas"),
    *("vende", "venden"),
    *("barato", "barata", "baratos", "baratas"),
}


class QueryMatcher:
    """Las palabras sueltas que solo sirven para pedir un sensible («medicamentos», «lubricante») cuentan solo si son
    todo el pedido, sin contar saludo, cortesía, verbos de pedido ni artículos. Con otras palabras son un complemento
    («pastillero para medicamentos», «lubricante wd-40») y el foco en el sensible ocultaba lo pedido."""

    def __init__(self, matcher: KeywordMatcher, alone: KeywordMatcher):
        self._matcher = matcher
        self._alone = alone

    def matches(self, text: str) -> list[Match]:
        found = self._matcher.matches(text)
        words = tokens(text)
        content = [i for i, word in enumerate(words) if word not in _NOT_CONTENT]
        if found or len(content) != 1:
            return found
        match = self._alone.best(words[content[0]])
        return [replace(match, position=content[0])] if match else []

    def best(self, text: str) -> Match | None:
        found = self.matches(text)
        return found[0] if found else None


def _query_only_words(concept: Concept) -> list[str]:
    """Palabras sueltas que no asignan productos y sirven para pedirlo: el nombre de un sensible de una palabra y sus
    `query_keywords` de una palabra («lubricante»; «lubricante ocular» es una frase y calza en cualquier parte)."""
    name = [] if _name_keyword(concept, for_queries=False) else [concept.name]
    return [kw for kw in (*name, *concept.query_keywords) if len(tokens(kw)) == 1]


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
        split = TOBACCONIST.best(name) if mapped.concept_id == "cigarrillos" else None
        if split:
            return Assignment(
                "catalog_item", item_id, split.target, "regla", RULE_CONFIDENCE, None, f"nombre:{split.keyword}"
            )
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
    if by_name and by_name.concept_id in INGREDIENT_CONCEPTS:
        by_name = None
    if by_name and by_name.concept_id in name_wins_in_menus():
        return by_name
    mapped = _from_menu_maps(item_id, section, cuisines, section_map, cuisine_map, CUISINE_MIN_CONFIDENCE)
    if mapped:
        return mapped
    if by_name and by_name.concept_id in _food_concepts():
        return by_name
    by_section = _from_section_name(item_id, section, matcher)
    if by_section or by_name is None:
        return by_section
    # Un nombre que no es comida («Aros de Calamar» → joyería) en un local de cocina conocida: la cocina, aunque sea
    # una pista dudosa, acierta más que la palabra suelta.
    return _from_menu_maps(item_id, None, cuisines, {}, cuisine_map, MIN_MAP_CONFIDENCE) or by_name


def _from_section_name(item_id: str, section: str | None, matcher: KeywordMatcher) -> Assignment | None:
    """Una sección sin mapeo que nombra un plato («Empanadas de Horno», «Pizzas Familiares») dice qué son sus platos."""
    match = matcher.best(section) if section else None
    if match is None or match.target not in _food_concepts() or match.target in INGREDIENT_CONCEPTS:
        return None
    return Assignment("menu_item", item_id, match.target, "regla", RULE_CONFIDENCE, None, f"seccion-nombre:{section}")


@cache
def _category_always_wins() -> frozenset[str]:
    return frozenset(c.id for c in load_taxonomy().concepts.values() if c.parent in CATEGORY_WINS_GROUPS)


@cache
def _food_concepts() -> frozenset[str]:
    return frozenset(c.id for c in load_taxonomy().concepts.values() if c.parent in MENU_GROUPS | {"frescos"})


@cache
def dish_name_concepts() -> frozenset[str]:
    """Conceptos que el nombre de un plato fija aunque los vecinos digan otra cosa: un plato preparado («Pollo asado
    + Bebida») o su proteína («Pescado frito»). Un sabor («Pistacho» en una heladería) no: ahí los vecinos corrigen."""
    return frozenset(c.id for c in load_taxonomy().concepts.values() if c.parent == "comida") | PROTEIN_CONCEPTS


@cache
def name_wins_in_menus() -> frozenset[str]:
    """Conceptos que el nombre de un plato impone sobre la sección: lo que vende un restaurante, la proteína del plato
    («Combo pollo para 1» no es sushi aunque la sección «Combos» lo diga) y los sensibles."""
    return (
        frozenset(c.id for c in load_taxonomy().concepts.values() if c.parent in MENU_GROUPS or c.sensitive)
        | PROTEIN_CONCEPTS
    )


def _from_menu_maps(
    item_id: str,
    section: str | None,
    cuisines: list[str],
    section_map: dict[str, MappedName],
    cuisine_map: dict[str, MappedName],
    cuisine_min: float,
) -> Assignment | None:
    mapped = section_map.get(_key(section)) if section else None
    if mapped and mapped.confidence >= MIN_MAP_CONFIDENCE:
        return _from_map("menu_item", item_id, mapped, f"seccion:{section}")
    for cuisine in cuisines:
        mapped = cuisine_map.get(_key(cuisine))
        if mapped and mapped.confidence >= cuisine_min:
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
