"""Guardias de ofertas: lo que el agente nunca propone por su cuenta.

Una oferta es todo lo que el agente muestra sin que se lo hayan pedido: la sugerencia cruzada de /agent/ask y de
/recommendations (`suggest_complement`), los ganchos de servicios y los momentos de /agent/offer. Nunca es:
- alcohol (Licores y todo concepto +18), ni tabaco, vapeo o bienestar sexual;
- salud o farmacia: el grupo «Farmacia y cuidado personal» entero (medicamentos, vitaminas, higiene, dermocosmética);
- bebé (también un producto del catálogo cuyo nombre lo dice, aunque su concepto sea corriente);
- un concepto sensible;
- un producto de las verticales Farmacia y Licores, ni de una tienda que Rappi rotula Farmacia, Sex shop o Smoking
  shop (aunque esté en otra vertical).

Quien lo pide por su nombre (una búsqueda, una pregunta al agente) sí lo recibe: las guardias son de lo que se ofrece,
no de lo que se encuentra. La única excepción es el kit de una ocasión que la persona eligió (`plan` de /agent/offer):
puede traer el alcohol de esa ocasión, con su marca +18 (`is_plannable`), pero nunca lo sensible, farmacia, bebé
ni salud.
Esto reemplaza a docs/diseno-ia.md regla 6b, que permitía el alcohol como complemento con +18.
Las reglas viven solo aquí; las consultas de productos las aplican con `search_products(..., offer=True)`.
"""

from ..concepts.matcher import KeywordMatcher
from ..concepts.taxonomy import Concept, Occasion, load_taxonomy

