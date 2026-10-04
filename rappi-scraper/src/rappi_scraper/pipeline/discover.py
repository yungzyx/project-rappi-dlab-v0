"""Descubrimiento: qué tiendas hay en cada vertical y qué restaurantes/cadenas existen.

Crea los jobs de la corrida. Modo catálogo: un job por formato de tienda (`store_type`,
que identifica marca + formato, p. ej. 'lider' o 'casaideas_multitiendas_enc') y un job
por cadena de restaurantes; los restaurantes independientes van uno por uno.
"""

import gzip
import logging
import re
from collections import defaultdict

from psycopg import Connection

from .. import config
from ..scraping.client import PAGE_ERRORS, RappiClient, StoreUnavailable
from ..scraping.listing_parser import parse_brand_chain, parse_vertical_listing
from ..scraping.store_metadata import normalize_stores
from ..storage import repository

log = logging.getLogger(__name__)

# Vertical canónico -> listado de Rappi. Turbo no tiene listado propio: sale del subvertical.
VERTICAL_LISTINGS = {
    "supermercado": "/tiendas/tipo/market",
    "conveniencia": "/tiendas/tipo/express-big",
    "mall": "/tiendas/tipo/rappimall-parent",
    "farmacia": "/tiendas/tipo/farma",
    "licores": "/tiendas/tipo/licores",
    "chocolateria": "/tiendas/tipo/chocolateria",
}
MIN_STORES_PER_CITY = 3
MAX_CANDIDATES = 5
SITEMAP_BASE = "https://www.rappi.cl/sitemaps/country/cl/"
CHAIN_SITEMAP = SITEMAP_BASE + "sitemap-restaurant-brand-chain-country-cl-0.xml.gz"
PARTNER_SITEMAP = SITEMAP_BASE + "sitemap-restaurant-partner-cl-0.xml.gz"
_RESTAURANT_ID_RE = re.compile(r"/restaurantes/(\d+)")


def canonical_vertical(listing_vertical: str, store: dict) -> str:
    """Turbo es un vertical propio aunque Rappi lo muestre dentro de otros listados."""
    if store.get("subvertical") == "Turbo" or store.get("store_type", "").startswith("turbo"):
        return "turbo"
    return listing_vertical


def city_locations(metadata: dict) -> list[dict]:
    """Un punto de despacho por ciudad (desde el listado público S3), Santiago primero.

    Se usa la tienda con más reseñas y no el promedio de coordenadas: el promedio puede caer
    fuera de la zona de despacho (pasó en Viña del Mar y Antofagasta) y el listado da 404.
    """
    by_city = defaultdict(list)
    for store in normalize_stores(metadata):
        by_city[store["city"]].append(store)
    cities = []
    for city, stores in by_city.items():
        if len(stores) < MIN_STORES_PER_CITY:
            continue
        anchor = max(stores, key=lambda s: s["reviews"])
        cities.append({"city": city, "lat": anchor["lat"], "lng": anchor["lng"], "stores": len(stores)})
    return sorted(cities, key=lambda c: (c["city"] != "Santiago de Chile", -c["stores"]))


def discover_stores(
    conn: Connection, client: RappiClient, run_id: int, verticals: list[str], cities: list[dict]
) -> int:
    """Recorre los listados de cada vertical en cada ciudad y crea un job por formato de tienda.

    Parte de los jobs pendientes de la corrida, así redescubrir algunas ciudades suma
    candidatas y verticales en vez de reemplazar lo ya descubierto.
    """
    groups = repository.pending_payloads(conn, run_id, "store_group")
    for city in cities:
        client.set_location(city["lat"], city["lng"], city["city"], city["city"])
        for vertical in verticals:
            try:
                listing = parse_vertical_listing(client.get_next_data(VERTICAL_LISTINGS[vertical]))
            except (*PAGE_ERRORS, StoreUnavailable) as exc:
                log.warning("Listado %s en %s falló: %s", vertical, city["city"], exc)
                continue
            log.info("%-22s %-13s %3d tiendas", city["city"], vertical, len(listing))
            for store in listing:
                store_vertical = canonical_vertical(vertical, store)
                if not store["store_type"]:
                    # Solo salió en filtros: si su página ya dijo que es Turbo (lo guardó save_crawl), sigue en Turbo.
                    saved = repository.saved_store_format(conn, store["store_id"])
                    store_vertical = canonical_vertical(store_vertical, saved)
                repository.upsert_store(conn, {**store, "city": city["city"]})
                repository.upsert_store_vertical(
                    conn,
                    store["store_id"],
                    store_vertical,
                    store["subvertical"],
                    store["landing_classification"],
                    store["filters"],
                )
                _add_candidate(groups, store, store_vertical, city)
            conn.commit()
        # Guardar la cola después de cada ciudad: si algo falla, no se pierde lo descubierto.
        repository.add_jobs(
            conn,
            run_id,
            [{"job_key": key, "job_type": "store_group", "payload": payload} for key, payload in groups.items()],
        )
    return len(groups)


