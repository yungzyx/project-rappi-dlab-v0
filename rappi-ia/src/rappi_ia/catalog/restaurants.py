"""Restaurantes del catálogo: tarjetas con portada, nota, tiempo de entrega y envío, y su menú por secciones. Solo
lectura, consultas parametrizadas.

Un restaurante es una tienda de la vertical `restaurantes`. Se lista y se abre solo si tiene al menos un plato con
precio, y el precio de un plato es su último precio (como lo muestra Bigotes): uno de relleno (bajo `MIN_PRICE`) o sin
dato cuenta como desconocido y el plato no sale. La base no guarda logos de restaurantes, así que la portada es la foto
de uno de sus platos: un plato popular, o el primero con foto.
"""

from typing import Literal

from psycopg import Connection
from rappi_scraper.storage.search import MIN_PRICE

from ..agent.tools import clp
from ..concepts.taxonomy import load_taxonomy
from .stores import BIGINT_MAX, _product

POPULAR_SECTION = "Lo más pedido"

Sort = Literal["rating", "eta", "fee"]

# Los minutos de entrega son el primer número del texto («35 min»); un texto vacío o sin número, o 0, es desconocido.
_ETA_MINUTES = r"NULLIF(substring(d.eta from '\d+')::numeric, 0)"

# Cada orden desempata por la nota y por el id: la lista es siempre la misma. Lo desconocido va al final (un local sin
# tiempo no es "el más rápido", ni uno sin nota "el mejor").
_ORDER = {
    "rating": "d.rating DESC NULLS LAST, d.review_count DESC NULLS LAST, s.store_id",
    "eta": f"{_ETA_MINUTES} ASC NULLS LAST, d.rating DESC NULLS LAST, s.store_id",
    "fee": "d.delivery_cost ASC NULLS LAST, d.rating DESC NULLS LAST, s.store_id",
}

# El último precio de un plato `mi`: uno solo, el de la corrida más reciente.
_LATEST_DISH_PRICE = """(
    SELECT mp.price, mp.real_price FROM menu_price_snapshots mp WHERE mp.item_id = mi.item_id
    ORDER BY mp.scraped_at DESC LIMIT 1)"""

# Las tarjetas de los restaurantes con algún plato con precio, en un orden, de una cocina o de un local (los filtros
# que no se piden son NULL). El orden y el corte se hacen antes de buscar la portada y las cocinas, que solo se buscan
# para los que quedan. El EXISTS se detiene en el primer plato con precio.
_CARDS = """
WITH ranked AS (
    SELECT s.store_id, s.name, d.rating, d.eta, d.delivery_cost,
           row_number() OVER (ORDER BY {order}) AS pos
    FROM stores s
    JOIN store_verticals v ON v.store_id = s.store_id AND v.vertical = 'restaurantes'
    LEFT JOIN restaurant_details d ON d.store_id = s.store_id
    WHERE (%(store_id)s::bigint IS NULL OR s.store_id = %(store_id)s)
      AND (%(cuisine)s::text IS NULL
           OR EXISTS (SELECT 1 FROM restaurant_cuisines rc WHERE rc.store_id = s.store_id AND rc.cuisine = %(cuisine)s))
      AND EXISTS (SELECT 1 FROM menu_items mi CROSS JOIN LATERAL {latest} p
                  WHERE mi.store_id = s.store_id AND p.price >= %(min_price)s)
    ORDER BY pos
    LIMIT %(limit)s
)
SELECT r.store_id, r.name, r.rating, r.eta, r.delivery_cost, cover.image_url,
       ARRAY(SELECT rc.cuisine FROM restaurant_cuisines rc WHERE rc.store_id = r.store_id ORDER BY rc.cuisine)
FROM ranked r
LEFT JOIN LATERAL (
    SELECT mi.image_url
    FROM menu_items mi
    JOIN menu_sections ms ON ms.store_id = mi.store_id AND ms.section_id = mi.section_id
    WHERE mi.store_id = r.store_id AND mi.image_url <> ''
    ORDER BY mi.is_popular DESC, ms.position, ms.section_id, mi.rappi_item_id, mi.item_id
    LIMIT 1
) cover ON true
ORDER BY r.pos"""

