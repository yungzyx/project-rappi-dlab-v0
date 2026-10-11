"""Límites de la API sin base: cupos por ruta, tamaño del cuerpo, solicitudes por IP, tope diario de Claude y el beacon
que valida antes de pedir conexión."""

import logging
import threading
import types
from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient

from rappi_ia import config
from rappi_ia.agent import compose
from rappi_ia.agent.compose import ClaudeComposer, DailyCallCap, Draft, TemplateComposer
from rappi_ia.api import app as api
from rappi_ia.api import limits

ANSWER = {"kind": "resultados", "text": "Mira estas opciones.", "products": [], "intent": {"kind": "buscar"}}


@pytest.fixture
def opened():
    """Cada vez que la API pide una conexión (de un request o del connector del beacon)."""
    return []


@pytest.fixture
def client(opened):
    def conn_override():
        opened.append("get_conn")
        yield SimpleNamespace(commit=lambda: None, execute=lambda *_: None)  # solo el statement_timeout del panel

    @contextmanager
    def connection():
        opened.append("connector")
        yield SimpleNamespace(commit=lambda: None)

    agent = types.SimpleNamespace(reply=lambda *_: dict(ANSWER))
    api.app.dependency_overrides[api.get_conn] = conn_override
    api.app.dependency_overrides[api.get_connector] = lambda: connection
    api.app.dependency_overrides[api.get_services] = lambda: types.SimpleNamespace(agent=agent, embedder=None)
    yield TestClient(api.app)
    api.app.dependency_overrides.clear()


@contextmanager
def full(cap):
    """Ocupa todos los cupos de una ruta, como si otros requests estuvieran adentro."""
    taken = 0
    while cap.slots.acquire(blocking=False):
        taken += 1
    try:
        yield
    finally:
        for _ in range(taken):
            cap.slots.release()


def test_cap_full_returns_503_with_retry_after(client):
    with full(api.SEARCH_CAP):
        reply = client.get("/search", params={"q": "vino", "vertical": "licores"})

    assert reply.status_code == 503
    assert reply.headers["retry-after"] == "2"
    assert reply.json()["detail"] == "Hay mucha gente ahora; intenta en unos segundos."


def test_cap_resolves_before_connection(client, opened):
    """Un request que no tiene cupo no ocupa una conexión del pool mientras espera: ni la pide."""
    with full(api.ASK_CAP):
        assert client.post("/agent/ask", json={"message": "una hamburguesa"}).status_code == 503
    assert opened == []

    assert client.post("/agent/ask", json={"message": "una hamburguesa"}).status_code == 200  # se liberó
    assert opened == ["get_conn"]


def test_each_expensive_route_has_its_cap(client, opened):
    from rappi_ia.api import agent as agent_api

    order = {"user_id": "u1", "session_id": "s", "cart_id": "c", "vertical": "licores", "lines": []}
    order["lines"] = [{"entity_type": "catalog_item", "entity_id": "1"}]
    requests = [
        (api.ASK_CAP, lambda: client.post("/agent/ask", json={"message": "vino"})),
        (api.SEARCH_CAP, lambda: client.get("/search", params={"q": "vino"})),
        (
            agent_api.OFFER_CAP,
            lambda: client.post("/agent/offer", json={"moment": "plan", "context": {"occasion": "x"}}),
        ),
        (api.ORDERS_CAP, lambda: client.post("/orders", json=order)),
    ]
    for cap, send in requests:
        with full(cap):
            assert send().status_code == 503, cap.name
    assert opened == []


def test_the_panel_waits_its_turn_instead_of_failing(client, opened, monkeypatch):
    """El panel pide ~16 métricas a la vez: con un cupo que rechaza al tiro, casi todas caerían a los datos guardados.
    Su cupo hace fila (hasta el tope del panel) en vez de responder 503."""
    assert api.ANALYTICS_CAP.wait_s == config.API_TIMEOUT_ANALYTICS_MS / 1000
    assert api.ASK_CAP.wait_s == 0  # las rutas de la app sí rechazan al tiro

    monkeypatch.setitem(api.ANALYTICS, "kpis", lambda conn, source: {"usuarios": 0})
    replies = []
    with full(api.ANALYTICS_CAP):
        waiting = threading.Thread(target=lambda: replies.append(client.get("/analytics/kpis").status_code))
        waiting.start()
    waiting.join()  # se liberó un cupo: el que esperaba entra

    assert replies == [200]


