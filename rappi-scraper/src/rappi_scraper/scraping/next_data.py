"""Lectura del JSON de Next.js (`<script id="__NEXT_DATA__">`) que traen todas las páginas de rappi.cl."""

import json
import re

_NEXT_DATA_RE = re.compile(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S)


class ParseError(Exception):
    """La página no tiene la estructura esperada (Rappi pudo cambiar su frontend)."""


def extract_next_data(html: str) -> dict:
    match = _NEXT_DATA_RE.search(html)
    if not match:
        raise ParseError("No se encontró <script id='__NEXT_DATA__'> en la página")
    return json.loads(match.group(1))


def page_props(next_data: dict) -> dict:
    try:
        return next_data["props"]["pageProps"]
    except KeyError as exc:
        raise ParseError("__NEXT_DATA__ sin props.pageProps") from exc


def components(response: dict | None) -> list[dict]:
    """`response.data.components`, la forma en que Rappi entrega bloques de pasillos y productos."""
    return ((response or {}).get("data") or {}).get("components") or []
