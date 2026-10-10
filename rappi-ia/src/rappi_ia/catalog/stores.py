"""Tiendas y productos del catálogo con el precio vigente de cada tienda. Solo lectura, consultas parametrizadas.

Oferta vigente: la misma regla que el precio que muestra Bigotes (`_with_prices`, agent/tools.py) y que la búsqueda
(`_OFFER_PRICES`, rappi_scraper/storage/search.py): el último precio de la tienda para ese SKU es de la corrida
`format_run_id` de su formato (`v_store_format_runs`, migración 019) y `in_stock` no es `false`. Además, el precio tiene
que ser real (desde `MIN_PRICE`): uno de relleno cuenta como desconocido y el producto no se ofrece.

Una tienda se lista y se abre por sus ofertas vigentes que están en un pasillo (la página muestra los productos por
pasillo): así la cuenta de la tarjeta es la suma de sus pasillos, y una tienda sin pasillos no sale como una página
vacía. Eso deja fuera a las tiendas solo descubiertas (sin productos), a las sucursales cuya última descarga es anterior
a la de su formato y a las importadas de un CSV antiguo (sin `raw` ni pasillos).
"""

from psycopg import Connection
from rappi_scraper.storage.search import MIN_PRICE

from ..agent.tools import Product
from ..agent.verticals import LOGO_BASE_URL
from ..concepts.taxonomy import load_taxonomy

BIGINT_MAX = 2**63 - 1

# Las ofertas vigentes de UNA tienda con su pasillo, una por producto del catálogo (la más barata, si la tienda lo tiene
# en dos SKU): `offers` es un CTE que usan la tarjeta, los pasillos y la página de productos.
_STORE_OFFERS = """
latest AS (
    SELECT DISTINCT ON (ps.sku) ps.sku, ps.price, ps.real_price, ps.in_stock, ps.run_id
    FROM price_snapshots ps
    WHERE ps.store_id = %(store_id)s
    ORDER BY ps.sku, ps.scraped_at DESC, ps.run_id DESC  -- el desempate de v_store_format_runs
),
offers AS (
    SELECT DISTINCT ON (sp.master_product_id) sp.master_product_id, a.aisle_id, a.name AS aisle, l.price, l.real_price
    FROM latest l
    JOIN v_store_format_runs f ON f.store_id = %(store_id)s AND f.format_run_id = l.run_id
    JOIN store_products sp ON sp.store_id = %(store_id)s AND sp.sku = l.sku
    JOIN aisles a ON a.store_id = %(store_id)s AND a.aisle_id = sp.aisle_id AND a.parent_aisle_id IS NULL
    WHERE sp.master_product_id IS NOT NULL AND l.in_stock IS NOT FALSE AND l.price >= %(min_price)s
    ORDER BY sp.master_product_id, l.price, sp.sku
)"""

# El vertical de la tienda `s`: el propio (su fila de store_verticals); los heredados de su formato, solo si no tiene.
_OWN_VERTICAL = """(
    SELECT v.vertical FROM v_store_verticals v WHERE v.store_id = s.store_id
    ORDER BY EXISTS (SELECT 1 FROM store_verticals d WHERE d.store_id = v.store_id AND d.vertical = v.vertical) DESC,
             v.vertical
    LIMIT 1)"""

# Tarjeta de una tienda.
_STORE_CARD = f"""
WITH {_STORE_OFFERS}
SELECT s.store_id, btrim(coalesce(b.name, s.name)), s.raw->>'image', s.raw->>'eta_value',
       (SELECT count(*) FROM offers), {_OWN_VERTICAL}
FROM stores s
LEFT JOIN brands b ON b.brand_id = s.brand_id
WHERE s.store_id = %(store_id)s"""

# Los pasillos con ofertas vigentes. Un producto de un subpasillo trae también el id de su pasillo, así que los
# subpasillos no aparecen aparte. Rappi no guarda la posición de los pasillos: el id es lo más cercano a su orden.
_STORE_AISLES = f"""
WITH {_STORE_OFFERS}
SELECT aisle_id, btrim(aisle), count(*) FROM offers GROUP BY aisle_id, aisle ORDER BY aisle_id"""

