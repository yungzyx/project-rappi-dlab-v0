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


def _fetcher():
    """`fetch(faltantes)` de `cached_many`: anota qué le pidieron y devuelve el largo de cada clave."""
    asked = []

    def fetch(keys):
        asked.append(list(keys))
        return {key: len(key) for key in keys}

    return fetch, asked


def test_many_fetches_only_what_is_missing(clock):
    conn, (fetch, asked) = FakeConn(), _fetcher()

    assert cache.cached_many("df:turbo", conn, ["papas", "frit"], fetch) == {"papas": 5, "frit": 4}
    assert cache.cached_many("df:turbo", conn, ["frit", "sal"], fetch) == {"frit": 4, "sal": 3}

    assert asked == [["papas", "frit"], ["sal"]]
    assert cache.cached_many("df:mall", conn, ["papas"], fetch) == {"papas": 5}  # cada prefijo es aparte
    assert asked[-1] == ["papas"]


def test_many_follows_the_catalog_version_and_the_ttl(clock):
    conn, (fetch, asked) = FakeConn(), _fetcher()
    cache.cached_many("df:turbo", conn, ["papas"], fetch)

    conn.run_id = 8  # corrida nueva
    clock.now += cache.VERSION_TTL_S + 1
    cache.cached_many("df:turbo", conn, ["papas"], fetch)
    clock.now += cache.DEFAULT_TTL_S + 1  # vence sin corrida
    cache.cached_many("df:turbo", conn, ["papas"], fetch)

    assert asked == [["papas"], ["papas"], ["papas"]]


def test_many_is_bounded_and_forgets_the_least_recently_used(clock, monkeypatch):
    """Las palabras que la gente busca no tienen fin: la caché guarda a lo más MANY_MAX y olvida la usada hace más
    tiempo."""
    monkeypatch.setattr(cache, "MANY_MAX", 3)
    conn, (fetch, asked) = FakeConn(), _fetcher()
    cache.cached_many("df", conn, ["a", "b", "c"], fetch)
    cache.cached_many("df", conn, ["a"], fetch)  # «a» pasa a ser la más reciente

    cache.cached_many("df", conn, ["d"], fetch)  # entra «d» y sale «b»
    cache.cached_many("df", conn, ["a", "c", "d"], fetch)
    cache.cached_many("df", conn, ["b"], fetch)

    assert asked == [["a", "b", "c"], ["d"], ["b"]]
    assert len(cache._many) == 3


def test_clear_also_forgets_many(clock):
    conn, (fetch, asked) = FakeConn(), _fetcher()
    cache.cached_many("df", conn, ["a"], fetch)
    cache.clear()
    cache.cached_many("df", conn, ["a"], fetch)

    assert asked == [["a"], ["a"]]
