"""Guardias de ofertas: lo que el agente nunca propone por su cuenta.

Una oferta es todo lo que el agente muestra sin que se lo hayan pedido: la sugerencia cruzada de /agent/ask y de
/recommendations (`suggest_complement`), los ganchos de servicios y los momentos de /agent/offer. Nunca es:
- alcohol (Licores y todo concepto +18), ni tabaco, vapeo o bienestar sexual;
- salud o farmacia: el grupo «Farmacia y cuidado personal» entero (medicamentos, vitaminas, higiene, dermocosmética);
- bebé;
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

from ..concepts.taxonomy import Concept, Occasion, load_taxonomy

OFFER_BLOCKED_GROUPS = ("bebe", "salud")  # grupos de taxonomy.toml; el alcohol y el tabaco se bloquean por sus marcas
# Parecida a catalog.stores.NOT_PUSHED_VERTICALS (lo que la Home no empuja), pero con otro motivo y otra lista.
OFFER_BLOCKED_VERTICALS = ("farmacia", "licores")
ALCOHOL_VERTICALS = ("licores",)  # las bloqueadas de las que el alcohol de un kit elegido sí puede salir
NOT_PLANNABLE_OCCASIONS = ("guagua", "enfermo")  # bebé y salud: ni siquiera como kit que la persona pide


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


def offerable_vertical(vertical: str) -> bool:
    """Si el agente puede proponer productos de esta vertical por su cuenta."""
    return vertical not in OFFER_BLOCKED_VERTICALS


def unofferable_subverticals() -> list[str]:
    """Los subverticales de tienda (store_verticals.subvertical) de los que el agente no propone, sea cual sea su
    vertical: los mismos que la Home no empuja (`catalog.stores.NOT_PUSHED_SUBVERTICALS`)."""
    # Import diferido: catalog.stores importa agent.tools, y agent.tools importa este módulo.
    from ..catalog.stores import NOT_PUSHED_SUBVERTICALS

    return list(NOT_PUSHED_SUBVERTICALS)
