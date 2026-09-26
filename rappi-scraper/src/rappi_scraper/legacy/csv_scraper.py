"""Scraper original a CSV: supermercados por cadena y ciudad, sin base de datos.

Uso:
    rappi-csv --chains lider unimarc
    rappi-csv --chains lider --cities santiago --max-stores 1 --max-aisles 2
    rappi-csv --list-chains
"""

import argparse
import logging
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from .. import config
from ..scraping.client import PAGE_ERRORS, RappiClient, StoreUnavailable
from ..scraping.store_metadata import normalize_stores
from ..scraping.store_parser import parse_aisles, parse_products, parse_store, parse_sub_aisles, slugify
from .csv_format import OUTPUT_DIR, consolidate, product_to_row, write_csv

log = logging.getLogger("rappi_scraper")

# Jumbo y Tottus no están por defecto: en sept. 2026 todas sus sucursales probadas redirigían
# (inactivas en Rappi). Revisar con `--list-chains` y `--chains jumbo tottus`.
DEFAULT_CHAINS = ("lider", "unimarc")


def _matches(value: str, terms: list[str]) -> bool:
    value = value.lower()
    return any(term.lower() in value for term in terms)


def select_branches(
    stores: list[dict], chains: list[str], cities: list[str] | None = None
) -> list[tuple[str, str, list[dict]]]:
    """Agrupa por (cadena, ciudad) y ordena las sucursales candidatas por nº de reseñas.

    Cada formato es una cadena distinta (Lider, Lider Express, Lider Big) porque tienen
    catálogos distintos.
    """
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for store in stores:
        if not _matches(store["brand"], chains):
            continue
        if cities and not _matches(store["city"], cities):
            continue
        groups[(store["brand"], store["city"])].append(store)
    return [
        (brand, city, sorted(candidates, key=lambda s: s["reviews"], reverse=True))
        for (brand, city), candidates in sorted(groups.items())
    ]


def chain_summary(stores: list[dict]) -> list[tuple[str, int]]:
    """Cadenas disponibles con su número de sucursales, de mayor a menor."""
    return Counter(s["brand"] for s in stores).most_common()


def _collect(rows_by_sku: dict, next_data: dict, context: dict) -> None:
    """Agrega los productos de la página. Las páginas más específicas se recorren
    después, así que sobrescriben pasillo/sub-pasillo con un valor más preciso."""
    for product in parse_products(next_data):
        row = product_to_row(product, context)
        if row["sku"]:
            rows_by_sku[row["sku"]] = row


def scrape_store(client: RappiClient, branch: dict, brand: str, max_aisles: int | None) -> list[dict]:
    client.set_location(branch["lat"], branch["lng"], branch["city"], branch["address"])
    store_data = client.get_next_data(branch["path"])  # puede lanzar StoreUnavailable
    store = parse_store(store_data)
    base_context = {
        "fecha_scraping": date.today().isoformat(),
        "cadena": brand,
        "ciudad": branch["city"],
        "store_id": store["store_id"],
        "tienda": store["name"],
        "direccion": store["address"] or branch["address"],
        "pasillo": "",
        "sub_pasillo": "",
    }
    rows_by_sku: dict[str, dict] = {}
    _collect(rows_by_sku, store_data, base_context)

    aisles = parse_aisles(store_data)[:max_aisles]
    expected = sum(a["product_count"] for a in aisles)
    log.info("  %s (%s): %d pasillos, %d productos declarados", store["name"], store["store_id"], len(aisles), expected)

    for aisle in aisles:
        aisle_path = f"{store['path']}/{aisle['friendly_url']}"
        aisle_context = {**base_context, "pasillo": aisle["name"]}
        try:
            aisle_data = client.get_next_data(aisle_path)
        except PAGE_ERRORS as exc:
            log.warning("  pasillo omitido %s: %s", aisle_path, exc)
            continue
        _collect(rows_by_sku, aisle_data, aisle_context)

        for sub in parse_sub_aisles(aisle_data):
            sub_path = f"{aisle_path}/{sub['friendly_url']}"
            try:
                sub_data = client.get_next_data(sub_path)
            except PAGE_ERRORS as exc:
                log.warning("  sub-pasillo omitido %s: %s", sub_path, exc)
                continue
            _collect(rows_by_sku, sub_data, {**aisle_context, "sub_pasillo": sub["name"]})
        log.info("    %-35s acumulado: %d", aisle["name"], len(rows_by_sku))

    coverage = len(rows_by_sku) / expected * 100 if expected else 0
    log.info("  -> %d productos únicos (%.0f%% de lo declarado)", len(rows_by_sku), coverage)
    return list(rows_by_sku.values())


def scrape_group(
    client: RappiClient, brand: str, city: str, candidates: list[dict], max_aisles: int | None
) -> list[dict] | None:
    """Prueba sucursales de la cadena en la ciudad hasta encontrar una disponible."""
    for branch in candidates[: config.MAX_BRANCH_ATTEMPTS]:
        try:
            return scrape_store(client, branch, brand, max_aisles)
        except StoreUnavailable as exc:
            log.info("  sucursal %s no disponible (%s), probando otra", branch["store_id"], exc)
        except PAGE_ERRORS as exc:
            # Un error en una tienda no debe detener una corrida de horas.
            log.warning("  sucursal %s falló: %s", branch["store_id"], exc)
    return None


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scraper de supermercados de Rappi Chile a CSV")
    parser.add_argument(
        "--chains",
        nargs="+",
        default=list(DEFAULT_CHAINS),
        help="Cadenas a incluir (coincidencia parcial, p. ej. 'lider' incluye Lider Express)",
    )
    parser.add_argument("--cities", nargs="+", help="Filtrar ciudades (coincidencia parcial)")
    parser.add_argument("--max-stores", type=int, help="Máximo de tiendas a recorrer (para pruebas)")
    parser.add_argument("--max-aisles", type=int, help="Máximo de pasillos por tienda (para pruebas)")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--force", action="store_true", help="Volver a descargar tiendas ya guardadas")
    parser.add_argument("--list-chains", action="store_true", help="Listar cadenas disponibles y salir")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    args = parse_args(argv)
    client = RappiClient()
    stores = normalize_stores(client.get_json(config.STORES_METADATA_URL))

    if args.list_chains:
        for brand, count in chain_summary(stores):
            print(f"{count:5d}  {brand}")
        return

    groups = select_branches(stores, args.chains, args.cities)[: args.max_stores]
    log.info("%d combinaciones cadena/ciudad a recorrer", len(groups))

    for i, (brand, city, candidates) in enumerate(groups, 1):
        out_path = args.output_dir / f"products_{slugify(brand)}_{slugify(city)}.csv"
        if out_path.exists() and not args.force:
            log.info("[%d/%d] %s — %s: ya existe, se omite", i, len(groups), brand, city)
            continue
        log.info("[%d/%d] %s — %s", i, len(groups), brand, city)
        rows = scrape_group(client, brand, city, candidates, args.max_aisles)
        if rows is None:
            log.warning("  ninguna sucursal disponible para %s en %s", brand, city)
            continue
        write_csv(out_path, rows)

    target, n_rows = consolidate(args.output_dir)
    log.info("CSV consolidado: %s (%d filas)", target, n_rows)


if __name__ == "__main__":
    main()
