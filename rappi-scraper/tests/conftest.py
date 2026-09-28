from pathlib import Path

import pytest

from rappi_scraper.scraping.client import RestaurantGone, StoreUnavailable
from rappi_scraper.scraping.next_data import ParseError, extract_next_data
from rappi_scraper.storage.db import connect, database_url, migrate

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def load_page(name: str) -> dict:
    """`__NEXT_DATA__` de una página real guardada en tests/fixtures/<name>.html."""
    return extract_next_data((FIXTURES_DIR / f"{name}.html").read_text(encoding="utf-8"))


class FakeClient:
    """Sirve fixtures según la ruta. `unavailable` y `failing_once` simulan tiendas caídas y errores."""

    def __init__(self, pages: dict[str, str] | None = None, unavailable=(), failing_once=(), gone=()):
        self.pages = pages or {}
        self.unavailable = set(unavailable)
        self.gone = set(gone)
        self.failing_once = set(failing_once)
        self.requested: list[str] = []

    def set_location(self, *args):
        pass

    def clear_location(self):
        pass

    def get_next_data(self, path: str) -> dict:
        self.requested.append(path)
        if path in self.unavailable:
            raise StoreUnavailable(path)
        if path in self.gone:
            raise RestaurantGone(path)
        if path in self.failing_once:
            self.failing_once.discard(path)
            raise ParseError("respuesta incompleta")
        if path in self.pages:
            return load_page(self.pages[path])
        depth = path.count("/")  # /tiendas/x -> tienda, /tiendas/x/a -> pasillo, /tiendas/x/a/b -> sub-pasillo
        return load_page({2: "store", 3: "aisle", 4: "subaisle"}[depth])


@pytest.fixture
def page():
    return load_page


@pytest.fixture
def db():
    """Conexión a `rappi_test` con el esquema recreado desde cero para cada test."""
    try:
        url = database_url("DATABASE_URL_TEST")
    except RuntimeError:
        pytest.skip("DATABASE_URL_TEST no configurada")
    with connect(url) as conn:
        conn.execute("DROP SCHEMA public CASCADE")
        conn.execute("CREATE SCHEMA public")
        conn.commit()
        migrate(conn)
        yield conn
