"""Cliente HTTP prudente para rappi.cl: pausas, reintentos y ubicación de despacho."""

import base64
import contextlib
import json
import logging
import random
import time
from urllib.parse import quote, urlparse

import requests

from .. import config
from .next_data import ParseError, extract_next_data

log = logging.getLogger(__name__)


class StoreUnavailable(Exception):
    """Rappi redirigió al listado de tiendas: la sucursal no despacha a la ubicación actual."""


class RestaurantGone(Exception):
    """Rappi redirigió a /restaurantes?restaurantNotFound=true: el restaurante ya no existe.

    No es un error de lectura: el job queda omitido, no fallido."""


class PageNotFound(Exception):
    """La página no existe (p. ej. un sub-pasillo cuyo slug no coincide)."""


# Errores esperables al bajar y leer una página: se registran y se sigue con la siguiente.
PAGE_ERRORS = (PageNotFound, ParseError, requests.RequestException, RuntimeError)


def location_cookie(lat: float, lng: float, city: str, address: str) -> str:
    """Valor de la cookie `currentLocation`: base64 del JSON codificado como URL."""
    payload = {
        "city": city,
        "autoLocation": False,
        "address": address,
        "lat": lat,
        "lng": lng,
        "url": "",
        "active": True,
    }
    return base64.b64encode(quote(json.dumps(payload)).encode()).decode()


class RappiClient:
    def __init__(self) -> None:
        self._session = requests.Session()
        self._session.headers.update(
            {
                "User-Agent": config.USER_AGENT,
                "Accept-Language": "es-CL,es;q=0.9",
            }
        )

    def set_location(self, lat: float, lng: float, city: str, address: str) -> None:
        self._session.cookies.set(
            "currentLocation",
            location_cookie(lat, lng, city, address),
            domain="www.rappi.cl",
        )

    def clear_location(self) -> None:
        """Quita la ubicación de despacho (las páginas de cadena solo listan sucursales cercanas a ella)."""
        with contextlib.suppress(KeyError):  # no había ubicación
            self._session.cookies.clear(domain="www.rappi.cl", path="/", name="currentLocation")

    def get_content(self, url: str) -> bytes:
        """Descarga una URL y devuelve el cuerpo en bytes (p. ej. sitemaps .xml.gz)."""
        return self._request(url).content

    def get_json(self, url: str) -> dict:
        """Descarga una URL y devuelve un JSON."""
        return self._request(url).json()

    def get_next_data(self, path: str) -> dict:
        """Descarga una página de rappi.cl y devuelve su __NEXT_DATA__."""
        response = self._request(config.BASE_URL + path)
        final = urlparse(response.url)
        if final.path.startswith(config.UNAVAILABLE_PATH_PREFIX) and not path.startswith(
            config.UNAVAILABLE_PATH_PREFIX
        ):
            raise StoreUnavailable(f"{path} redirigió a {final.path}")
        if config.RESTAURANT_NOT_FOUND_QUERY in final.query:
            raise RestaurantGone(f"{path} ya no existe en Rappi")
        return extract_next_data(response.text)

    def _request(self, url: str) -> requests.Response:
        for attempt in range(1, config.MAX_RETRIES + 1):
            time.sleep(random.uniform(*config.REQUEST_DELAY_RANGE))
            try:
                response = self._session.get(url, timeout=config.TIMEOUT_SECONDS)
            except requests.RequestException as exc:
                log.warning("Error de red en %s (intento %d): %s", url, attempt, exc)
            else:
                if response.status_code == 404:
                    raise PageNotFound(url)
                if response.status_code < 400:
                    return response
                if response.status_code not in (429, 500, 502, 503, 504):
                    response.raise_for_status()
                log.warning("HTTP %d en %s (intento %d)", response.status_code, url, attempt)
            time.sleep(config.RETRY_BACKOFF_SECONDS * attempt)
        raise RuntimeError(f"No se pudo descargar {url} tras {config.MAX_RETRIES} intentos")