def test_a_waiting_cap_gives_up_after_its_wait(monkeypatch):
    cap = limits.concurrency_cap("lento", 1, wait_s=0.2)
    app = FastAPI()

    @app.get("/lento", dependencies=[Depends(cap)])
    def slow() -> dict:
        return {"ok": True}

    with full(cap):
        reply = TestClient(app).get("/lento")

    assert reply.status_code == 503 and reply.headers["retry-after"] == "2"
    assert TestClient(app).get("/lento").status_code == 200


def test_caps_take_their_size_from_config():
    assert api.ASK_CAP.limit == config.API_MAX_CONCURRENT_ASK == 4
    assert api.SEARCH_CAP.limit == config.API_MAX_CONCURRENT_SEARCH == 8
    assert api.ORDERS_CAP.limit == config.API_MAX_CONCURRENT_ORDERS == 4
    assert api.ANALYTICS_CAP.limit == config.API_MAX_CONCURRENT_ANALYTICS == 2


def _echo_app(**rate) -> FastAPI:
    app = FastAPI()

    @app.post("/echo")
    async def echo(request: Request) -> dict:
        return {"bytes": len(await request.body())}

    @app.get("/ping")
    def ping() -> dict:
        return {"ok": True}

    app.add_middleware(limits.MaxBodySize, max_bytes=100)
    if rate:
        app.add_middleware(limits.RateLimit, **rate)
    return app


def test_body_over_limit_is_413():
    client = TestClient(_echo_app())

    assert client.post("/echo", content=b"x" * 100).json() == {"bytes": 100}
    declared = client.post("/echo", content=b"x" * 101)  # por Content-Length, sin leer el cuerpo
    assert declared.status_code == 413
    assert declared.json()["detail"] == "Solicitud demasiado grande"

    def chunks():  # sin Content-Length: se cuenta lo que llega
        for _ in range(5):
            yield b"x" * 30

    assert client.post("/echo", content=chunks()).status_code == 413


def test_the_api_caps_every_body():
    """Un JSON enorme para /orders o /agent/ask se corta antes de leerlo entero (Starlette lo leía a memoria)."""
    reply = TestClient(api.app).post(
        "/agent/ask", content=b"x" * (config.API_MAX_BODY_BYTES + 1), headers={"content-type": "application/json"}
    )
    assert reply.status_code == 413
    assert config.API_MAX_BODY_BYTES == 524_288


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_rate_limit_429_then_recovers():
    clock = Clock()
    client = TestClient(_echo_app(per_minute=3, writes_per_minute=2, clock=clock))

    assert [client.get("/ping").status_code for _ in range(3)] == [200, 200, 200]
    blocked = client.get("/ping")
    assert blocked.status_code == 429
    assert blocked.json()["detail"] == "Demasiadas solicitudes; espera un momento."
    assert 1 <= int(blocked.headers["retry-after"]) <= 120

    clock.now += 2 * limits.RateLimit.WINDOW_S  # pasó la ventana: vuelve a responder
    assert client.get("/ping").status_code == 200


def test_rate_limit_counts_writes_apart():
    clock = Clock()
    client = TestClient(_echo_app(per_minute=10, writes_per_minute=2, clock=clock))

    assert [client.post("/echo", content=b"{}").status_code for _ in range(3)] == [200, 200, 429]
    assert client.get("/ping").status_code == 200  # las lecturas tienen su propio tope


def test_rate_limit_retry_after_says_when_it_frees():
    clock = Clock()
    limiter = limits.RateLimit(None, per_minute=2, writes_per_minute=0, clock=clock)

    assert limiter.wait("1.2.3.4", write=False) == 0
    assert limiter.wait("1.2.3.4", write=False) == 0
    retry = limiter.wait("1.2.3.4", write=False)
    assert retry > 0
    clock.now += retry
    assert limiter.wait("1.2.3.4", write=False) == 0  # a la hora que dijo, ya pasa


def test_rate_limit_memory_is_bounded():
    limiter = limits.RateLimit(None, per_minute=5, writes_per_minute=5, max_clients=10, clock=Clock())

    for i in range(1000):
        limiter.wait(f"10.0.{i // 256}.{i % 256}", write=True)

    assert len(limiter.clients) == 10
    assert "10.0.3.231" in limiter.clients  # se quedan las últimas IPs, no las primeras


