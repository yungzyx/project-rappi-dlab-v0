"""El progreso del juego de cada persona: un documento por usuario (`game_state`), limpio al guardar y al leer.

La forma del documento es la de `initialState()` en `prototipo-app/src/game/progress.js`. Los ids de tarjeta que ya no
existen (una tarjeta sale de `knowledge.json`) y las verticales que no son del pasaporte se quitan, así el progreso
guardado nunca nombra algo que la base no tiene.
"""

from psycopg import Connection
from psycopg.types.json import Jsonb

from ..events.store import ensure_user
from . import GAME_VERTICALS


def clean_state(conn: Connection, state: dict) -> dict:
    """Quita los ids de tarjeta que no están en `knowledge_cards` (en `discovered`, `cards` y `opened`) y las
    verticales que no están en `GAME_VERTICALS` (en `visited` y en las claves de `discovered`, `correct` y
    `answered`). No modifica `state`."""
    known = {row[0] for row in conn.execute("SELECT card_id FROM knowledge_cards")}
    verticals = set(GAME_VERTICALS)

    def by_vertical(values: dict) -> dict:
        return {vertical: value for vertical, value in values.items() if vertical in verticals}

    return {
        **state,
        "discovered": {
            vertical: [card for card in cards if card in known]
            for vertical, cards in by_vertical(state["discovered"]).items()
        },
        "correct": by_vertical(state["correct"]),
        "answered": by_vertical(state["answered"]),
        "cards": [card for card in state["cards"] if card in known],
        "opened": [card for card in state["opened"] if card in known],
        "visited": [vertical for vertical in state["visited"] if vertical in verticals],
    }


def get_state(conn: Connection, user_id: str) -> dict | None:
    row = conn.execute("SELECT state FROM game_state WHERE user_id = %s", (user_id,)).fetchone()
    return None if row is None else clean_state(conn, row[0])


def save_state(conn: Connection, user_id: str, state: dict) -> dict:
    """Guarda el progreso (limpio) y lo devuelve; crea el usuario `prototype` si falta. Un usuario de otra fuente
    (simulado) lanza `ValueError` y no se escribe nada. No hace commit."""
    ensure_user(conn, user_id, "prototype")
    cleaned = clean_state(conn, state)
    conn.execute(
        """INSERT INTO game_state (user_id, state, updated_at) VALUES (%s, %s, now())
           ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()""",
        (user_id, Jsonb(cleaned)),
    )
    return cleaned
