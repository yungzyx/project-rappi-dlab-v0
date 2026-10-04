"""API contra `rappi_ia_test`, con el modelo falso de embeddings y sin modelos de voz ni foto."""

import json
import math

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
    assert recs["rows"][0]["reason"] == "Porque te interesa 🍺 cerveza"

    forgotten = client.delete("/profile/u1", params={"concept": "cerveza"}).json()
    assert forgotten["eventos_borrados"] >= 2
    assert client.get("/profile/u1").json()["interests"] == []


def test_invalid_event_type_and_vertical_are_rejected(client):
    bad = client.post("/events", json={"user_id": "u1", "events": [{"type": "hack", "session_id": "s"}]})
    assert bad.status_code == 400
    assert client.get("/search", params={"q": "cerveza", "vertical": "aerolineas"}).status_code == 400


def test_screen_vertical_without_documents_does_not_turn_everything_into_unmet_demand(client, db):
    """Turbo tiene tiendas pero aún no documentos: antes cada pregunta en esa pantalla era "no está" y demanda."""
    add_store(db, 9, "turbo", "Turbo")
    db.commit()
    r = client.post("/chat", json={"message": "quiero cerveza", "vertical": "turbo", "user_id": "u", "session_id": "s"})
    body = r.json()
    assert body["vertical"] == "licores" and body["products"] and not body["unmet"]  # sin conveniencia: lo deduce


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
    over = io.BytesIO()  # 49 MP: sobre el tope de 40, bajo el doble (donde Pillow recién corta)
    Image.new("1", (7000, 7000)).save(over, format="PNG")
    with pytest.raises(HTTPException) as too_big:
        api._open_image(over.getvalue())
    assert too_big.value.status_code == 400
    ok = io.BytesIO()
    Image.new("RGB", (800, 600), "red").save(ok, format="JPEG")
    assert api._open_image(ok.getvalue()).size[0] <= 336


def test_long_audio_is_rejected_before_whisper():
    import io
    import wave

    import pytest
    from fastapi import HTTPException

    pytest.importorskip("av")  # viene con el extra audio (faster-whisper); sin él /chat/voice responde 503 antes
    long_audio = io.BytesIO()
    with wave.open(long_audio, "wb") as w:
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(8000)
        w.writeframes(b"\x00\x00" * 8000 * 25)  # 25 s de silencio
    with pytest.raises(HTTPException) as too_long:
        api._check_audio_length(long_audio.getvalue())
    assert too_long.value.status_code == 413


def _streamed_webm(seconds: float) -> bytes:
    """Opus en WebM escrito sin retroceder, como MediaRecorder: la cabecera no trae la duración."""
    import io

    av = pytest.importorskip("av")
    import numpy as np

    class Stream(io.RawIOBase):
        def __init__(self):
            self.data = bytearray()

        def writable(self):
            return True

        def seekable(self):
            return False

        def write(self, chunk):
            self.data += chunk
            return len(chunk)

    out, frame = Stream(), 960
    with av.open(out, "w", format="webm") as container:
        stream = container.add_stream("libopus", rate=48000)
        stream.layout = "mono"
        for i in range(int(seconds * 48000 / frame)):
            silence = av.AudioFrame.from_ndarray(np.zeros((1, frame), dtype=np.int16), format="s16", layout="mono")
            silence.sample_rate, silence.pts = 48000, i * frame
            for packet in stream.encode(silence):
                container.mux(packet)
        for packet in stream.encode():
            container.mux(packet)
    return bytes(out.data)


def test_long_webm_without_duration_is_rejected_before_whisper():
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as too_long:
        api._check_audio_length(_streamed_webm(25))
    assert too_long.value.status_code == 413
    api._check_audio_length(_streamed_webm(5))  # una frase normal pasa


def test_voice_only_accepts_audio_types(client):
    class Transcriber:
        def transcribe(self, audio):
            raise AssertionError("no debería llegar a Whisper")

    embedder = HashEmbedder()
    services = Services(Bigotes(embedder, TemplateComposer()), embedder, transcriber=Transcriber())
    api.app.dependency_overrides[api.get_services] = lambda: services
    response = client.post("/chat/voice", files={"audio": ("a.bin", b"123", "application/octet-stream")})
    assert response.status_code == 415