# Una página de productos de un pasillo, por nombre (y por id, que desempata nombres repetidos: sin eso, una página
# podría repetir o saltarse productos).
_STORE_PRODUCTS = f"""
WITH {_STORE_OFFERS}
SELECT ci.master_product_id::text, ci.name, o.price, o.real_price, NULLIF(ci.image_url, ''), ci.presentation,
       ci.is_alcoholic OR ci.age_restricted, ic.concept_id
FROM offers o
JOIN catalog_items ci ON ci.master_product_id = o.master_product_id
LEFT JOIN item_concepts ic ON ic.entity_type = 'catalog_item' AND ic.entity_id = ci.master_product_id::text
WHERE o.aisle_id = %(aisle_id)s
ORDER BY ci.name, ci.master_product_id
LIMIT %(limit)s OFFSET %(offset)s"""

# Una tarjeta por formato (store_type) del vertical: la sucursal que la última corrida de su formato bajó. Si hubiera
# varias en esa corrida, la de más ofertas. Solo se leen los precios de esa corrida (por su llave, sin recorrer el
# historial), y uno vale si ningún precio posterior del mismo SKU lo reemplazó, que es lo mismo que "el último precio
# es de esa corrida". Las tarjetas se cortan antes de unir con tiendas y marcas. El LATERAL hace que el plan busque
# por llave en vez de leer price_snapshots entero (el plan sin él tardaba el doble).
_VERTICAL_STORES = """
WITH downloaded AS MATERIALIZED (
    SELECT f.store_id, f.format, f.format_run_id
    FROM v_store_format_runs f
    JOIN v_store_verticals v ON v.store_id = f.store_id AND v.vertical = %(vertical)s
    WHERE EXISTS (SELECT 1 FROM aisles a WHERE a.store_id = f.store_id AND a.parent_aisle_id IS NULL)  -- sin pasillos
),
offers AS (
    SELECT d.format, d.store_id, o.master_product_id
    FROM downloaded d
    CROSS JOIN LATERAL (
        SELECT sp.master_product_id
        FROM price_snapshots ps
        JOIN store_products sp ON sp.store_id = ps.store_id AND sp.sku = ps.sku
        JOIN aisles a ON a.store_id = sp.store_id AND a.aisle_id = sp.aisle_id AND a.parent_aisle_id IS NULL
        WHERE ps.run_id = d.format_run_id AND ps.store_id = d.store_id AND sp.master_product_id IS NOT NULL
          AND ps.in_stock IS NOT FALSE AND ps.price >= %(min_price)s
          AND NOT EXISTS (SELECT 1 FROM price_snapshots later
                          WHERE later.store_id = ps.store_id AND later.sku = ps.sku
                            AND later.scraped_at >= ps.scraped_at
                            AND (later.scraped_at, later.run_id) > (ps.scraped_at, ps.run_id))
    ) o
),
counted AS (
    SELECT format, store_id, count(DISTINCT master_product_id) AS products FROM offers GROUP BY format, store_id
),
one_per_format AS (
    SELECT DISTINCT ON (format) store_id, products FROM counted ORDER BY format, products DESC, store_id
),
top AS (
    SELECT store_id, products FROM one_per_format ORDER BY products DESC, store_id LIMIT %(limit)s
)
SELECT s.store_id, btrim(coalesce(b.name, s.name)), s.raw->>'image', s.raw->>'eta_value', t.products
FROM top t
JOIN stores s ON s.store_id = t.store_id
LEFT JOIN brands b ON b.brand_id = s.brand_id
ORDER BY t.products DESC, s.store_id"""

