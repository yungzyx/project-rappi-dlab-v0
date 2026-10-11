"""Las ofertas del agente: lo que propone en cada momento de la app, desde la base y pasando por las guardias
(rappi_ia/offers). Sin una buena oferta responde 204: el agente no dice nada.

`app.py` incluye este router; las dependencias viven en `deps.py`, así este módulo no importa `app`.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from psycopg import Connection
from pydantic import Field

from ..offers.engine import OfferError, home_occasions, make_offer
from ..offers.personal import user_interests
from .deps import Clean, backend_vertical, get_conn, get_services
from .services import Services

router = APIRouter(prefix="/agent", tags=["agent"])

MAX_LINES = 100  # como un pedido (OrderIn)


class EntityIn(Clean):
    entity_type: Literal["catalog_item", "menu_item"]
    entity_id: str = Field(min_length=1, max_length=64)


class PlanContext(Clean):
    occasion: str = Field(min_length=1, max_length=64)


class CartContext(Clean):
    product: EntityIn


class CheckoutContext(Clean):
    cart: list[EntityIn] = Field(min_length=1, max_length=MAX_LINES)


class NoResultContext(Clean):
    query: str = Field(min_length=1, max_length=200)


class NextOrderContext(Clean):
    items: list[EntityIn] = Field(min_length=1, max_length=MAX_LINES)


class ToTryContext(Clean):
    """Las verticales que ya tienen sello (códigos del backend o ids del prototipo)."""

    stamped: list[Annotated[str, Field(max_length=64)]] = Field(max_length=20)


class OfferBase(Clean):
    user_id: str | None = Field(default=None, max_length=64)


class PlanIn(OfferBase):
    moment: Literal["plan"]
    context: PlanContext


class CartIn(OfferBase):
    moment: Literal["carrito"]
    context: CartContext


class CheckoutIn(OfferBase):
    moment: Literal["checkout"]
    context: CheckoutContext


class NoResultIn(OfferBase):
    moment: Literal["sin_resultado"]
    context: NoResultContext


class NextOrderIn(OfferBase):
    moment: Literal["proximo_pedido"]
    context: NextOrderContext


class ToTryIn(OfferBase):
    moment: Literal["vertical_por_probar"]
    context: ToTryContext


OfferIn = Annotated[PlanIn | CartIn | CheckoutIn | NoResultIn | NextOrderIn | ToTryIn, Field(discriminator="moment")]


@router.post("/offer", responses={204: {"description": "Sin una buena oferta para este momento"}})
def offer(body: OfferIn, conn: Connection = Depends(get_conn), svc: Services = Depends(get_services)):
    """La oferta de un momento: `{ moment, text, products, vertical, prototype_vertical, reason, actions }`, o 204.
    Una ocasión que no existe, o que el agente no arma (guagua, enfermo), es un 422."""
    context = body.context.model_dump()
    if body.moment == "vertical_por_probar":
        context["stamped"] = [v for v in map(backend_vertical, context["stamped"]) if v]
    try:
        found = make_offer(conn, svc.embedder, body.moment, context, body.user_id)
    except OfferError as exc:
        raise HTTPException(422, str(exc)) from exc
    return Response(status_code=204) if found is None else found.to_dict()


@router.get("/plans")
def plans(
    user_id: Annotated[str | None, Query(max_length=64)] = None, conn: Connection = Depends(get_conn)
) -> list[dict]:
    """Las ocasiones que el agente arma como kit, para la Home: `[{ id, name, emoji }]`. Con `user_id` de alguien del
    prototipo, las que coinciden con lo que le gusta van primero y traen su `reason` (`text` y `basis`)."""
    return home_occasions(conn, user_interests(conn, user_id))
