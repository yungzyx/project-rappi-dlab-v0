import base64
import json
from urllib.parse import unquote

import pytest
import requests

from rappi_scraper import config
from rappi_scraper.scraping import client as client_module
from rappi_scraper.scraping.client import PageNotFound, RappiClient, StoreUnavailable, location_cookie

NEXT_DATA_HTML = '<script id="__NEXT_DATA__" type="application/json">{"props": {"pageProps": {}}}</script>'


class _Response:
    def __init__(self, status_code: int, url: str = config.BASE_URL + "/x", text: str = NEXT_DATA_HTML):
        self.status_code = status_code
        self.url = url
        self.text = text

    def raise_for_status(self):
        raise requests.HTTPError(f"HTTP {self.status_code}")


@pytest.fixture
def client(monkeypatch):
    """Cliente sin pausas reales; `responses` define lo que devuelve cada GET, en orden."""
    monkeypatch.setattr(client_module.time, "sleep", lambda _seconds: None)
    c = RappiClient()
    c.responses = []
    c.calls = 0

    def fake_get(url, timeout):
        c.calls += 1
        item = c.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    monkeypatch.setattr(c._session, "get", fake_get)
    return c


def test_location_cookie_roundtrip():
    cookie = location_cookie(-33.4, -70.6, "Santiago", "Av. Ñuñoa 1")
    payload = json.loads(unquote(base64.b64decode(cookie).decode()))
    assert payload["lat"] == -33.4
    assert payload["address"] == "Av. Ñuñoa 1"


def test_clear_location_removes_cookie_and_is_idempotent():
    client = RappiClient()
    client.set_location(-33.4, -70.6, "Santiago", "x")
    client.clear_location()
    assert "currentLocation" not in client._session.cookies
    client.clear_location()


def test_404_raises_page_not_found_without_retry(client):
    client.responses = [_Response(404)]
    with pytest.raises(PageNotFound):
        client.get_next_data("/tiendas/1")
    assert client.calls == 1


def test_retries_on_5xx_and_network_errors_then_succeeds(client):
    client.responses = [_Response(503), requests.ConnectionError("caída"), _Response(200)]
    assert client.get_next_data("/tiendas/1") == {"props": {"pageProps": {}}}
    assert client.calls == 3


def test_gives_up_after_max_retries(client):
    client.responses = [_Response(502)] * config.MAX_RETRIES
    with pytest.raises(RuntimeError):
        client.get_next_data("/tiendas/1")
    assert client.calls == config.MAX_RETRIES


def test_other_4xx_raises_http_error(client):
    client.responses = [_Response(403)]
    with pytest.raises(requests.HTTPError):
        client.get_next_data("/tiendas/1")


def test_redirect_to_store_listing_means_store_unavailable(client):
    client.responses = [_Response(200, url=config.BASE_URL + "/tiendas/tipo/market")]
    with pytest.raises(StoreUnavailable):
        client.get_next_data("/tiendas/1-jumbo")


def test_listing_pages_are_not_treated_as_unavailable(client):
    client.responses = [_Response(200, url=config.BASE_URL + "/tiendas/tipo/rappimall-parent")]
    assert client.get_next_data("/tiendas/tipo/super")