# El producto del catálogo con su oferta vigente más barata de todas las tiendas. El precio es el de esa oferta; la
# tienda (id y nombre) es la más barata de las que se abren con este producto en un pasillo, y sin ninguna, el id es
# nulo y el nombre es el de la tienda de la oferta más barata.
_CATALOG_DETAIL = f"""
WITH latest AS (
    SELECT DISTINCT ON (ps.store_id, ps.sku) ps.store_id, ps.price, ps.real_price, ps.in_stock, ps.run_id,
           sp.aisle_id
    FROM price_snapshots ps
    JOIN store_products sp ON sp.store_id = ps.store_id AND sp.sku = ps.sku
    WHERE sp.master_product_id = %(id)s
    ORDER BY ps.store_id, ps.sku, ps.scraped_at DESC, ps.run_id DESC  -- el desempate de v_store_format_runs
),
offers AS (
    SELECT l.store_id, l.price, l.real_price,
           EXISTS (SELECT 1 FROM aisles a
                   WHERE a.store_id = l.store_id AND a.aisle_id = l.aisle_id AND a.parent_aisle_id IS NULL) AS openable
    FROM latest l
    JOIN v_store_format_runs f ON f.store_id = l.store_id AND f.format_run_id = l.run_id
    WHERE l.in_stock IS NOT FALSE AND l.price >= %(min_price)s
),
cheapest AS (SELECT store_id, price, real_price FROM offers ORDER BY price, store_id LIMIT 1),
openable AS (SELECT store_id FROM offers WHERE openable ORDER BY price, store_id LIMIT 1)
SELECT ci.master_product_id::text, ci.name, c.price, c.real_price, btrim(coalesce(b.name, s.name)), o.store_id,
       NULLIF(ci.image_url, ''), ci.presentation, ci.is_alcoholic OR ci.age_restricted, ic.concept_id,
       {_OWN_VERTICAL}
FROM cheapest c
LEFT JOIN openable o ON true
JOIN catalog_items ci ON ci.master_product_id = %(id)s
JOIN stores s ON s.store_id = coalesce(o.store_id, c.store_id)
LEFT JOIN brands b ON b.brand_id = s.brand_id
LEFT JOIN item_concepts ic ON ic.entity_type = 'catalog_item' AND ic.entity_id = ci.master_product_id::text"""

# Un plato con su último precio (como lo muestra Bigotes).
_MENU_DETAIL = """
SELECT mi.item_id::text, mi.name, mp.price, mp.real_price, s.name, s.store_id, NULLIF(mi.image_url, ''), ic.concept_id
FROM menu_items mi
JOIN stores s ON s.store_id = mi.store_id
LEFT JOIN LATERAL (
    SELECT price, real_price FROM menu_price_snapshots WHERE item_id = mi.item_id ORDER BY scraped_at DESC LIMIT 1
) mp ON true
LEFT JOIN item_concepts ic ON ic.entity_type = 'menu_item' AND ic.entity_id = mi.item_id::text
WHERE mi.item_id = %(id)s"""


def vertical_stores(conn: Connection, vertical: str, limit: int = 30) -> list[dict]:
    """Una tarjeta por formato de tienda del vertical, de más a menos ofertas vigentes. Restaurantes no entra: sus
    locales no venden productos del catálogo (tienen menú)."""
    if vertical == "restaurantes":
        return []
    rows = conn.execute(_VERTICAL_STORES, {"vertical": vertical, "min_price": MIN_PRICE, "limit": limit})
    return [_card(store_id, name, image, eta, count, vertical) for store_id, name, image, eta, count in rows]


def store_page(
    conn: Connection, store_id: int, aisle_id: int | None = None, page: int = 1, page_size: int = 24
) -> dict | None:
    """La tienda con sus pasillos y una página de los productos de uno (el primero, si no se pide uno). `None` si la
    tienda no existe o no tiene ofertas vigentes. Con un pasillo que la tienda no tiene (o sin ofertas), `aisle` es
    `None` y no hay productos."""
    if not 0 <= store_id <= BIGINT_MAX:
        return None
    params = {"store_id": store_id, "min_price": MIN_PRICE}
    row = conn.execute(_STORE_CARD, params).fetchone()
    if row is None or row[4] == 0:
        return None
    store = _card(*row)
    aisles = [{"id": id_, "name": name, "products": count} for id_, name, count in conn.execute(_STORE_AISLES, params)]
    chosen = aisles[0] if aisle_id is None and aisles else next((a for a in aisles if a["id"] == aisle_id), None)
    products: list[Product] = []
    if chosen is not None:
        # Una más de las que se piden: así se sabe si hay otra página sin contar.
        paging = {**params, "aisle_id": chosen["id"], "limit": page_size + 1, "offset": (page - 1) * page_size}
        taxonomy = load_taxonomy()
        products = [
            _product(row, store["vertical"], store["name"], store_id, taxonomy)
            for row in conn.execute(_STORE_PRODUCTS, paging)
        ]
    return {
        "store": store,
        "aisles": aisles,
        "aisle": chosen,
        "products": [p.to_dict() for p in products[:page_size]],
        "page": page,
        "has_more": len(products) > page_size,
    }


