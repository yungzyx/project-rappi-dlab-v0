"""Las listas de la Home: tiendas cerca de ti, restaurantes rápidos y restaurantes con envío barato. Solo lectura,
consultas parametrizadas."""

from psycopg import Connection
from rappi_scraper.storage.search import MIN_PRICE

from .. import config
from .restaurants import restaurants
from .stores import _CURRENT_OFFERS, _OWN_VERTICAL, NOT_PUSHED_VERTICALS, _card, downloaded_cte

NEARBY_STORES = 6
FAST_RESTAURANTS = 2
LOW_FEE_RESTAURANTS = 6

# Las tiendas con ofertas vigentes más cercanas al punto, con coordenadas y sin las que no se empujan (farmacia,
# restaurantes). La distancia es la del círculo máximo (haversine). Las tiendas se ordenan y se cortan solo con las que
# tienen alguna oferta vigente (el EXISTS se detiene en la primera): así una cercana sin ofertas no ocupa un lugar y
# los productos se cuentan solo para las que quedan. Cada tarjeta es la que da `vertical_stores`.
_NEARBY = f"""
WITH {downloaded_cte(False)},
nearest AS MATERIALIZED (
    SELECT d.store_id, d.format_run_id,
           2 * asin(sqrt(sin(radians(s.lat - %(lat)s) / 2) ^ 2
                         + cos(radians(%(lat)s)) * cos(radians(s.lat)) * sin(radians(s.lng - %(lng)s) / 2) ^ 2)) AS km
    FROM downloaded d
    JOIN stores s ON s.store_id = d.store_id
    WHERE s.lat IS NOT NULL AND s.lng IS NOT NULL AND EXISTS (SELECT 1 {_CURRENT_OFFERS})
    ORDER BY km, d.store_id
    LIMIT %(limit)s
)
SELECT s.store_id, btrim(coalesce(b.name, s.name)), s.raw->>'image', s.raw->>'eta_value', o.products, {_OWN_VERTICAL}
FROM nearest d
CROSS JOIN LATERAL (SELECT count(DISTINCT sp.master_product_id) AS products {_CURRENT_OFFERS}) o
JOIN stores s ON s.store_id = d.store_id
LEFT JOIN brands b ON b.brand_id = s.brand_id
ORDER BY d.km, d.store_id"""


def home(conn: Connection) -> dict:
    """Lo que la Home muestra del catálogo: `nearby_stores` (las tiendas más cercanas al punto fijo de la demo),
    `fast_restaurants` (los de menor tiempo de entrega; uno sin tiempo no es rápido) y `low_fee_restaurants` (los de
    menor costo de envío). Una lista sin datos queda vacía."""
    fast = restaurants(conn, sort="eta", limit=FAST_RESTAURANTS)
    return {
        "nearby_stores": _nearby_stores(conn, config.MVP_HOME_LAT, config.MVP_HOME_LNG, NEARBY_STORES),
        "fast_restaurants": [card for card in fast if card["eta"]],
        "low_fee_restaurants": restaurants(conn, sort="fee", limit=LOW_FEE_RESTAURANTS),
    }


def _nearby_stores(conn: Connection, lat: float, lng: float, limit: int) -> list[dict]:
    params = {"lat": lat, "lng": lng, "limit": limit, "min_price": MIN_PRICE, "not_pushed": list(NOT_PUSHED_VERTICALS)}
    return [_card(*row) for row in conn.execute(_NEARBY, params)]
