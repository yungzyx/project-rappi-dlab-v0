"""Producto canónico: el mismo producto (marca + nombre + tamaño) aunque Rappi lo liste con distintos ids, tiendas o
verticales. Ante la duda no une: unir mal dos productos es peor que no unirlos."""

import logging
import re
from collections import Counter, defaultdict
from pathlib import Path

from psycopg import Connection

from ..text import normalize
from .measures import _NAME_MEASURE
from .runs import finish_layer_run, rules_version, start_layer_run

log = logging.getLogger(__name__)

RULES_VERSION = "2026-10-06"
_PACK_NOISE = [
    re.compile(r"\b\d{1,2}\s*x\b", re.IGNORECASE),  # «6 x» de «6 x 350 ml», ya sin la medida
    re.compile(r"\bx\s*\d{1,2}\b", re.IGNORECASE),
    re.compile(r"\b(?:tri|six|doce)?\s*pack\b", re.IGNORECASE),
    re.compile(r"\b\d+\s*(?:und|un|unid\w*|uds?)\b", re.IGNORECASE),
]
_ARTICLES = {"de", "la", "el", "los", "las", "y"}


def name_key(name: str, brand_words: set[str]) -> str:
    """El nombre sin marca, tamaño ni pack, con las palabras ordenadas: «Coca-Cola Original 1.5L» y «Coca Cola
    Original 1,5 L» dan la misma clave; «Zero» u «Original», «con» y «sin lactosa» o «20W» y «35W», no."""
    text = _NAME_MEASURE.sub(" ", name)
    for pattern in _PACK_NOISE:
        text = pattern.sub(" ", text)
    words = [w for w in normalize(text).split() if w not in brand_words and w not in _ARTICLES]
    return " ".join(sorted(words))


def build_canonical(conn: Connection) -> dict:
    """Recalcula `canonical_products` e `item_canonical` de los productos con marca y medida comparable (sin medida
    sospechosa); los demás no se unen. Idempotente."""
    run = start_layer_run(conn, "canonical", rules_version(RULES_VERSION, Path(__file__)))
    brand_words = {
        key: set(normalize(name).split()) for key, name in conn.execute("SELECT brand_key, name FROM product_brands")
    }
    rows = conn.execute(
        """SELECT ci.master_product_id, ci.name, b.brand_key, m.total, m.unit
           FROM catalog_items ci
           JOIN item_brands b ON b.entity_type = 'catalog_item' AND b.entity_id = ci.master_product_id::text
           JOIN item_measures m ON m.entity_type = 'catalog_item' AND m.entity_id = ci.master_product_id::text
           WHERE m.total > 0 AND m.suspect IS NULL AND m.unit IN ('g', 'ml', 'und')"""
    ).fetchall()
    groups: dict[tuple, list] = defaultdict(list)
    for master_id, name, brand_key, total, unit in rows:
        key = (brand_key, name_key(name or "", brand_words.get(brand_key, set())), total, unit)
        if key[1]:
            groups[key].append((master_id, name))
    conn.execute("DELETE FROM canonical_products")  # en cascada: item_canonical
    members = []
    with conn.cursor() as cur:
        for (brand_key, key, total, unit), items in groups.items():
            label = Counter(name for _id, name in items).most_common(1)[0][0]
            canonical_id = cur.execute(
                """INSERT INTO canonical_products (brand_key, name_key, total, unit, label, items)
                   VALUES (%s, %s, %s, %s, %s, %s) RETURNING canonical_id""",
                (brand_key, key, total, unit, label, len(items)),
            ).fetchone()[0]
            members += [(master_id, canonical_id, "exacto", 0.9, run) for master_id, _name in items]
        cur.executemany(
            "INSERT INTO item_canonical (master_product_id, canonical_id, method, confidence, run_id) "
            "VALUES (%s, %s, %s, %s, %s)",
            members,
        )
    conn.execute("ANALYZE canonical_products")
    conn.execute("ANALYZE item_canonical")
    counts = {
        "canonicos": len(groups),
        "items": len(members),
        "compartidos": sum(1 for items in groups.values() if len(items) > 1),
    }
    finish_layer_run(conn, run, counts)
    log.info("Canónicos: %s", counts)
    return counts