# Los platos con precio de un restaurante, por la posición de su sección y, dentro de ella, por el id que les dio Rappi
# (que no guarda el orden de los platos).
_MENU = f"""
SELECT ms.section_id, ms.name, mi.item_id::text, mi.name, p.price, p.real_price, NULLIF(mi.image_url, ''),
       mi.is_popular, ic.concept_id
FROM menu_items mi
JOIN menu_sections ms ON ms.store_id = mi.store_id AND ms.section_id = mi.section_id
CROSS JOIN LATERAL {_LATEST_DISH_PRICE} p
LEFT JOIN item_concepts ic ON ic.entity_type = 'menu_item' AND ic.entity_id = mi.item_id::text
WHERE mi.store_id = %(store_id)s AND p.price >= %(min_price)s
ORDER BY ms.position, ms.section_id, mi.rappi_item_id, mi.item_id"""


def restaurants(conn: Connection, cuisine: str | None = None, sort: Sort = "rating", limit: int = 30) -> list[dict]:
    """Las tarjetas de los restaurantes con algún plato con precio, de una cocina si se pide, por mejor nota
    (`rating`), menor tiempo de entrega (`eta`) o menor costo de envío (`fee`)."""
    return [_card(*row) for row in _card_rows(conn, sort=sort, cuisine=cuisine, limit=limit)]


def restaurant_menu(conn: Connection, store_id: int) -> dict | None:
    """El restaurante con su menú: una sección por cada una de las suyas con platos con precio, en el orden de
    `menu_sections.position`. Los platos populares abren el menú en la sección «Lo más pedido» y siguen en la suya.
    `None` si no existe, no es un restaurante o no tiene platos con precio."""
    if not 0 <= store_id <= BIGINT_MAX:
        return None
    rows = _card_rows(conn, sort="rating", store_id=store_id, limit=1)
    if not rows:
        return None
    full_name = rows[0][1]
    taxonomy = load_taxonomy()
    sections: dict[int, dict] = {}
    popular: list[dict] = []
    for section_id, section, entity_id, name, price, real, image, is_popular, concept_id in conn.execute(
        _MENU, {"store_id": store_id, "min_price": MIN_PRICE}
    ):
        dish = _product(
            (entity_id, name, price, real, image, None, False, concept_id),
            "restaurantes",
            full_name,
            store_id,
            taxonomy,
            "menu_item",
        ).to_dict()
        sections.setdefault(section_id, {"name": section.strip(), "items": []})["items"].append(dish)
        if is_popular:
            popular.append(dish)
    first = [{"name": POPULAR_SECTION, "items": popular}] if popular else []
    return {"restaurant": _card(*rows[0]), "sections": first + list(sections.values())}


def _card_rows(
    conn: Connection, sort: Sort, cuisine: str | None = None, store_id: int | None = None, limit: int = 30
) -> list[tuple]:
    params = {"store_id": store_id, "cuisine": cuisine, "limit": limit, "min_price": MIN_PRICE}
    return conn.execute(_CARDS.format(order=_ORDER[sort], latest=_LATEST_DISH_PRICE), params).fetchall()


def _card(store_id: int, full_name: str, rating, eta: str | None, fee, cover: str | None, cuisines: list[str]) -> dict:
    name, area = _split_name(full_name)
    return {
        "id": store_id,
        "name": name,
        "area": area,
        "cover": cover,
        "rating": float(rating) if rating is not None else None,
        "eta": (eta.strip() or None) if eta else None,
        "fee": clp(float(fee)) if fee is not None else None,
        "cuisines": cuisines,
    }


def _split_name(full_name: str) -> tuple[str, str]:
    """«Vapiano - Las Condes» es el local «Vapiano» del área «Las Condes»: separa en el último « - » y recorta los
    espacios; sin él, el nombre queda entero y no hay área."""
    before, separator, after = full_name.strip().rpartition(" - ")
    return (before.strip(), after.strip()) if separator else (after, "")