OFFER_BLOCKED_GROUPS = ("bebe", "salud")  # grupos de taxonomy.toml; el alcohol y el tabaco se bloquean por sus marcas
# Parecida a catalog.stores.NOT_PUSHED_VERTICALS (lo que la Home no empuja), pero con otro motivo y otra lista.
OFFER_BLOCKED_VERTICALS = ("farmacia", "licores")
ALCOHOL_VERTICALS = ("licores",)  # las bloqueadas de las que el alcohol de un kit elegido sí puede salir
NOT_PLANNABLE_OCCASIONS = ("guagua", "enfermo")  # bebé y salud: ni siquiera como kit que la persona pide
# Palabras de un nombre que dicen alcohol aunque la tienda no lo marque: las marcas de la tienda (`is_alcoholic`,
# `age_restricted`) y la categoría pueden estar mal. En la base real del 14-10-2026, «Soju Uva Verde 13.0» venía en
# «Frutas» sin ninguna marca, y una cerveza, un ron y un vino tinto quedaban en frutas, decoración y útiles. Palabra
# entera, con su plural: «ron» no está en «ronda» ni «gin» en «ginger». Es la lista de los productos del catálogo; los
# platos tienen la suya (abajo). Bloquea también lo que solo nombra el alcohol (vinagre de vino, copas de vino,
# galletas Vino): de una oferta que nadie pidió, sobra; quien lo busca por su nombre lo sigue encontrando.
ALCOHOL_NAME_WORDS = frozenset(
    {
        *("soju", "makgeolli", "umeshu", "sake", "cerveza", "vino", "whisky", "pisco", "ron", "vodka", "gin"),
        *("tequila", "licor", "aperitivo", "espumante", "champagne", "sidra"),
    }
)
_ALCOHOL_NAMES = KeywordMatcher(("alcohol", word) for word in ALCOHOL_NAME_WORDS)
# Lo mismo en los platos de un menú, que no traen ninguna marca de alcohol: en la base real del 14-10-2026 cinco
# «Soju …» venían con concepto `asiatica` y dos «Sangría» con `gaseosas`. Lista propia porque en un menú «sake» es
# salmón («Sake Roll», más de 2.400 platos de sushi) y los tragos tienen otros nombres (schop, chela, piscola,
# terremoto, sour, las cervezas por su marca y los vinos por su cepa). También bloquea platos que solo nombran el
# alcohol («bife al vino», «pasas al ron», «Churrasco Kunstmann», un helado «Borgoña»): en una oferta, sobran; la
# búsqueda y la pregunta no cambian. «austral» no está: es sobre todo merluza austral (47 platos), y la cerveza sale
# por su sección. «mimosa» tampoco: en la base real del 14-10-2026 las dos que hay son sin alcohol (un jugo y una de
# «Sin Alcohol»).
MENU_ALCOHOL_NAME_WORDS = frozenset(
    {
        *("soju", "sangria", "michelada", "cerveza", "schop", "shop", "chela", "chelada", "vino", "pisco", "piscola"),
        *("vodka", "whisky", "whiskey", "tequila", "ron", "gin", "mojito", "margarita", "terremoto", "spritz"),
        *("makgeolli", "makgeoli", "umeshu", "licor", "espumante", "champagne", "champana", "sidra", "negroni"),
        *("caipirinha", "caipirina", "daiquiri", "sour", "borgona", "pina colada"),
        *("corona", "escudo", "guinness", "kunstmann", "heineken", "cristal", "stella artois"),
        *("budweiser", "cusquena"),
        *("cabernet", "carmenere", "merlot", "chardonnay", "sauvignon", "syrah", "malbec", "pinot", "cono sur"),
    }
)
# Palabras de trago que también nombran comida: (lo que en el nombre dice que es comida, conceptos de plato que lo
# dicen). «Pizza Margarita» y la «Margarita Familiar» de una pizzería (concepto pizza) son pizzas; «Sour Cream», «Sweet
# and Sour Roll», la «Sopa Hot Sour» y un roll «Tako Sour» no son un pisco sour; «Hamburguesa la Corona» y las
# quesadillas «Corona Sacra» no son la cerveza; Negroni es también un salame y «cristal», un latte. Una piña colada es
# también un jugo, un batido, un té de burbujas o un helado (10 de las 27 de la base real).
_MENU_FOOD_SENSES: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "margarita": (("pizza", "pizzeta"), ("pizza",)),
    "sour": (("cream", "sweet", "hot", "roll", "papas"), ("salsas", "sushi", "pescados-mariscos", "sopas")),
    "corona": (("la corona", "sacra"), ()),
    "negroni": (("salame",), ()),
    "cristal": (("latte", "fideo"), ()),
    "pina colada": (
        ("sin alcohol", "virgin", "jugo", "smoothie", "shake", "milkshake", "tea", "helado"),
        ("jugos", "helados"),
    ),
}
_MENU_ALCOHOL_NAMES = KeywordMatcher(
    ((word if word in _MENU_FOOD_SENSES else "alcohol", word) for word in MENU_ALCOHOL_NAME_WORDS),
    avoid=[(word, phrase) for word, (phrases, _) in _MENU_FOOD_SENSES.items() for phrase in phrases],
)
# Secciones de un menú que son de tragos («Cervezas», «Vinos y Piscos», «Coctelería», «Bebidas Alcohólicas»): ningún
# plato de ahí se ofrece, aunque su nombre no diga alcohol («Misiones de Rengo», «Sake Dry» en «Cervezas Japonesas y
# Sake»). Una sección mezclada («Bebidas y Cervezas») se salta entera. «Cóctel» en singular es también comida para
# picar en Chile («Cocktail», «Empanadas de Cóctel»): solo cuentan «cócteles», «cocktails» y «coctelería». Nada de
# «chop» (19 «Chop Suey»). «Sin alcohol», «no alcohólicas» o «mocktails» la libran.
MENU_ALCOHOL_SECTION_WORDS = frozenset(
    {
        *("alcohol", "alcoholica", "alcoholico", "licor", "vino", "cerveza", "trago", "cocteles", "cocktails"),
        *("cocteleria", "pisco", "espumante", "sour"),
    }
)
_SOBER_SECTION = (
    *("sin alcohol", "no alcoholica", "no alcoholicas", "no alcoholico", "no alcoholicos", "not alcohol"),
    *("mocktail", "sour cream", "sweet and sour"),
)
_MENU_ALCOHOL_SECTIONS = KeywordMatcher(
    (("alcohol", word) for word in MENU_ALCOHOL_SECTION_WORDS), avoid=[("alcohol", p) for p in _SOBER_SECTION]
)
# Palabras de un nombre del catálogo que dicen bebé aunque el concepto no lo diga: en la base real del 14-10-2026 la
# ropa, los juguetes, las colonias y el detergente de bebé venían como ropa, juguetes-infantiles, fragancias o limpieza,
# y «vertical por probar» partía en Mall con un «Fisher-price Juguete Para Bebés». Palabra entera, con su plural.
# «infantil» no está: es de niños (cascos, libros, medias de fútbol), no de bebé.
BABY_NAME_WORDS = frozenset({"bebe", "guagua"})
_BABY_NAMES = KeywordMatcher(("bebe", word) for word in BABY_NAME_WORDS)