def test_voice_and_photo_respect_topics_already_shown(client):
    """Texto → voz o foto en la misma sesión: la sugerencia de snacks no se repite (regla 3 de diseno-ia.md §4)."""
    import io
    import wave

    import numpy as np
    from PIL import Image

    from rappi_ia.agent.audio import Transcript
    from rappi_ia.agent.photo import PhotoReading

    pytest.importorskip("av")

    class Transcriber:
        def transcribe(self, audio):
            return Transcript("cerveza", 0.9, False, False)

    class PhotoReader:
        def read(self, picture):
            return PhotoReading("cerveza", 0.9, None, np.zeros(512, dtype=np.float32))

    embedder = HashEmbedder()
    services = Services(
        Bigotes(embedder, TemplateComposer()), embedder, PhotoReader(), "clip-test", transcriber=Transcriber()
    )
    api.app.dependency_overrides[api.get_services] = lambda: services
    speech = io.BytesIO()
    with wave.open(speech, "wb") as w:
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(8000)
        w.writeframes(b"\x00\x00" * 8000)
    photo = io.BytesIO()
    Image.new("RGB", (64, 64), "yellow").save(photo, format="JPEG")
    uploads = {
        "/chat/voice": {"audio": ("voz.wav", speech.getvalue(), "audio/wav")},
        "/chat/photo": {"image": ("foto.jpg", photo.getvalue(), "image/jpeg")},
    }

    for path, files in uploads.items():
        first = client.post(path, files=files, data={"vertical": "liquor"}).json()
        again = client.post(path, files=files, data={"vertical": "liquor", "shown_topics": "snacks-salados"}).json()
        assert first["suggestion"]["vertical"] == "supermercado", path
        assert "suggestion" not in again, path


def test_beacon_rejects_huge_or_broken_bodies(client):
    """Al cerrar la pestaña llega lo que quedó en cola: un cuerpo enorme o roto no se guarda a medias."""
    headers = {"content-type": "text/plain"}
    huge = client.post("/events/beacon", content=b"x" * (api.MAX_BEACON_BYTES + 1), headers=headers)
    broken = client.post("/events/beacon", content=b'{"user_id": "u1", "events": [', headers=headers)
    assert (huge.status_code, broken.status_code) == (413, 422)


def test_database_down_is_a_clear_503_not_a_500(monkeypatch):
    """Con Postgres caído la API responde enseguida y claro; el prototipo cae a su cerebro local."""
    monkeypatch.setenv("DATABASE_URL", "postgresql://127.0.0.1:1/rappi")  # nadie escucha en el puerto 1
    api.app.dependency_overrides.clear()
    response = TestClient(api.app, raise_server_exceptions=False).get("/profile/u1")
    assert response.status_code == 503
    assert response.json() == {"detail": "Base de datos no disponible"}


def test_the_prototype_cannot_forget_or_write_on_behalf_of_simulated_users(client, db):
    """Con la API abierta a la red (demo en el iPhone), DELETE /profile/syn-… borraba usuarios simulados del panel y
    /events podía colgarles eventos: los ids simulados son correlativos."""
    from rappi_ia.events import store as events

    events.ensure_user(db, "syn-7-00001", "synthetic")
    events.record(db, [events.Event("syn-7-00001", "s1", "app_open")], source="synthetic")
    db.commit()

    assert client.delete("/profile/syn-7-00001").json()["eventos_borrados"] == 0
    assert db.execute("SELECT count(*) FROM app_events WHERE user_id = 'syn-7-00001'").fetchone()[0] == 1
    sent = client.post("/events", json={"user_id": "syn-7-00001", "events": [{"type": "app_open", "session_id": "s"}]})
    assert sent.status_code == 400
    order = {"user_id": "syn-7-00001", "session_id": "s", "cart_id": "c", "vertical": "licores",
             "lines": [{"entity_type": "catalog_item", "entity_id": "1"}]}  # fmt: skip
    assert client.post("/orders", json=order).status_code == 400