def test_rate_limit_zero_is_off():
    limiter = limits.RateLimit(None, per_minute=0, writes_per_minute=0, clock=Clock())

    assert all(limiter.wait("1.2.3.4", write=True) == 0 for _ in range(500))
    assert limiter.clients == {}


def test_rate_limit_exempt_hosts():
    limiter = limits.RateLimit(None, per_minute=1, writes_per_minute=1, exempt=("127.0.0.1",), clock=Clock())

    assert all(limiter.wait("127.0.0.1", write=True) == 0 for _ in range(5))
    assert limiter.wait("1.2.3.4", write=False) == 0
    assert limiter.wait("1.2.3.4", write=False) > 0


RESULTS = Draft(kind="resultados", concept_label="🍺 Cerveza", vertical_label="Licores", product_names=["Escudo"])


def _composer(calls: list) -> ClaudeComposer:
    def create(**_):
        calls.append(1)
        return SimpleNamespace(
            stop_reason="end_turn", content=[SimpleNamespace(type="text", text='{"text": "Te dejo {p1}."}')]
        )

    composer = ClaudeComposer.__new__(ClaudeComposer)  # sin red ni clave
    composer.model, composer._fallback = "claude-sonnet-5", TemplateComposer()
    composer._client = SimpleNamespace(messages=SimpleNamespace(create=create))
    return composer


def test_llm_daily_cap_uses_template(monkeypatch, caplog):
    monkeypatch.setattr(config, "LLM_DAILY_CALL_CAP", 2)
    monkeypatch.setattr(ClaudeComposer, "calls", DailyCallCap())
    calls = []
    composer = _composer(calls)

    with caplog.at_level(logging.WARNING, logger="rappi_ia.agent.compose"):
        texts = [composer.compose(RESULTS) for _ in range(4)]

    assert texts[:2] == ["Te dejo Escudo."] * 2
    assert texts[2:] == [TemplateComposer().compose(RESULTS)] * 2
    assert len(calls) == 2
    warnings = [r.getMessage() for r in caplog.records if "Tope diario" in r.getMessage()]
    assert warnings == ["Tope diario de redacción con Claude alcanzado (2): se usan plantillas."]  # una sola vez


def test_llm_daily_cap_resets_each_santiago_day(monkeypatch):
    monkeypatch.setattr(config, "LLM_DAILY_CALL_CAP", 1)
    monkeypatch.setattr(ClaudeComposer, "calls", DailyCallCap())
    day = ["2026-10-11"]
    monkeypatch.setattr(compose, "_santiago_today", lambda: day[0])
    calls = []
    composer = _composer(calls)

    composer.compose(RESULTS)
    composer.compose(RESULTS)
    day[0] = "2026-10-12"
    composer.compose(RESULTS)

    assert len(calls) == 2


def test_llm_daily_cap_zero_never_calls(monkeypatch):
    monkeypatch.setattr(config, "LLM_DAILY_CALL_CAP", 0)
    monkeypatch.setattr(ClaudeComposer, "calls", DailyCallCap())
    calls = []

    assert _composer(calls).compose(RESULTS) == TemplateComposer().compose(RESULTS)
    assert calls == []


def test_beacon_bad_origin_opens_no_connection(client, opened, monkeypatch):
    monkeypatch.setattr(api.events, "record", lambda conn, events, source: len(events))
    headers = {"content-type": "text/plain"}
    body = '{"user_id": "u1", "events": []}'

    assert (
        client.post("/events/beacon", content=body, headers={**headers, "origin": "https://evil.com"}).status_code
        == 403
    )
    assert client.post("/events/beacon", content=b"x" * (api.MAX_BEACON_BYTES + 1), headers=headers).status_code == 413
    assert client.post("/events/beacon", content="{roto", headers=headers).status_code == 422
    bad_type = '{"user_id": "u1", "events": [{"type": "order_placed", "session_id": "s"}]}'
    assert client.post("/events/beacon", content=bad_type, headers=headers).status_code == 400
    assert opened == []

    assert client.post("/events/beacon", content=body, headers=headers).status_code == 204
    assert opened == ["connector"]  # la conexión se abre solo para guardar
