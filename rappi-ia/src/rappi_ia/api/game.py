"""El juego de la app: las tarjetas de conocimiento y el progreso de cada persona.

`app.py` incluye este router; las dependencias viven en `deps.py`, así este módulo no importa `app`.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from psycopg import Connection
from pydantic import Field

from .. import config
from ..game import GAME_VERTICALS
from ..game.cards import list_cards
from ..game.challenges import make_challenge
from ..game.state import get_state, save_state
from .deps import Clean, get_conn

router = APIRouter(prefix="/game", tags=["game"])

MAX_ITEMS = 200  # tarjetas por lista: muy por encima de las 108 del juego
MAX_KEYS = 20  # verticales por diccionario: muy por encima de las 9 del pasaporte

Short = Annotated[str, Field(max_length=64)]
CardList = Annotated[list[Short], Field(max_length=MAX_ITEMS)]
Count = Annotated[int, Field(ge=0)]


class Daily(Clean, extra="forbid"):
    date: Short | None
    discovered: Count
    correct: Count
    opened: Count
    done: bool


class Streak(Clean, extra="forbid"):
    count: Count
    lastDate: Short | None


class GameState(Clean, extra="forbid"):
    """El progreso tal como lo guarda la app (`initialState()` de `src/game/progress.js`)."""

    version: Literal[1]
    xp: Count
    discovered: Annotated[dict[Short, CardList], Field(max_length=MAX_KEYS)]
    correct: Annotated[dict[Short, Count], Field(max_length=MAX_KEYS)]
    answered: Annotated[dict[Short, Count], Field(max_length=MAX_KEYS)]
    cards: CardList
    opened: CardList
    daily: Daily
    streak: Streak
    seenIntro: bool
    visited: CardList


class StateIn(Clean, extra="forbid"):
    state: GameState


UserId = Annotated[str, Path(min_length=1, max_length=64)]


@router.get("/cards")
def cards(vertical: Annotated[str | None, Query()] = None, conn: Connection = Depends(get_conn)) -> dict:
    """Las tarjetas de conocimiento en el orden del archivo, con sus conceptos; `vertical` filtra por una del
    pasaporte."""
    if vertical is not None and vertical not in GAME_VERTICALS:
        raise HTTPException(422, f"Esta vertical no es del juego: {vertical}")
    return {"cards": list_cards(conn, vertical)}


@router.get("/challenge", response_model=None)
def challenge(
    vertical: Annotated[str, Query(min_length=1, max_length=64)],
    seed: Annotated[str, Query(min_length=1, max_length=64)],
    conn: Connection = Depends(get_conn),
) -> dict | Response:
    """Un desafío de 4 alternativas para la vertical, armado con los conceptos y las relaciones de la base: la misma
    semilla da el mismo desafío. 204 si la vertical no tiene datos para armar uno (Viajes no tiene catálogo)."""
    if vertical not in GAME_VERTICALS:
        raise HTTPException(422, f"Esta vertical no es del juego: {vertical}")
    made = make_challenge(conn, vertical, seed, config.GAME_MIN_ITEMS)
    return Response(status_code=204) if made is None else made


@router.get("/state/{user_id}", response_model=None)
def read_state(user_id: UserId, conn: Connection = Depends(get_conn)) -> dict | Response:
    """El progreso guardado de la persona, o 204 si todavía no guardó nada."""
    state = get_state(conn, user_id)
    return Response(status_code=204) if state is None else {"state": state}


@router.put("/state/{user_id}")
def write_state(user_id: UserId, body: StateIn, conn: Connection = Depends(get_conn)) -> dict:
    """Guarda el progreso (sin las tarjetas ni verticales que no existen) y lo devuelve limpio."""
    try:
        state = save_state(conn, user_id, body.state.model_dump())
    except ValueError as exc:  # un usuario de otra fuente (simulado)
        conn.rollback()
        raise HTTPException(409, str(exc)) from exc
    conn.commit()
    return {"state": state}
