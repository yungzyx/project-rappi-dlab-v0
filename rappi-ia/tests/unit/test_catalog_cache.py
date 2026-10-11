"""La caché del catálogo: un valor se reutiliza mientras no haya una corrida nueva ni pase su TTL."""

import pytest

from rappi_ia.catalog import cache


class FakeConn:
    """Responde la última corrida terminada (`catalog_version`) y cuenta cuántas veces se preguntó."""

    def __init__(self, run_id: int | None = 7):
        self.run_id = run_id
        self.asked = 0

    def execute(self, sql, params=None):
        assert "scrape_runs" in sql
        self.asked += 1
        return self

    def fetchone(self):
        return (self.run_id,)


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


@pytest.fixture
def clock(monkeypatch):
    clock = Clock()
    monkeypatch.setattr(cache, "_now", clock)
    cache.clear()
    yield clock
    cache.clear()


def _counter():
    calls = []

    def compute():
        calls.append(1)
        return {"vez": len(calls)}

    return compute, calls


def test_cache_hits_same_version(clock):
    conn, (compute, calls) = FakeConn(), _counter()

    first = cache.cached("home", conn, compute)
    clock.now += cache.VERSION_TTL_S + 1  # vuelve a preguntar la versión: la misma
    second = cache.cached("home", conn, compute)

    assert first is second and calls == [1]
    assert conn.asked == 2
    assert cache.cached("otra", conn, compute) == {"vez": 2}  # cada nombre es su propia entrada


def test_new_run_invalidates(clock):
    conn, (compute, _) = FakeConn(), _counter()
    cache.cached("home", conn, compute)

    conn.run_id = 8  # terminó una corrida nueva
    assert cache.cached("home", conn, compute) == {"vez": 1}  # la versión se reutiliza unos segundos
    clock.now += cache.VERSION_TTL_S + 1

    assert cache.cached("home", conn, compute) == {"vez": 2}
    assert cache.catalog_version(conn) == 8


def test_value_expires_after_its_ttl(clock):
    """Lo que cambia sin corrida (`make post-refresh`, `make layers`) se ve cuando vence el TTL."""
    conn, (compute, _) = FakeConn(), _counter()
    cache.cached("home", conn, compute, ttl_s=60)

    clock.now += 59
    assert cache.cached("home", conn, compute, ttl_s=60) == {"vez": 1}
    clock.now += 2
    assert cache.cached("home", conn, compute, ttl_s=60) == {"vez": 2}


def test_version_is_asked_at_most_once_per_window(clock):
    """Una búsqueda pide el conteo de 8 verticales: la versión se consulta una vez, no ocho."""
    conn, (compute, _) = FakeConn(), _counter()
    for vertical in range(8):
        cache.cached(f"docs:{vertical}", conn, compute)
    assert conn.asked == 1


def test_empty_catalog_has_version_zero(clock):
    assert cache.catalog_version(FakeConn(None)) == 0