def product_detail(conn: Connection, entity_type: str, entity_id: str) -> dict | None:
    """Un producto del catálogo con su oferta vigente más barata, o un plato con su último precio. `None` si no existe
    o no tiene precio. El precio es el de la oferta vigente más barata, aunque sea de una tienda sin pasillos (una
    importada de un CSV antiguo) que `store_page` no abre; `store_id` solo apunta a una tienda que se abre y tiene el
    producto (`None` si no hay ninguna) y `store` es el nombre de esa tienda."""
    item_id = int(entity_id) if entity_id.isascii() and entity_id.isdigit() else None
    if item_id is None or item_id > BIGINT_MAX:
        return None
    taxonomy = load_taxonomy()
    if entity_type == "catalog_item":
        row = conn.execute(_CATALOG_DETAIL, {"id": item_id, "min_price": MIN_PRICE}).fetchone()
        if row is None:
            return None
        id_, name, price, real, store, store_id, image, presentation, adult, concept, vertical = row
        product = _product(
            (id_, name, price, real, image, presentation, adult, concept), vertical, store, store_id, taxonomy
        )
    elif entity_type == "menu_item":
        row = conn.execute(_MENU_DETAIL, {"id": item_id}).fetchone()
        if row is None:
            return None
        id_, name, price, real, store, store_id, image, concept = row
        product = _product(
            (id_, name, price, real, image, None, False, concept),
            "restaurantes",
            store,
            store_id,
            taxonomy,
            entity_type,
        )
    else:
        return None
    return product.to_dict() if product.price_value is not None else None


def _card(store_id: int, name: str, image: str | None, eta: str | None, products: int, vertical: str | None) -> dict:
    return {
        "id": store_id,
        "name": name,
        "logo": LOGO_BASE_URL + image if image else None,
        "eta": _eta_text(eta),
        "products": products,
        "vertical": vertical,
    }


def _eta_text(value: str | None) -> str | None:
    """«25 min» a partir de los minutos que Rappi guarda en la tienda; sin minutos (o en 0), nada."""
    try:
        minutes = round(float(value)) if value else 0
    except (ValueError, OverflowError):  # texto que no es un número, o uno infinito
        return None
    return f"{minutes} min" if minutes > 0 else None


def _product(row, vertical: str | None, store: str, store_id: int | None, taxonomy, entity_type: str = "catalog_item"):
    """El `Product` de una fila (id, nombre, precio, precio antes, imagen, presentación, +18 por producto, concepto).
    Un precio de relleno ($0, $1) cuenta como desconocido, igual que en `_with_prices`."""
    entity_id, name, price, real, image, presentation, adult, concept_id = row
    concept = taxonomy.concepts.get(concept_id) if concept_id else None
    return Product(
        id=f"{'cat' if entity_type == 'catalog_item' else 'menu'}-{entity_id}",
        entity_type=entity_type,
        entity_id=entity_id,
        name=name,
        vertical=vertical,
        concept=concept_id,
        price_value=float(price) if price is not None and price >= MIN_PRICE else None,
        before_value=float(real) if real is not None else None,
        store=store,
        img=image,
        age_restricted=bool(adult) or bool(concept and concept.age_restricted),
        store_id=store_id,
        presentation=presentation or None,
    )