def test_the_beacon_only_accepts_the_apps_origin(client, db):
    """Llega como text/plain, sin preflight: cualquier página abierta podía escribir eventos (y texto en el panel)."""
    body = json.dumps({"user_id": "u-evil", "events": [{"type": "app_open", "session_id": "s"}]})
    headers = {"content-type": "text/plain"}
    assert (
        client.post("/events/beacon", content=body, headers={**headers, "origin": "https://evil.com"}).status_code
        == 403
    )
    assert (
        client.post("/events/beacon", content=body, headers={**headers, "origin": "http://localhost:5174"}).status_code
        == 204
    )
    assert (
        client.post("/events/beacon", content=body, headers=headers).status_code == 204
    )  # curl en la red de confianza


def test_events_and_chat_have_size_limits(client):
    big = "x" * 1000
    for event in (
        {"type": "app_open", "session_id": "s", "concept_id": big},
        {"type": "app_open", "session_id": "s", "vertical": big},
        {"type": "app_open", "session_id": "s", "payload": {"x": "y" * 5000}},
        {"type": "app_open", "session_id": "s", "payload": {f"k{i}": 1 for i in range(50)}},
    ):
        assert client.post("/events", json={"user_id": "u-big", "events": [event]}).status_code == 422
    huge_profile = {f"c{i}": 1.0 for i in range(500)}
    assert client.post("/chat", json={"message": "cerveza", "profile": huge_profile}).status_code == 422


def test_sensitive_suggestions_never_show_in_the_panel(client, db):
    from rappi_ia.events import store as events

    events.record(
        db,
        [events.Event("u-s", "s", "suggestion_shown", concept_id="salud-sexual", vertical="farmacia")],
        source="prototype",
    )
    db.commit()
    rows = client.get("/analytics/suggestions?source=prototype").json()["data"]
    assert not any("Salud sexual" in row["concepto"] for row in rows)


# Entradas raras (revisión de robustez del 04-10): nunca un 500. Antes, NUL, NaN/Infinity, enteros enormes, surrogates
# sueltos y JSON muy anidado tumbaban la petición.
DEEP = '{"a":' * 3000 + "1" + "}" * 3000
EV = {"type": "search", "session_id": "s1", "query": "vino"}


def _post_raw(c, path, body=None, raw=None):
    if raw is not None:
        return c.post(path, content=raw, headers={"content-type": "application/json"})
    return c.post(path, content=json.dumps(body, allow_nan=True), headers={"content-type": "application/json"})


