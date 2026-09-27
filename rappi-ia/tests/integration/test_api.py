"""API contra `rappi_ia_test`, con el modelo falso de embeddings y sin modelos de voz ni foto."""

import json

import pytest
from fastapi.testclient import TestClient
from rappi_scraper.storage.search import build_search_documents

from conftest import add_price, add_product, add_store
from rappi_ia.agent.bigotes import Bigotes
from rappi_ia.agent.compose import TemplateComposer
from rappi_ia.api import app as api
from rappi_ia.api.services import Services
from rappi_ia.concepts.pipeline import build_concepts
from rappi_ia.embeddings.base import HashEmbedder
from rappi_ia.embeddings.text_store import embed_search_documents


@pytest.fixture
def client(db):
    add_store(db, 1, "supermercado", "Súper")
    add_store(db, 2, "licores", "Botillería")
    for pid, name, store, category, price in [
        (100, "Papas fritas Lays Clásicas 180 g", 1, "Snacks salados", 1990),
        (101, "Ramitas Evercrisp Queso 250 g", 1, "Snacks salados", 1590),
        (102, "Papas Kryzpo Original 130 g", 1, "Snacks salados", 2290),
        (200, "Cerveza Escudo Lata 470 cc", 2, "Cervezas", 1290),
        (201, "Cerveza Kunstmann Torobayo 330 cc", 2, "Cervezas", 2990),
        (202, "Cerveza Cristal Botella 1 L", 2, "Cervezas", 1990),
    ]:
        add_product(db, pid, name, store, category)
        add_price(db, store, pid, price)
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    embedder = HashEmbedder()
    embed_search_documents(db, embedder)

    def conn_override():
        yield db

    api.app.dependency_overrides[api.get_conn] = conn_override
    api.app.dependency_overrides[api.get_services] = lambda: Services(Bigotes(embedder, TemplateComposer()), embedder)
    yield TestClient(api.app)
    api.app.dependency_overrides.clear()


def test_health_reports_capabilities(client):
    body = client.get("/health").json()
    assert body["ok"] and body["documentos"] > 0
    assert body["capacidades"]["busqueda_semantica"] == "hash-test"
    assert body["capacidades"]["voz"] is False


def test_chat_accepts_prototype_vertical_and_logs_redacted_query(client, db):
    body = client.post(
        "/chat",
        json={
            "message": "cerveza, llámame al +56 9 1234 5678",
            "vertical": "liquor",
            "user_id": "u1",
            "session_id": "s1",
        },
    ).json()

    assert body["vertical"] == "licores" and body["prototype_vertical"] == "liquor"
    assert {p["concept"] for p in body["products"]} == {"cerveza"}
    assert body["suggestion"]["vertical"] == "supermercado"
    query, concept, source = db.execute(
        "SELECT query, concept_id, source FROM app_events WHERE type = 'chat'"
    ).fetchone()
    assert "[teléfono]" in query and "5678" not in query
    assert (concept, source) == ("cerveza", "prototype")


def test_rappi_hoy_mode_has_no_suggestion_and_does_not_learn(client, db):
    body = client.post(
        "/chat",
        json={"message": "cerveza", "vertical": "liquor", "user_id": "u1", "session_id": "s1", "mode": "actual"},
    ).json()
    assert "suggestion" not in body
    assert db.execute("SELECT concept_id FROM app_events WHERE type = 'chat'").fetchone()[0] is None


def test_events_orders_profile_recommendations_and_forget(client, db):
    events = [
        {
            "type": "cart_add",
            "session_id": "s1",
            "vertical": "liquor",
            "concept_id": "cerveza",
            "entity_type": "catalog_item",
            "entity_id": "200",
            "cart_id": "c1",
            "value": 1290,
        },
        {"type": "search", "session_id": "s1", "vertical": "liquor", "concept_id": "cerveza", "query": "chelas"},
    ]
    assert client.post("/events", json={"user_id": "u1", "events": events}).json() == {"guardados": 2}
    order = client.post(
        "/orders",
        json={
            "user_id": "u1",
            "session_id": "s1",
            "cart_id": "c1",
            "vertical": "liquor",
            "lines": [{"entity_type": "catalog_item", "entity_id": "200", "concept_id": "cerveza", "unit_price": 1290}],
        },
    ).json()
    assert order["order_id"].startswith("ord-")

    profile = client.get("/profile/u1").json()
    assert profile["interests"][0]["concept"] == "cerveza"

    recs = client.get("/recommendations", params={"user_id": "u1", "vertical": "liquor"}).json()
    assert recs["rows"][0]["concept"] == "snacks-salados" and recs["rows"][0]["vertical"] == "supermercado"

    forgotten = client.delete("/profile/u1", params={"concept": "cerveza"}).json()
    assert forgotten["eventos_borrados"] >= 2
    assert client.get("/profile/u1").json()["interests"] == []


def test_invalid_event_type_and_vertical_are_rejected(client):
    bad = client.post("/events", json={"user_id": "u1", "events": [{"type": "hack", "session_id": "s"}]})
    assert bad.status_code == 400
    assert client.get("/search", params={"q": "cerveza", "vertical": "aerolineas"}).status_code == 400


