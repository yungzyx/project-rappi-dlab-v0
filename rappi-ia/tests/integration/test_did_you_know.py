"""«¿Sabías que…?»: /agent/ask suma un dato del juego ligado a lo que la persona buscó, con las guardias de ofertas."""

import copy

import pytest
from fastapi.testclient import TestClient
from psycopg.types.json import Jsonb

from rappi_ia import config
from rappi_ia.agent.compose import TemplateComposer
from rappi_ia.agent.rappi_agent import RappiAgent
from rappi_ia.api import app as api
from rappi_ia.api.services import Services
from rappi_ia.demo.seed import seed_demo
from rappi_ia.embeddings.base import HashEmbedder
from rappi_ia.game.cards import did_you_know

# «pizza» está ligado solo a restaurantes-01, un dato de una vertical permitida; el catálogo de prueba lo entiende.
QUERY = "pizza"
CARD_ID = "restaurantes-01"

STATE = {
    "version": 1,
    "xp": 0,
    "discovered": {},
    "correct": {},
    "answered": {},
    "cards": [],
    "opened": [],
    "daily": {"date": "2026-10-10", "discovered": 0, "correct": 0, "opened": 0, "done": False},
    "streak": {"count": 0, "lastDate": None},
    "seenIntro": True,
    "visited": [],
}


@pytest.fixture
def client(db, monkeypatch):
    seed_demo(db)
    monkeypatch.setattr(config, "GAME_MIN_ITEMS", 1)
    embedder = HashEmbedder()

    def conn_override():
        yield db

    api.app.dependency_overrides[api.get_conn] = conn_override
    api.app.dependency_overrides[api.get_services] = lambda: Services(
        RappiAgent(embedder, TemplateComposer()), embedder
    )
    yield TestClient(api.app)
    api.app.dependency_overrides.clear()


def ask(client, message: str = QUERY, **extra):
    reply = client.post("/agent/ask", json={"message": message, "vertical": "restaurants", **extra})
    assert reply.status_code == 200, reply.text
    return reply.json()


def save_state(client, user_id: str, **changes):
    state = copy.deepcopy(STATE) | changes
    assert client.put(f"/game/state/{user_id}", json={"state": state}).status_code == 200


# ── Cuándo aparece ───────────────────────────────────────────────────────────
def test_ask_adds_a_fact_linked_to_the_searched_concept(client, db):
    body = ask(client)

    assert body["intent"]["concepts"] == ["pizza"]
    card = next(c for c in client.get("/game/cards").json()["cards"] if c["id"] == CARD_ID)
    assert body["did_you_know"] == {
        "id": CARD_ID,
        "vertical": "restaurantes",
        "title": card["title"],
        "text": card["text"],
        "source": card["source"],
    }


def test_fact_already_discovered_is_not_repeated(client):
    save_state(client, "u-dato", discovered={"restaurantes": [CARD_ID]}, cards=[CARD_ID])

    assert "did_you_know" not in ask(client, user_id="u-dato", session_id="s-dato")


def test_fact_only_in_discovered_is_not_repeated(client):
    save_state(client, "u-dato", discovered={"restaurantes": [CARD_ID]}, cards=[])

    assert "did_you_know" not in ask(client, user_id="u-dato", session_id="s-dato")


def test_fact_in_the_collection_is_not_repeated(client):
    save_state(client, "u-dato", cards=[CARD_ID])

    assert "did_you_know" not in ask(client, user_id="u-dato", session_id="s-dato")


def test_next_fact_comes_after_the_discovered_one(db):
    seed_demo(db)
    # frutas: supermercado-04, -05 y -06 (turbo-04 también); en el orden del archivo, el primero que falta.
    first = did_you_know(db, ["frutas"], None)
    state = copy.deepcopy(STATE) | {"cards": [first["id"]]}
    db.execute("INSERT INTO app_users (user_id, source) VALUES ('u-dato', 'prototype')")
    db.execute("INSERT INTO game_state (user_id, state) VALUES ('u-dato', %s)", (Jsonb(state),))

    second = did_you_know(db, ["frutas"], "u-dato")

    assert first["id"] == "supermercado-04"
    assert second["id"] == "supermercado-05"


