"""Formato de los CSV del scraper original: columnas, conversión de producto a fila y escritura."""

import csv
import os
from pathlib import Path

from ..config import DATA_DIR
from ..pricing import discount_pct

OUTPUT_DIR = DATA_DIR / "supermercados_csv"
CONSOLIDATED_FILENAME = "rappi_cl_productos.csv"
CSV_ENCODING = "utf-8-sig"  # BOM para que Excel muestre bien los acentos

CSV_COLUMNS = [
    "fecha_scraping",
    "cadena",
    "ciudad",
    "store_id",
    "tienda",
    "direccion",
    "pasillo",
    "sub_pasillo",
    "sku",
    "master_product_id",
    "ean",
    "nombre",
    "marca",
    "descripcion",
    "presentacion",
    "cantidad",
    "unidad",
    "tipo_venta",
    "precio",
    "precio_normal",
    "descuento_pct",
    "tiene_descuento",
    "precio_por_unidad",
    "categoria",
    "en_stock",
    "imagen_url",
]


def product_to_row(product: dict, context: dict) -> dict:
    """Convierte un producto de Rappi en una fila del CSV. `context` trae los datos de tienda/pasillo."""
    price = product.get("price")
    real_price = product.get("real_price")
    return {
        **context,
        "sku": product.get("product_id") or "",
        "master_product_id": product.get("master_product_id") or "",
        "ean": product.get("ean") or "",
        "nombre": (product.get("name") or "").strip(),
        "marca": product.get("trademark") or "",
        "descripcion": (product.get("description") or "").strip(),
        "presentacion": product.get("presentation") or "",
        "cantidad": product.get("quantity") or "",
        "unidad": product.get("unit_type") or "",
        "tipo_venta": product.get("sale_type") or "",
        "precio": price if price is not None else "",
        "precio_normal": real_price if real_price is not None else "",
        "descuento_pct": discount_pct(price, real_price),
        "tiene_descuento": bool(product.get("have_discount")),
        "precio_por_unidad": product.get("pum") or "",
        "categoria": product.get("category_name") or "",
        "en_stock": bool(product.get("in_stock")),
        "imagen_url": product.get("image_url") or "",
    }


def write_csv(path: Path, rows: list[dict]) -> None:
    """Escritura atómica: si el proceso se corta, no queda un CSV incompleto que luego se omita."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(path.name + ".tmp")
    with tmp_path.open("w", newline="", encoding=CSV_ENCODING) as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    os.replace(tmp_path, path)


def read_group_csvs(folder: Path) -> list[dict]:
    """Filas de todos los products_*.csv de la carpeta."""
    rows = []
    for part in sorted(folder.glob("products_*.csv")):
        with part.open(newline="", encoding=CSV_ENCODING) as f:
            rows.extend(csv.DictReader(f))
    return rows


def consolidate(folder: Path) -> tuple[Path, int]:
    """Une todos los products_*.csv en un solo archivo. Devuelve (ruta, filas)."""
    rows = read_group_csvs(folder)
    target = folder / CONSOLIDATED_FILENAME
    write_csv(target, rows)
    return target, len(rows)