def test_order_without_catalog_vertical_is_a_400_not_a_500(client, db):
    line = {"entity_type": "catalog_item", "entity_id": "proto:1"}
    for vertical in ["otro", "pet"]:
        order = {"user_id": "u1", "session_id": "s", "cart_id": "c", "vertical": vertical, "lines": [line]}
        assert client.post("/orders", json=order).status_code == 400
    assert db.execute("SELECT count(*) FROM app_orders").fetchone()[0] == 0


def test_beacon_accepts_text_plain_without_cors_preflight(client, db):
    """sendBeacon con JSON necesitaría preflight (y el navegador lo bloquea): el prototipo manda text/plain."""
    events = [{"type": "app_open", "session_id": "s1"}, {"type": "cart_add", "session_id": "s1", "vertical": "turbo"}]
    sent = client.post(
        "/events/beacon",
        content=json.dumps({"user_id": "u-beacon", "events": events}),
        headers={"content-type": "text/plain;charset=UTF-8", "origin": "http://localhost:5174"},
    )
    assert sent.status_code == 204
    rows = db.execute("SELECT type, vertical FROM app_events WHERE user_id = 'u-beacon' ORDER BY event_id").fetchall()
    assert rows == [("app_open", None), ("cart_add", "turbo")]
    assert (
        client.post("/events/beacon", content="{no es json", headers={"content-type": "text/plain"}).status_code == 422
    )


def test_search_honours_mode_and_detects_query_concepts(client, monkeypatch):
    from rappi_ia.agent import tools

    modes, real = [], tools.retrieve
    monkeypatch.setattr(tools, "retrieve", lambda *a, **kw: modes.append(kw["mode"]) or real(*a, **kw))
    assert client.get("/search", params={"q": "cerveza", "vertical": "licores", "mode": "vector"}).json()["products"]
    assert set(modes) == {"vector"}  # antes siempre corría el híbrido
    # Con los conceptos detectados, "cerveza" solo trae cervezas (antes pasaba concepts=[] y no había foco).
    hybrid = client.get("/search", params={"q": "cerveza", "vertical": "supermercado"}).json()
    assert hybrid["products"] == [] and hybrid["unmet"]
    assert client.get("/search", params={"q": "cerveza", "vertical": "licores", "mode": "otro"}).status_code == 400


def test_search_and_analytics(client):
    found = client.get("/search", params={"q": "cerveza", "vertical": "liquor", "price_max": 2000}).json()
    assert {p["entity_id"] for p in found["products"]} == {"200", "202"}

    client.post("/events", json={"user_id": "u2", "events": [{"type": "app_open", "session_id": "s9"}]})
    kpis = client.get("/analytics/kpis", params={"source": "prototype"}).json()
    assert kpis["source"] == "prototype" and kpis["data"]["usuarios_activos"] == 1
    assert client.get("/analytics/nada").status_code == 404
    assert "cobertura" in client.get("/analytics/catalog").json()["data"]


def test_voice_and_photo_need_their_models(client):
    assert client.post("/chat/voice", files={"audio": ("a.wav", b"123", "audio/wav")}).status_code == 503
    assert client.post("/chat/photo", files={"image": ("a.jpg", b"123", "image/jpeg")}).status_code == 503


def test_unknown_vertical_and_nul_bytes_do_not_break_chat(client):
    for vertical in ("pet", "xyz"):
        r = client.post("/chat", json={"message": "cerveza", "vertical": vertical})
        assert r.status_code == 200, vertical
    assert client.post("/chat", json={"message": "cerve\u0000za", "vertical": "liquor"}).status_code == 200
    bad = {
        "user_id": "u9",
        "events": [{"type": "search", "session_id": "s", "query": "a\u0000b", "payload": {"k": "\u0000"}}],
    }
    assert client.post("/events", json=bad).status_code == 200


def test_uploads_reject_dangerous_or_huge_files():
    import io
    import wave

    import pytest
    from fastapi import HTTPException
    from PIL import Image

    with pytest.raises(HTTPException) as eps:
        api._open_image(b"%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 10 10\nshowpage\n")
    assert eps.value.status_code == 400
    huge = io.BytesIO()
    Image.new("1", (9000, 9000)).save(huge, format="PNG")  # pocos KB en disco, 81 MP en memoria
    with pytest.raises(HTTPException):
        api._open_image(huge.getvalue())
    ok = io.BytesIO()
    Image.new("RGB", (800, 600), "red").save(ok, format="JPEG")
    assert api._open_image(ok.getvalue()).size[0] <= 336

    long_audio = io.BytesIO()
    with wave.open(long_audio, "wb") as w:
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(8000)
        w.writeframes(b"\x00\x00" * 8000 * 25)  # 25 s de silencio
    with pytest.raises(HTTPException) as too_long:
        api._check_audio_length(long_audio.getvalue())
    assert too_long.value.status_code == 413
