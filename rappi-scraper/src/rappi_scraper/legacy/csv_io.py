"""Puente entre los CSV y la base: importa los CSV del scraper original y exporta el catálogo por vertical."""

import codecs
import logging
from collections import defaultdict
from pathlib import Path

from psycopg import Connection

from ..storage import repository
from .csv_format import read_group_csvs

log = logging.getLogger(__name__)


def _to_number(value: str | None) -> float | None:
    try:
        return float(value) if value not in ("", None) else None
    except ValueError:
        return None


def _row_to_product(row: dict, category_ids: dict[str, int]) -> dict:
    """Fila del CSV -> producto con las claves crudas de Rappi que usa `repository.save_products`."""
    return {
        "product_id": row["sku"],
        "master_product_id": row.get("master_product_id"),
        "name": row.get("nombre"),
        "description": row.get("descripcion"),
        "presentation": row.get("presentacion"),
        "quantity": _to_number(row.get("cantidad")),
        "unit_type": row.get("unidad"),
        "trademark": row.get("marca"),
        "category_id": category_ids.get(row.get("categoria") or ""),
        "category_name": row.get("categoria"),
        "image_url": row.get("imagen_url"),
        "price": _to_number(row.get("precio")),
        "real_price": _to_number(row.get("precio_normal")),
        "pum": row.get("precio_por_unidad"),
        "in_stock": row.get("en_stock") == "True",
        "_scraped_at": row.get("fecha_scraping") or None,
    }


def import_legacy_csv(conn: Connection, folder: Path) -> tuple[int, int]:
    """Carga todos los products_*.csv como una corrida 'legacy_csv' (vertical supermercado).

    Devuelve (run_id, filas importadas).
    """
    by_store: dict[int, list[dict]] = defaultdict(list)
    for row in read_group_csvs(folder):
        by_store[int(row["store_id"])].append(row)

    # El CSV trae el nombre de la categoría y no su id: se busca entre las que ya vio una descarga.
    category_ids = dict(conn.execute("SELECT name, min(category_id) FROM categories GROUP BY name").fetchall())
    run_id = repository.start_run(conn, "legacy_csv", {"folder": str(folder)})
    total = 0
    for store_id, rows in by_store.items():
        first = rows[0]
        with conn.transaction():
            repository.upsert_store(
                conn,
                {"store_id": store_id, "name": first["tienda"], "city": first["ciudad"], "address": first["direccion"]},
            )
            repository.upsert_store_vertical(conn, store_id, "supermercado")
            total += repository.save_products(conn, run_id, store_id, [_row_to_product(r, category_ids) for r in rows])
    repository.finish_run(conn, run_id)
    log.info("Importadas %d filas de %d tiendas (corrida %d)", total, len(by_store), run_id)
    return run_id, total


EXPORT_SQL = """
COPY (
    SELECT iv.vertical, array_to_string(iv.subverticals, '|') AS subverticales, ci.master_product_id,
           ci.name AS nombre, ci.trademark AS marca, ci.presentation AS presentacion, c.name AS categoria,
           ci.description AS descripcion, iv.stores AS tiendas, ci.image_url AS imagen_url
    FROM v_item_verticals iv
    JOIN catalog_items ci USING (master_product_id)
    LEFT JOIN categories c USING (category_id)
    ORDER BY iv.vertical, ci.name
) TO STDOUT WITH (FORMAT csv, HEADER)
"""


def export_catalog_csv(conn: Connection, target: Path) -> Path:
    """Exporta el catálogo (un producto por vertical) a CSV, con BOM para que Excel lea bien los acentos."""
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("wb") as f, conn.cursor().copy(EXPORT_SQL) as copy:
        f.write(codecs.BOM_UTF8)
        for chunk in copy:
            f.write(chunk)
    return target
