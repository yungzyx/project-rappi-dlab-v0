"""Procesa los jobs de tiendas: tienda → pasillos → sub-pasillos, y guarda todo en Postgres."""

import logging

from psycopg import Connection

from .. import config
from ..scraping.client import PAGE_ERRORS, RappiClient, StoreUnavailable
from ..scraping.next_data import ParseError
from ..scraping.store_parser import parse_aisles, parse_products, parse_store, parse_sub_aisles
from ..storage import repository
from .queue import process_with_retry

log = logging.getLogger(__name__)


def _tag(products: list[dict], aisle_id=None, sub_aisle_id=None) -> dict[str, dict]:
    """Copia cada producto con su pasillo/sub-pasillo (sin mutar el original)."""
    return {
        str(p["product_id"]): {**p, "_aisle_id": aisle_id, "_sub_aisle_id": sub_aisle_id}
        for p in products
        if p.get("product_id")
    }


def crawl_store(client: RappiClient, store_data: dict, max_aisles: int | None = None) -> dict:
    """Recorre pasillos y sub-pasillos a partir de la página de la tienda ya descargada.

    Una página de pasillo o sub-pasillo ilegible se omite (y se cuenta); si no se pudo leer ningún pasillo,
    lanza ParseError para que el job quede fallido en vez de "hecho" solo con la portada."""
    store = parse_store(store_data)
    products = _tag(parse_products(store_data))
    aisles = []
    store_aisles = parse_aisles(store_data)[:max_aisles]
    skipped_pages = aisles_read = 0

    for aisle in store_aisles:
        aisles.append({**aisle, "parent_aisle_id": None})
        aisle_path = f"{store['path']}/{aisle['friendly_url']}"
        try:  # leer la página también va aquí: puede llegar sin fallback['storefront/...'] (ParseError)
            aisle_data = client.get_next_data(aisle_path)
            aisle_products, sub_aisles = parse_products(aisle_data), parse_sub_aisles(aisle_data)
        except (*PAGE_ERRORS, StoreUnavailable) as exc:  # StoreUnavailable: el pasillo redirigió al listado
            log.warning("  pasillo omitido %s: %s", aisle_path, exc)
            skipped_pages += 1
            continue
        aisles_read += 1
        products.update(_tag(aisle_products, aisle["aisle_id"]))

        for sub in sub_aisles:
            aisles.append({**sub, "parent_aisle_id": aisle["aisle_id"]})
            sub_path = f"{aisle_path}/{sub['friendly_url']}"
            try:
                sub_products = parse_products(client.get_next_data(sub_path))
            except (*PAGE_ERRORS, StoreUnavailable) as exc:
                log.warning("  sub-pasillo omitido %s: %s", sub_path, exc)
                skipped_pages += 1
                continue
            products.update(_tag(sub_products, aisle["aisle_id"], sub["aisle_id"]))

    if store_aisles and not aisles_read:
        raise ParseError(f"ningún pasillo se pudo leer ({skipped_pages} omitidos)")
    context = store_data["props"]["pageProps"].get("storeContext")
    return {
        "store": store,
        "context": context,
        "aisles": aisles,
        "products": list(products.values()),
        "skipped_pages": skipped_pages,
    }


def save_crawl(conn: Connection, run_id: int, crawl: dict, verticals: list[str]) -> int:
    store = crawl["store"]
    with conn.transaction():
        repository.upsert_store(conn, store, raw=crawl["context"])
        for vertical in verticals:
            repository.upsert_store_vertical(conn, store["store_id"], vertical, store.get("sub_group") or "")
        repository.upsert_aisles(conn, store["store_id"], crawl["aisles"])
        return repository.save_products(conn, run_id, store["store_id"], crawl["products"])


def process_store_jobs(
    conn: Connection,
    client: RappiClient,
    run_id: int,
    vertical: str | None = None,
    limit: int | None = None,
    max_aisles: int | None = None,
) -> None:
    jobs = repository.pending_jobs(conn, run_id, "store_group", vertical)[:limit]
    log.info("%d jobs de tiendas pendientes", len(jobs))
    done_types = repository.store_types_done(conn, run_id)
    process_with_retry(
        conn,
        run_id,
        jobs,
        lambda job: _run_store_job(conn, client, run_id, job["payload"], done_types, max_aisles),
        describe=lambda job: f"{job['job_key']} ({', '.join(job['payload']['verticals'])})",
    )


def _run_store_job(
    conn: Connection, client: RappiClient, run_id: int, payload: dict, done_types: set[str], max_aisles: int | None
) -> tuple[str, dict | None, str | None]:
    """Prueba las sucursales candidatas hasta scrapear una. Devuelve (status, result, error)."""
    error = "ninguna sucursal disponible"
    for cand in payload["candidates"][: config.MAX_BRANCH_ATTEMPTS]:
        client.set_location(cand["lat"], cand["lng"], cand["city"], cand["city"])
        try:
            store_data = client.get_next_data(cand["path"])
            store_type = parse_store(store_data)["store_type"]
        except StoreUnavailable:
            log.info("  %s no disponible, probando otra", cand["store_id"])
            continue
        except PAGE_ERRORS as exc:
            log.warning("  %s falló: %s", cand["store_id"], exc)
            error = str(exc)
            continue
        if store_type and store_type in done_types:
            return "skipped", {"store_type": store_type, "reason": "marca ya scrapeada"}, None
        crawl = crawl_store(client, store_data, max_aisles)
        saved = save_crawl(conn, run_id, crawl, payload["verticals"])
        done_types.add(store_type)
        log.info("  -> %s: %d productos", crawl["store"]["name"], saved)
        result = {
            "store_id": crawl["store"]["store_id"],
            "store_type": store_type,
            "products": saved,
            "paginas_omitidas": crawl["skipped_pages"],
        }
        return "done", result, None
    return "failed", None, error
