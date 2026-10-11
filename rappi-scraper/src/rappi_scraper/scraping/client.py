"""Cliente HTTP prudente para rappi.cl: pausas, reintentos y ubicación de despacho."""

import base64
import contextlib
import json
import logging
import random
import time
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from urllib.parse import quote, urlparse

import requests

from .. import config
from .next_data import MissingNextData, ParseError, extract_next_data

log = logging.getLogger(__name__)


class StoreUnavailable(Exception):
    """Rappi redirigió al listado de tiendas: la sucursal no despacha a la ubicación actual."""


class RestaurantGone(Exception):
    """Rappi redirigió a /restaurantes?restaurantNotFound=true: el restaurante ya no existe.

    No es un error de lectura: el job queda omitido, no fallido."""


class PageNotFound(Exception):
    """La página no existe (p. ej. un sub-pasillo cuyo slug no coincide)."""


class PossibleBlock(Exception):
    """rappi.cl podría estar bloqueando la descarga: demasiados requests (o jobs) seguidos rechazados.

    No es un error de página (no está en PAGE_ERRORS): ningún pasillo, sucursal ni job lo atrapa, y la corrida se
    detiene abierta para retomarla más tarde."""


# Errores esperables al bajar y leer una página: se registran y se sigue con la siguiente.
PAGE_ERRORS = (PageNotFound, ParseError, requests.RequestException, RuntimeError)
RETRY_STATUSES = (429, 500, 502, 503, 504)
BLOCK_STATUSES = (403, 429)


def _retry_after(response: requests.Response) -> float | None:
    """Segundos que pide `Retry-After` (un número o una fecha HTTP), con tope; None si no lo trae o no se entiende."""
    value = (response.headers.get("Retry-After") or "").strip()
    if not value:
        return None
    try:
        seconds = float(value)
    except ValueError:
        try:
            seconds = (parsedate_to_datetime(value) - datetime.now(UTC)).total_seconds()
        except (TypeError, ValueError):
            return None
    return min(max(seconds, 0), config.RETRY_AFTER_MAX_S)


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
    """Cliente de rappi.cl. `TIMEOUT_SECONDS` es por operación de socket (conectar, cada lectura), no un plazo total:
    una respuesta que gotea bytes sin parar no tiene tope. Se acepta así: las páginas de Rappi llegan enteras o se
    cortan, y una que se corta cae en el reintento."""

    def __init__(self) -> None:
        self._blocked_streak = 0  # requests seguidos rechazados (403, 429, desafío)
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
        content = self._request(url).content
        self._blocked_streak = 0
        return content

    def get_json(self, url: str) -> dict:
        """Descarga una URL y devuelve un JSON."""
        data = self._request(url).json()
        self._blocked_streak = 0
        return data

    def get_next_data(self, path: str) -> dict:
        """Descarga una página de rappi.cl y devuelve su __NEXT_DATA__."""
        response = self._request(config.BASE_URL + path)
        final = urlparse(response.url)
        if final.path.startswith(config.UNAVAILABLE_PATH_PREFIX) and not path.startswith(
            config.UNAVAILABLE_PATH_PREFIX
        ):
            self._blocked_streak = 0
            raise StoreUnavailable(f"{path} redirigió a {final.path}")
        if config.RESTAURANT_NOT_FOUND_QUERY in final.query:
            self._blocked_streak = 0
            raise RestaurantGone(f"{path} ya no existe en Rappi")
        # Sin charset, requests decodifica text/html como Latin-1 y rompe las ñ y las tildes; rappi.cl sirve UTF-8.
        if response.encoding is None or response.encoding.lower() == "iso-8859-1":
            response.encoding = "utf-8"
        try:
            data = extract_next_data(response.text)
        except MissingNextData:
            self._count_rejection(path, "página sin __NEXT_DATA__")
            raise
        self._blocked_streak = 0
        return data

    def _count_rejection(self, url: str, reason: str) -> None:
        self._blocked_streak += 1
        if self._blocked_streak >= config.BLOCK_STREAK_REQUESTS:
            raise PossibleBlock(
                f"posible bloqueo: {self._blocked_streak} requests seguidos rechazados (último: {reason} en {url})"
            )

    def _request(self, url: str) -> requests.Response:
        for attempt in range(1, config.MAX_RETRIES + 1):
            time.sleep(random.uniform(*config.REQUEST_DELAY_RANGE))
            wait = None
            try:
                response = self._session.get(url, timeout=config.TIMEOUT_SECONDS)
            except requests.RequestException as exc:
                log.warning("Error de red en %s (intento %d): %s", url, attempt, exc)
            else:
                if response.status_code == 404:
                    self._blocked_streak = 0
                    raise PageNotFound(url)
                if response.status_code < 400:
                    return response
                if response.status_code in BLOCK_STATUSES:
                    self._count_rejection(url, f"HTTP {response.status_code}")
                if response.status_code not in RETRY_STATUSES:
                    response.raise_for_status()
                log.warning("HTTP %d en %s (intento %d)", response.status_code, url, attempt)
                wait = _retry_after(response)
            if attempt < config.MAX_RETRIES:  # tras el último intento la URL ya se da por perdida: no se espera
                time.sleep(wait if wait is not None else config.RETRY_BACKOFF_SECONDS * 2 ** (attempt - 1))
        raise RuntimeError(f"No se pudo descargar {url} tras {config.MAX_RETRIES} intentos")