def _add_candidate(groups: dict, store: dict, vertical: str, city: dict) -> None:
    # Sin store_type (tiendas que solo aparecen en filtros) no se puede agrupar por marca.
    key = f"type:{store['store_type']}" if store["store_type"] else f"id:{store['store_id']}"
    group = groups.setdefault(key, {"store_type": store["store_type"], "verticals": [], "candidates": []})
    if vertical not in group["verticals"]:
        group["verticals"].append(vertical)
    known = {c["store_id"] for c in group["candidates"]}
    if store["store_id"] not in known and len(group["candidates"]) < MAX_CANDIDATES:
        group["candidates"].append(
            {
                "store_id": store["store_id"],
                "path": store["path"],
                "city": city["city"],
                "lat": city["lat"],
                "lng": city["lng"],
            }
        )


def _sitemap_urls(client: RappiClient, url: str) -> list[str]:
    xml = gzip.decompress(client.get_content(url)).decode("utf-8")
    return re.findall(r"<loc>([^<]+)</loc>", xml)


def _add_chain_job(conn: Connection, run_id: int, chain: dict, jobs: list, chain_store_ids: set) -> None:
    repository.upsert_brand(conn, chain["brand_id"], chain["name"], "restaurant")
    chain_store_ids.update(s["store_id"] for s in chain["stores"])
    if not chain["stores"]:
        conn.commit()
        return
    job = {
        "job_key": f"chain:{chain['brand_id']}",
        "job_type": "restaurant",
        "payload": {
            "verticals": ["restaurantes"],
            "brand_id": chain["brand_id"],
            "name": chain["name"],
            "candidates": [{"store_id": s["store_id"], "path": s["path"]} for s in chain["stores"][:MAX_CANDIDATES]],
        },
    }
    jobs.append(job)
    repository.add_jobs(conn, run_id, [job])  # se guarda al tiro (y hace commit)


def discover_restaurants(
    conn: Connection,
    client: RappiClient,
    run_id: int,
    max_chains: int | None = None,
    max_independents: int | None = None,
) -> int:
    """Un job por cadena (con sus sucursales como candidatas) y uno por restaurante independiente."""
    # Sin ubicación la página de cadena lista todas sus sucursales; con ubicación, solo las cercanas.
    client.clear_location()
    jobs, chain_store_ids = [], set()
    chain_urls = _sitemap_urls(client, CHAIN_SITEMAP)[:max_chains]
    failed = []
    # Segunda pasada solo con las que fallaron (suelen ser errores transitorios de Rappi).
    for attempt, urls in enumerate((chain_urls, failed)):
        for chain_url in list(urls):
            try:
                chain = parse_brand_chain(client.get_next_data(chain_url.replace(config.BASE_URL, "")))
            except (*PAGE_ERRORS, StoreUnavailable) as exc:
                log.warning("Cadena %s falló (intento %d): %s", chain_url, attempt + 1, exc)
                if attempt == 0:
                    failed.append(chain_url)
                continue
            _add_chain_job(conn, run_id, chain, jobs, chain_store_ids)
    log.info("%d cadenas, %d sucursales en cadenas", len(jobs), len(chain_store_ids))

    independents = []
    for url in _sitemap_urls(client, PARTNER_SITEMAP):
        match = _RESTAURANT_ID_RE.search(url)
        if match and int(match.group(1)) not in chain_store_ids:
            store_id = int(match.group(1))
            independents.append(
                {
                    "job_key": f"rest:{store_id}",
                    "job_type": "restaurant",
                    "payload": {
                        "verticals": ["restaurantes"],
                        "candidates": [{"store_id": store_id, "path": url.replace(config.BASE_URL, "")}],
                    },
                }
            )
    independents = independents[:max_independents]
    log.info("%d restaurantes independientes en la cola", len(independents))
    repository.add_jobs(conn, run_id, independents)
    return len(jobs) + len(independents)