CASES = [
    ("events vacío", "/events", {"user_id": "revision-u", "events": []}, None),
    ("events 201", "/events", {"user_id": "revision-u", "events": [EV] * 201}, None),
    ("events tipo raro", "/events", {"user_id": "revision-u", "events": [{**EV, "type": "hack"}]}, None),
    ("events payload NaN", "/events", {"user_id": "revision-u", "events": [{**EV, "payload": {"x": math.nan}}]}, None),
    ("events payload inf", "/events", {"user_id": "revision-u", "events": [{**EV, "payload": {"x": math.inf}}]}, None),
    ("events value NaN", "/events", {"user_id": "revision-u", "events": [{**EV, "value": math.nan}]}, None),
    ("events value inf", "/events", {"user_id": "revision-u", "events": [{**EV, "value": math.inf}]}, None),
    ("events results 1e12", "/events", {"user_id": "revision-u", "events": [{**EV, "results": 10**12}]}, None),
    ("events results 1e30", "/events", {"user_id": "revision-u", "events": [{**EV, "results": 10**30}]}, None),
    ("events concepto raro", "/events", {"user_id": "revision-u", "events": [{**EV, "concept_id": "zzz"}]}, None),
    ("events vertical rara", "/events", {"user_id": "revision-u", "events": [{**EV, "vertical": "marte"}]}, None),
    ("events vertical larga", "/events", {"user_id": "revision-u", "events": [{**EV, "vertical": "x" * 10000}]}, None),
    ("events concept largo", "/events", {"user_id": "revision-u", "events": [{**EV, "concept_id": "x" * 10000}]}, None),
    ("events type largo", "/events", {"user_id": "revision-u", "events": [{**EV, "type": "x" * 10000}]}, None),
    (
        "events surrogate",
        "/events",
        None,
        b'{"user_id":"revision-u","events":[{"type":"search","session_id":"s","query":"\\ud83d"}]}',
    ),
    (
        "events payload surrogate key",
        "/events",
        None,
        b'{"user_id":"revision-u","events":[{"type":"search","session_id":"s","payload":{"\\ud83d":1}}]}',
    ),
    (
        "events payload profundo",
        "/events",
        None,
        b'{"user_id":"revision-u","events":[{"type":"search","session_id":"s","payload":' + DEEP.encode() + b"}]}",
    ),
    (
        "events payload grande",
        "/events",
        {"user_id": "revision-u", "events": [{**EV, "payload": {"x": "y" * 5_000_000}}]},
        None,
    ),
    (
        "events NUL",
        "/events",
        {"user_id": "revision-\x00", "events": [{**EV, "query": "\x00\x00", "payload": {"\x00": "\x00"}}]},
        None,
    ),
    ("events JSON malo", "/events", None, b'{"user_id":'),
    ("beacon malo", "/events/beacon", None, b"nope"),
    (
        "beacon surrogate",
        "/events/beacon",
        None,
        b'{"user_id":"revision-u","events":[{"type":"search","session_id":"s","query":"\\ud83d"}]}',
    ),
    (
        "beacon NaN",
        "/events/beacon",
        None,
        b'{"user_id":"revision-u","events":[{"type":"search","session_id":"s","payload":{"x":NaN}}]}',
    ),
    (
        "orders sin líneas",
        "/orders",
        {"user_id": "revision-u", "session_id": "s", "cart_id": "c", "vertical": "licores", "lines": []},
        None,
    ),
    (
        "orders vertical rara",
        "/orders",
        {
            "user_id": "revision-u",
            "session_id": "s",
            "cart_id": "c",
            "vertical": "marte",
            "lines": [{"entity_type": "catalog_item", "entity_id": "1"}],
        },
        None,
    ),
    (
        "orders precio NaN",
        "/orders",
        {
            "user_id": "revision-u",
            "session_id": "s",
            "cart_id": "c",
            "vertical": "licores",
            "lines": [{"entity_type": "catalog_item", "entity_id": "1", "unit_price": math.nan}],
        },
        None,
    ),
    (
        "orders precio inf",
        "/orders",
        {
            "user_id": "revision-u",
            "session_id": "s",
            "cart_id": "c",
            "vertical": "licores",
            "lines": [{"entity_type": "catalog_item", "entity_id": "1", "unit_price": math.inf}],
        },
        None,
    ),
    (
        "orders precio 1e20",
        "/orders",
        {
            "user_id": "revision-u",
            "session_id": "s",
            "cart_id": "c",
            "vertical": "licores",
            "lines": [{"entity_type": "catalog_item", "entity_id": "1", "unit_price": 1e20}],
        },
        None,
    ),
    (
        "orders precio negativo",
        "/orders",
        {
            "user_id": "revision-u",
            "session_id": "s",
            "cart_id": "c",
            "vertical": "liquor",
            "lines": [{"entity_type": "catalog_item", "entity_id": "1", "unit_price": -5}],
        },
        None,
    ),
    (
        "orders concept largo",
        "/orders",
        {
            "user_id": "revision-u",
            "session_id": "s",
            "cart_id": "c",
            "vertical": "licores",
            "lines": [{"entity_type": "catalog_item", "entity_id": "1", "concept_id": "x" * 5000}],
        },
        None,
    ),
    (
        "orders mismo cart 2 veces",
        "/orders",
        {
            "user_id": "revision-u",
            "session_id": "s",
            "cart_id": "c",
            "vertical": "licores",
            "lines": [{"entity_type": "catalog_item", "entity_id": "1"}],
        },
        None,
    ),
    ("chat con log surrogate", "/chat", None, b'{"message":"cerveza \\ud83d","user_id":"revision-u","session_id":"s"}'),
    (
        "chat con log 500",
        "/chat",
        {"message": "cerveza " + "9" * 492, "user_id": "revision-u", "session_id": "s"},
        None,
    ),
]


