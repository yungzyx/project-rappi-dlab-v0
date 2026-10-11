"""Eventos del juego (ronda terminada, tarjeta descubierta) contra `rappi_ia_test`."""

from datetime import UTC, datetime

import psycopg
import pytest

from rappi_ia.concepts.store import seed_taxonomy
from rappi_ia.concepts.taxonomy import load_taxonomy
from rappi_ia.events import store as events

NOW = datetime(2026, 10, 11, 12, tzinfo=UTC)


def _payloads(db, event_type):
    return [row[0] for row in db.execute("SELECT payload FROM app_events WHERE type = %s", (event_type,))]


def test_game_round_finished_is_recorded(db):
    payload = {"vertical_juego": "viajes", "estrellas": 3, "aciertos": 4, "preguntas": 5}
    events.record(db, [events.Event("u-game", "s1", "game_round_finished", ts=NOW, payload=payload)])
    assert db.execute("SELECT vertical, entity_type FROM app_events WHERE type = 'game_round_finished'").fetchall() == [
        (None, None)
    ]
    assert _payloads(db, "game_round_finished") == [payload]


def test_game_card_discovered_is_recorded(db):
    payload = {"vertical_juego": "licores", "tarjeta": "licores-dato-01"}
    events.record(db, [events.Event("u-game", "s1", "game_card_discovered", ts=NOW, payload=payload)])
    assert _payloads(db, "game_card_discovered") == [payload]


def test_unknown_type_still_rejected(db):
    with pytest.raises(ValueError):
        events.record(db, [events.Event("u-game", "s1", "game_won", ts=NOW)])
    with pytest.raises(psycopg.errors.CheckViolation):  # y la base lo rechaza aunque el código lo dejara pasar
        db.execute("INSERT INTO app_users (user_id, source) VALUES ('u-raw', 'prototype')")
        db.execute(
            "INSERT INTO app_events (user_id, session_id, type, source) VALUES ('u-raw', 's1', 'game_won', 'prototype')"
        )


def test_game_events_do_not_add_profile_interest(db):
    seed_taxonomy(db, load_taxonomy())
    events.record(db, [events.Event("u-game", "s1", "search", ts=NOW, concept_id="pizza", query="pizza")])
    before = events.profile(db, "u-game", now=NOW)
    events.record(
        db,
        [
            events.Event("u-game", "s1", "game_round_finished", ts=NOW, concept_id="cerveza", payload={"estrellas": 3}),
            events.Event("u-game", "s1", "game_card_discovered", ts=NOW, concept_id="vino", payload={"tarjeta": "x"}),
        ],
    )
    assert events.profile(db, "u-game", now=NOW) == before == {"pizza": before["pizza"]}
    assert "game_round_finished" not in events.WEIGHTS and "game_card_discovered" not in events.WEIGHTS