def is_plannable(concept: Concept) -> bool:
    """Si el concepto puede ir en el kit de una ocasión que la persona eligió: todo menos lo sensible, bebé y salud (el
    alcohol sí, con su marca +18)."""
    group = concept.parent or concept.id
    return not (concept.sensitive or group in OFFER_BLOCKED_GROUPS)


def is_offerable(concept: Concept) -> bool:
    """Si el agente puede proponer este concepto por su cuenta."""
    return is_plannable(concept) and not concept.age_restricted


def plannable_vertical(vertical: str, concept: Concept) -> bool:
    """Si el concepto de un kit puede salir de esta vertical: de las que el agente propone y, el alcohol, también de
    Licores. Farmacia nunca."""
    return offerable_vertical(vertical) or (concept.age_restricted and vertical in ALCOHOL_VERTICALS)


def plannable_occasion(occasion: Occasion) -> bool:
    """Si el agente arma el kit de esta ocasión (y la lista en la Home): no las de bebé ni salud, ni una sin concepto
    que pueda ir en el kit."""
    concepts = load_taxonomy().concepts
    return occasion.id not in NOT_PLANNABLE_OCCASIONS and any(is_plannable(concepts[c]) for c in occasion.concepts)


def alcohol_in_name(entity_type: str, name: str, concept_id: str | None = None) -> bool:
    """Si el nombre de un producto del catálogo (`ALCOHOL_NAME_WORDS`) o de un plato (`MENU_ALCOHOL_NAME_WORDS`) dice
    alcohol. `concept_id`: el del plato, si se sabe (una «Margarita» con concepto pizza es una pizza)."""
    if entity_type == "catalog_item":
        return _ALCOHOL_NAMES.best(name) is not None
    if entity_type != "menu_item":
        return False
    return any(
        m.target == "alcohol" or concept_id not in _MENU_FOOD_SENSES[m.target][1]
        for m in _MENU_ALCOHOL_NAMES.matches(name)
    )


def baby_in_name(entity_type: str, name: str) -> bool:
    """Si el nombre de un producto del catálogo dice bebé (`BABY_NAME_WORDS`). Los platos, no."""
    return entity_type == "catalog_item" and _BABY_NAMES.best(name) is not None


def alcohol_section(section: str | None) -> bool:
    """Si la sección del menú donde está un plato es de tragos (`MENU_ALCOHOL_SECTION_WORDS`)."""
    return bool(section) and _MENU_ALCOHOL_SECTIONS.best(section) is not None


def offerable_vertical(vertical: str) -> bool:
    """Si el agente puede proponer productos de esta vertical por su cuenta."""
    return vertical not in OFFER_BLOCKED_VERTICALS


def unofferable_subverticals() -> list[str]:
    """Los subverticales de tienda (store_verticals.subvertical) de los que el agente no propone, sea cual sea su
    vertical: los mismos que la Home no empuja (`catalog.stores.NOT_PUSHED_SUBVERTICALS`)."""
    # Import diferido: catalog.stores importa agent.tools, y agent.tools importa este módulo.
    from ..catalog.stores import NOT_PUSHED_SUBVERTICALS

    return list(NOT_PUSHED_SUBVERTICALS)