GET_CASES = ["/search?q=vino%00&vertical=licores", "/profile/%00", "/recommendations?user_id=%00"]


@pytest.mark.parametrize(("name", "path", "body", "raw"), CASES, ids=[c[0] for c in CASES])
def test_odd_inputs_never_return_500(client, db, name, path, body, raw):
    response = _post_raw(client, path, body, raw)
    db.rollback()
    assert response.status_code < 500, f"{name}: {response.status_code}"


@pytest.mark.parametrize("path", GET_CASES)
def test_odd_query_params_never_return_500(client, path):
    assert client.get(path).status_code < 500


def test_demo_chat_suggestion_order_reaches_the_panel(client):
    """El camino de la demo: Bigotes sugiere algo de otra vertical, se acepta, se pide y el panel lo cuenta."""
    chat = client.post(
        "/chat", json={"message": "cerveza", "vertical": "liquor", "user_id": "u1", "session_id": "s1"}
    ).json()
    sug = chat["suggestion"]
    assert sug["vertical"] == "supermercado" and sug["prototype_vertical"] == "grocery"
    product = sug["products"][0]
    concept, vertical = sug["concept"], sug["prototype_vertical"]
    # Lo que manda el prototipo (AssistantPanel.noteSuggestion, AddButton, checkout).
    shown = {"concept_id": concept, "vertical": vertical, "payload": {"origen": "chat"}}
    sent = [
        {"type": "suggestion_shown", "session_id": "s1", **shown},
        {"type": "suggestion_accepted", "session_id": "s1", **shown},
        {
            "type": "cart_add",
            "session_id": "s1",
            "vertical": vertical,
            "concept_id": concept,
            "cart_id": "c1",
            "entity_type": "catalog_item",
            "entity_id": product["entity_id"],
            "payload": {"from_suggestion": True},
        },
        {"type": "checkout_start", "session_id": "s1", "vertical": vertical, "cart_id": "c1"},
    ]
    assert client.post("/events", json={"user_id": "u1", "events": sent}).json() == {"guardados": 4}
    client.post(
        "/orders",
        json={
            "user_id": "u1",
            "session_id": "s1",
            "cart_id": "c1",
            "vertical": vertical,
            "lines": [
                {
                    "entity_type": "catalog_item",
                    "entity_id": product["entity_id"],
                    "concept_id": concept,
                    "unit_price": product["price_value"],
                    "from_suggestion": True,
                }
            ],
        },
    ).raise_for_status()

    # Otro pedido del mismo concepto que NO vino de la sugerencia: no es una conversión.
    client.post(
        "/orders",
        json={
            "user_id": "u1",
            "session_id": "s2",
            "cart_id": "c2",
            "vertical": vertical,
            "lines": [
                {
                    "entity_type": "catalog_item",
                    "entity_id": product["entity_id"],
                    "concept_id": concept,
                    "unit_price": product["price_value"],
                    "from_suggestion": False,
                }
            ],
        },
    ).raise_for_status()

    panel = lambda name: client.get(f"/analytics/{name}", params={"source": "prototype"}).json()["data"]  # noqa: E731
    [row] = panel("suggestions")
    assert (row["vertical"], row["mostradas"], row["aceptadas"], row["convertidas"]) == ("supermercado", 1, 1, 1)
    funnel = {r["vertical"]: r for r in panel("funnel")}
    assert funnel["supermercado"] == {"vertical": "supermercado", "buscan": 1, "agregan": 1, "pagan": 1, "piden": 1}
    assert panel("kpis")["pedidos_30d"] == 2


def test_chat_follows_up_on_the_previous_turn(client):
    first = client.post("/chat", json={"message": "cerveza", "vertical": "liquor"}).json()
    previous = {"query": first["intent"]["query"], "concepts": first["intent"]["concepts"], "vertical": "liquor"}
    follow = client.post("/chat", json={"message": "más barata", "previous": previous}).json()
    assert follow["intent"]["follow_up"] and follow["vertical"] == "licores"
    assert {p["concept"] for p in follow["products"]} == {"cerveza"}
