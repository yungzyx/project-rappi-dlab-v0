"""Catálogo de la app: tiendas, pasillos y productos reales con el precio vigente de cada tienda (solo lectura).

`app.py` incluye este router al final de su módulo, porque necesita `get_conn` y `backend_vertical`: este módulo se
importa desde `app`, no al revés ni por separado.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection

from ..catalog.stores import product_detail, store_page, vertical_stores
from .app import backend_vertical, get_conn

router = APIRouter(prefix="/catalog", tags=["catalog"])

STORE_NOT_FOUND = "Esta tienda no está en el catálogo"
PRODUCT_NOT_FOUND = "Este producto no está en el catálogo"
VERTICAL_NOT_FOUND = "Esta vertical no está en el catálogo"


@router.get("/verticals/{vertical}/stores")
def stores_of_vertical(
    vertical: str, limit: int = Query(30, ge=1, le=100), conn: Connection = Depends(get_conn)
) -> dict:
    """Las tiendas de una vertical (código del backend o id del prototipo), de más a menos ofertas vigentes."""
    code = backend_vertical(vertical)
    if code is None:
        raise HTTPException(404, VERTICAL_NOT_FOUND)
    return {"vertical": code, "stores": vertical_stores(conn, code, limit)}


@router.get("/stores/{store_id}")
def store(
    store_id: int,
    aisle: int | None = None,
    page: int = Query(1, ge=1, le=10_000),
    conn: Connection = Depends(get_conn),
) -> dict:
    """La tienda con sus pasillos y una página de productos de uno (el primero, si no se pide)."""
    reply = store_page(conn, store_id, aisle, page)
    if reply is None:
        raise HTTPException(404, STORE_NOT_FOUND)
    return reply


@router.get("/products/{entity_type}/{entity_id}")
def product(entity_type: str, entity_id: str, conn: Connection = Depends(get_conn)) -> dict:
    """Un producto (`catalog_item`) con su oferta vigente más barata, o un plato (`menu_item`) con su último precio."""
    reply = product_detail(conn, entity_type, entity_id)
    if reply is None:
        raise HTTPException(404, PRODUCT_NOT_FOUND)
    return reply