def test_concept_order_comes_before_card_order(db):
    seed_demo(db)

    assert did_you_know(db, ["pizza", "frutas"], None)["id"] == CARD_ID
    assert did_you_know(db, ["frutas", "pizza"], None)["id"] == "supermercado-04"


def test_questions_are_never_the_fact(db):
    seed_demo(db)
    db.execute(
        "INSERT INTO knowledge_card_concepts (card_id, concept_id, method) SELECT card_id, 'sushi', 'manual' "
        "FROM knowledge_cards WHERE kind = 'pregunta' LIMIT 3"
    )

    facts = {did_you_know(db, ["sushi"], None)["id"]}

    assert facts == {"restaurantes-02"}


def test_mode_actual_has_no_fact(client):
    assert "did_you_know" not in ask(client, mode="actual")


# ── Guardias ─────────────────────────────────────────────────────────────────
def test_no_fact_from_farmacia_or_licores(client, db):
    linked = db.execute(
        """SELECT c.vertical, c.kind FROM knowledge_card_concepts l JOIN knowledge_cards c USING (card_id)
           WHERE l.concept_id = 'cerveza'"""
    ).fetchall()
    assert ("licores", "dato") in linked  # la liga existe: es la guardia la que la deja fuera

    body = ask(client, "cerveza")

    assert body["intent"]["concepts"] == ["cerveza"]
    assert "did_you_know" not in body


@pytest.mark.parametrize("blocked_card", ["licores-01", "farmacia-01"])
def test_blocked_vertical_card_is_skipped_even_if_nothing_else_flags_it(db, blocked_card):
    seed_demo(db)
    # Sin sus ligas propias (licores-01 va a «vino», +18): solo la vertical la deja fuera.
    db.execute("DELETE FROM knowledge_card_concepts WHERE card_id IN (%s, 'restaurantes-01')", (blocked_card,))
    db.execute(
        "INSERT INTO knowledge_card_concepts (card_id, concept_id, method) VALUES (%s, 'pizza', 'manual')",
        (blocked_card,),
    )

    assert did_you_know(db, ["pizza"], None) is None


@pytest.mark.parametrize("concept", ["medicamentos", "cerveza"])
def test_no_fact_linked_to_a_sensitive_or_age_restricted_concept(db, concept):
    seed_demo(db)
    flags = db.execute("SELECT sensitive, age_restricted FROM concepts WHERE concept_id = %s", (concept,)).fetchone()
    assert flags[0] or flags[1]
    # Una tarjeta permitida, ligada a un concepto inocente y también a uno sensible o +18.
    db.execute(
        "INSERT INTO knowledge_card_concepts (card_id, concept_id, method) VALUES (%s, %s, 'manual')",
        (CARD_ID, concept),
    )

    assert did_you_know(db, ["pizza"], None) is None
    assert did_you_know(db, [concept], None) is None


# ── Aislamiento ──────────────────────────────────────────────────────────────
def test_database_error_in_the_fact_does_not_break_the_answer(client, db, monkeypatch, caplog):
    def broken(conn, concept_ids, user_id):
        conn.execute("SELECT * FROM tabla_que_no_existe")  # deja la transacción abortada, como un error real

    monkeypatch.setattr(api, "did_you_know", broken)

    with caplog.at_level("WARNING", logger=api.log.name):
        body = ask(client)

    assert body["products"]
    assert "did_you_know" not in body
    assert "¿Sabías que…?" in caplog.text
    monkeypatch.setattr(api, "did_you_know", did_you_know)
    assert db.execute("SELECT 1").fetchone() == (1,)  # la conexión quedó usable
    assert ask(client)["did_you_know"]["id"] == CARD_ID


# ── Sin dato ─────────────────────────────────────────────────────────────────
def test_query_without_linked_card_has_no_key(client, db):
    body = ask(client, "arroz")

    assert body["intent"]["concepts"]
    assert db.execute(
        "SELECT count(*) FROM knowledge_card_concepts WHERE concept_id = ANY(%s)", (body["intent"]["concepts"],)
    ).fetchone() == (0,)
    assert "did_you_know" not in body


def test_response_without_intent_has_no_key(client):
    body = ask(client, "hola")

    assert "intent" not in body or not body["intent"].get("concepts")
    assert "did_you_know" not in body
