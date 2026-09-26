"""Escrituras en Postgres: corridas, cola de jobs, tiendas, catálogo, precios y restaurantes.

Todas las escrituras son idempotentes (`INSERT … ON CONFLICT`), así una corrida se puede
reanudar o repetir sin duplicar el catálogo; solo se agregan snapshots de precio nuevos.
"""

from psycopg import Connection
from psycopg.types.json import Jsonb

from ..pricing import discount_pct

# ---------------------------------------------------------------- corridas y jobs


def start_run(conn: Connection, kind: str, params: dict) -> int:
    row = conn.execute(
        "INSERT INTO scrape_runs (kind, params) VALUES (%s, %s) RETURNING run_id", (kind, Jsonb(params))
    ).fetchone()
    conn.commit()
    return row[0]


def open_run(conn: Connection, kind: str) -> int | None:
    """Última corrida sin terminar de ese tipo (para reanudar)."""
    row = conn.execute(
        "SELECT run_id FROM scrape_runs WHERE kind = %s AND status = 'running' ORDER BY run_id DESC LIMIT 1",
        (kind,),
    ).fetchone()
    return row[0] if row else None


def finish_run(conn: Connection, run_id: int, status: str = "done") -> None:
    conn.execute("UPDATE scrape_runs SET status = %s, finished_at = now() WHERE run_id = %s", (status, run_id))
    conn.commit()


def latest_run(conn: Connection, kind: str) -> int | None:
    """Última corrida de ese tipo, abierta o cerrada."""
    row = conn.execute(
        "SELECT run_id FROM scrape_runs WHERE kind = %s ORDER BY run_id DESC LIMIT 1", (kind,)
    ).fetchone()
    return row[0] if row else None


def reopen_run(conn: Connection, run_id: int) -> None:
    conn.execute("UPDATE scrape_runs SET status = 'running', finished_at = NULL WHERE run_id = %s", (run_id,))
    conn.commit()


def requeue_failed(conn: Connection, run_id: int, max_attempts: int, job_keys: list[str] | None = None) -> list[str]:
    """Vuelve a `pending` los jobs fallidos con menos de `max_attempts` intentos.

    Con `job_keys`, solo entre esos jobs. Devuelve las claves reencoladas.
    """
    rows = conn.execute(
        "UPDATE scrape_jobs SET status = 'pending', error = NULL, updated_at = now() "
        "WHERE run_id = %s AND status = 'failed' AND attempts < %s "
        "AND (%s::text[] IS NULL OR job_key = ANY(%s)) RETURNING job_key",
        (run_id, max_attempts, job_keys, job_keys),
    ).fetchall()
    conn.commit()
    return [r[0] for r in rows]


def save_run_report(conn: Connection, run_id: int, report: dict) -> None:
    conn.execute("UPDATE scrape_runs SET report = %s WHERE run_id = %s", (Jsonb(report), run_id))
    conn.commit()


def add_jobs(conn: Connection, run_id: int, jobs: list[dict]) -> None:
    """jobs: [{job_key, job_type, payload}]. Un job pendiente se actualiza; uno ya procesado no se toca."""
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO scrape_jobs (run_id, job_key, job_type, payload) VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (run_id, job_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now() "
            "WHERE scrape_jobs.status = 'pending'",
            [(run_id, j["job_key"], j["job_type"], Jsonb(j["payload"])) for j in jobs],
        )
    conn.commit()


def pending_jobs(conn: Connection, run_id: int, job_type: str, vertical: str | None = None) -> list[dict]:
    rows = conn.execute(
        "SELECT job_key, payload FROM scrape_jobs "
        "WHERE run_id = %s AND job_type = %s AND status = 'pending' "
        "AND (%s::text IS NULL OR payload->'verticals' ? %s) ORDER BY job_key",
        (run_id, job_type, vertical, vertical),
    ).fetchall()
    return [{"job_key": key, "payload": payload} for key, payload in rows]


def pending_payloads(conn: Connection, run_id: int, job_type: str) -> dict[str, dict]:
    rows = conn.execute(
        "SELECT job_key, payload FROM scrape_jobs WHERE run_id = %s AND job_type = %s AND status = 'pending'",
        (run_id, job_type),
    ).fetchall()
    return {key: payload for key, payload in rows}


def mark_job(
    conn: Connection, run_id: int, job_key: str, status: str, result: dict | None = None, error: str | None = None
) -> None:
    conn.execute(
        "UPDATE scrape_jobs SET status = %s, result = %s, error = %s, attempts = attempts + 1, "
        "updated_at = now() WHERE run_id = %s AND job_key = %s",
        (status, Jsonb(result) if result is not None else None, error, run_id, job_key),
    )
    conn.commit()


def store_types_done(conn: Connection, run_id: int) -> set[str]:
    """Formatos de tienda ya scrapeados en la corrida (para no repetir una marca)."""
    rows = conn.execute(
        "SELECT result->>'store_type' FROM scrape_jobs WHERE run_id = %s AND status = 'done' AND result ? 'store_type'",
        (run_id,),
    ).fetchall()
    return {r[0] for r in rows if r[0]}


def brands_done(conn: Connection, run_id: int) -> set[int]:
    """Marcas de restaurantes ya scrapeadas en la corrida (para no repetir sucursales de una cadena)."""
    rows = conn.execute(
        "SELECT (result->>'brand_id')::bigint FROM scrape_jobs "
        "WHERE run_id = %s AND status = 'done' AND result ? 'brand_id'",
        (run_id,),
    ).fetchall()
    return {r[0] for r in rows if r[0]}


# ---------------------------------------------------------------- tiendas


def upsert_brand(conn: Connection, brand_id: int | None, name: str, kind: str = "store") -> None:
    if not brand_id:
        return
    conn.execute(
        "INSERT INTO brands (brand_id, name, kind) VALUES (%s, %s, %s) "
        "ON CONFLICT (brand_id) DO UPDATE SET name = EXCLUDED.name",
        (brand_id, name or str(brand_id), kind),
    )


def upsert_store(conn: Connection, store: dict, raw: dict | None = None) -> None:
    """Crea o completa una tienda. Los campos vacíos no pisan datos ya guardados."""
    upsert_brand(conn, store.get("brand_id"), store.get("brand_name") or "", store.get("brand_kind", "store"))
    conn.execute(
        """
        INSERT INTO stores (store_id, name, brand_id, store_type, sub_group, city, address, lat, lng, path, raw)
        VALUES (%(store_id)s, %(name)s, %(brand_id)s, NULLIF(%(store_type)s, ''), NULLIF(%(sub_group)s, ''),
                %(city)s, %(address)s,
                %(lat)s, %(lng)s, %(path)s, %(raw)s)
        ON CONFLICT (store_id) DO UPDATE SET
            name       = COALESCE(NULLIF(EXCLUDED.name, ''), stores.name),
            brand_id   = COALESCE(EXCLUDED.brand_id, stores.brand_id),
            store_type = COALESCE(NULLIF(EXCLUDED.store_type, ''), stores.store_type),
            sub_group  = COALESCE(NULLIF(EXCLUDED.sub_group, ''), stores.sub_group),
            city       = COALESCE(NULLIF(EXCLUDED.city, ''), stores.city),
            address    = COALESCE(NULLIF(EXCLUDED.address, ''), stores.address),
            lat        = COALESCE(EXCLUDED.lat, stores.lat),
            lng        = COALESCE(EXCLUDED.lng, stores.lng),
            path       = COALESCE(NULLIF(EXCLUDED.path, ''), stores.path),
            raw        = COALESCE(EXCLUDED.raw, stores.raw),
            last_seen  = now()
        """,
        {
            "store_id": store["store_id"],
            "name": store.get("name") or "",
            "brand_id": store.get("brand_id"),
            "store_type": store.get("store_type") or "",
            "sub_group": store.get("sub_group") or "",
            "city": store.get("city") or "",
            "address": store.get("address") or "",
            "lat": store.get("lat"),
            "lng": store.get("lng"),
            "path": store.get("path") or "",
            "raw": Jsonb(raw) if raw is not None else None,
        },
    )


def upsert_store_vertical(
    conn: Connection,
    store_id: int,
    vertical: str,
    subvertical: str = "",
    landing_classification: str = "",
    filters: list[str] | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO store_verticals (store_id, vertical, subvertical, landing_classification, filters)
        VALUES (%s, %s, NULLIF(%s, ''), NULLIF(%s, ''), %s)
        ON CONFLICT (store_id, vertical) DO UPDATE SET
            subvertical            = COALESCE(EXCLUDED.subvertical, store_verticals.subvertical),
            landing_classification = COALESCE(EXCLUDED.landing_classification, store_verticals.landing_classification),
            filters   = COALESCE((SELECT array_agg(DISTINCT f)
                                   FROM unnest(store_verticals.filters || EXCLUDED.filters) f), '{}'),
            last_seen = now()
        """,
        (store_id, vertical, subvertical, landing_classification, filters or []),
    )


def upsert_aisles(conn: Connection, store_id: int, aisles: list[dict]) -> None:
    """aisles: [{aisle_id, parent_aisle_id, name, friendly_url, product_count}]."""
    with conn.cursor() as cur:
        cur.executemany(
            """
            INSERT INTO aisles (store_id, aisle_id, parent_aisle_id, name, friendly_url, product_count_declared)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (store_id, aisle_id) DO UPDATE SET
                parent_aisle_id = EXCLUDED.parent_aisle_id, name = EXCLUDED.name,
                friendly_url = EXCLUDED.friendly_url, product_count_declared = EXCLUDED.product_count_declared
            """,
            [
                (
                    store_id,
                    a["aisle_id"],
                    a.get("parent_aisle_id"),
                    a["name"],
                    a.get("friendly_url"),
                    a.get("product_count"),
                )
                for a in aisles
                if a.get("aisle_id")
            ],
        )


# ---------------------------------------------------------------- catálogo y precios


def _int_or_none(value) -> int | None:
    """Convierte a int conservando el 0 (p. ej. stock agotado); vacío o inválido -> None."""
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def save_products(conn: Connection, run_id: int, store_id: int, products: list[dict]) -> int:
    """Guarda productos crudos de Rappi (con `_aisle_id` / `_sub_aisle_id` agregados).

    Escribe categorías, catálogo único, oferta por tienda y un snapshot de precio.
    Devuelve cuántos productos se guardaron.
    """
    categories, items, offers, prices = {}, {}, {}, {}
    for p in products:
        sku = str(p.get("product_id") or "")
        if not sku:
            continue
        master_id = _int_or_none(p.get("master_product_id")) or None  # 0 no es un ID válido
        category_id = _int_or_none(p.get("category_id")) or None
        if category_id and p.get("category_name"):
            categories[category_id] = p["category_name"]
        if master_id:
            items[master_id] = (
                master_id,
                (p.get("name") or "").strip(),
                (p.get("description") or "").strip(),
                p.get("presentation") or "",
                p.get("quantity"),
                p.get("unit_type") or "",
                (p.get("trademark") or "").strip(),
                category_id,
                p.get("image_url") or "",
                Jsonb(p.get("attributes") or {}),
                bool(p.get("alcoholic_beverage")),
                bool(p.get("age_restriction")),
            )
        offers[sku] = (store_id, sku, master_id, p.get("_aisle_id"), p.get("_sub_aisle_id"), Jsonb(p))
        price, real_price = p.get("price"), p.get("real_price")
        prices[sku] = (
            run_id,
            store_id,
            sku,
            price,
            real_price,
            discount_pct(price, real_price),
            p.get("pum") or "",
            bool(p.get("in_stock")),
            _int_or_none(p.get("stock")),
        )

    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO categories (category_id, name) VALUES (%s, %s) "
            "ON CONFLICT (category_id) DO UPDATE SET name = EXCLUDED.name",
            list(categories.items()),
        )
        cur.executemany(
            """
            INSERT INTO catalog_items (master_product_id, name, description, presentation, quantity, unit_type,
                trademark, category_id, image_url, attributes, is_alcoholic, age_restricted)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (master_product_id) DO UPDATE SET
                name = EXCLUDED.name,
                description  = COALESCE(NULLIF(EXCLUDED.description, ''), catalog_items.description),
                presentation = COALESCE(NULLIF(EXCLUDED.presentation, ''), catalog_items.presentation),
                quantity = EXCLUDED.quantity, unit_type = EXCLUDED.unit_type,
                trademark    = COALESCE(NULLIF(EXCLUDED.trademark, ''), catalog_items.trademark),
                category_id  = COALESCE(EXCLUDED.category_id, catalog_items.category_id),
                image_url    = COALESCE(NULLIF(EXCLUDED.image_url, ''), catalog_items.image_url),
                attributes   = catalog_items.attributes || EXCLUDED.attributes,
                is_alcoholic = catalog_items.is_alcoholic OR EXCLUDED.is_alcoholic,
                age_restricted = catalog_items.age_restricted OR EXCLUDED.age_restricted,
                last_seen = now()
            """,
            list(items.values()),
        )
        cur.executemany(
            """
            INSERT INTO store_products (store_id, sku, master_product_id, aisle_id, sub_aisle_id, raw)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (store_id, sku) DO UPDATE SET
                master_product_id = COALESCE(EXCLUDED.master_product_id, store_products.master_product_id),
                aisle_id     = COALESCE(EXCLUDED.aisle_id, store_products.aisle_id),
                sub_aisle_id = COALESCE(EXCLUDED.sub_aisle_id, store_products.sub_aisle_id),
                raw = EXCLUDED.raw, last_seen = now()
            """,
            list(offers.values()),
        )
        cur.executemany(
            """
            INSERT INTO price_snapshots (run_id, store_id, sku, price, real_price, discount_pct, pum, in_stock, stock)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (run_id, store_id, sku) DO UPDATE SET
                price = EXCLUDED.price, real_price = EXCLUDED.real_price, discount_pct = EXCLUDED.discount_pct,
                pum = EXCLUDED.pum, in_stock = EXCLUDED.in_stock, stock = EXCLUDED.stock, scraped_at = now()
            """,
            list(prices.values()),
        )
    return len(offers)


# ---------------------------------------------------------------- restaurantes


def save_restaurant(conn: Connection, run_id: int, parsed: dict) -> int:
    """Guarda un restaurante ya parseado (ver `parse_restaurant`). Devuelve cuántos platos guardó."""
    store = {**parsed["store"], "brand_kind": "restaurant"}
    store_id = store["store_id"]
    upsert_store(conn, store)
    upsert_store_vertical(conn, store_id, "restaurantes")
    details = parsed["details"]
    conn.execute(
        """
        INSERT INTO restaurant_details (store_id, rating, review_count, delivery_cost, eta, schedules, tags)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (store_id) DO UPDATE SET rating = EXCLUDED.rating, review_count = EXCLUDED.review_count,
            delivery_cost = EXCLUDED.delivery_cost, eta = EXCLUDED.eta, schedules = EXCLUDED.schedules,
            tags = EXCLUDED.tags
        """,
        (
            store_id,
            details["rating"],
            details["review_count"],
            details["delivery_cost"],
            details["eta"],
            Jsonb(details["schedules"]),
            details["tags"],
        ),
    )
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO cuisines (name) VALUES (%s) ON CONFLICT DO NOTHING", [(c,) for c in parsed["cuisines"]]
        )
        cur.executemany(
            "INSERT INTO restaurant_cuisines (store_id, cuisine) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            [(store_id, c) for c in parsed["cuisines"]],
        )
        cur.executemany(
            "INSERT INTO menu_sections (store_id, section_id, name, position) VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (store_id, section_id) DO UPDATE SET name = EXCLUDED.name, position = EXCLUDED.position",
            [(store_id, s["section_id"], s["name"], s["position"]) for s in parsed["sections"]],
        )
        cur.executemany(
            """
            INSERT INTO menu_items (item_id, store_id, section_id, name, description, image_url,
                                    is_popular, has_toppings)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (item_id) DO UPDATE SET
                store_id = EXCLUDED.store_id, section_id = EXCLUDED.section_id, name = EXCLUDED.name,
                description = EXCLUDED.description, image_url = EXCLUDED.image_url,
                is_popular = EXCLUDED.is_popular, has_toppings = EXCLUDED.has_toppings, last_seen = now()
            """,
            [
                (
                    i["item_id"],
                    store_id,
                    i["section_id"],
                    i["name"],
                    i["description"],
                    i["image_url"],
                    i["is_popular"],
                    i["has_toppings"],
                )
                for i in parsed["items"]
            ],
        )
        cur.executemany(
            """
            INSERT INTO menu_price_snapshots (run_id, item_id, price, real_price, discount_pct, is_available)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (run_id, item_id) DO UPDATE SET price = EXCLUDED.price, real_price = EXCLUDED.real_price,
                discount_pct = EXCLUDED.discount_pct, is_available = EXCLUDED.is_available, scraped_at = now()
            """,
            [
                (run_id, i["item_id"], i["price"], i["real_price"], i["discount_pct"], i["is_available"])
                for i in parsed["items"]
            ],
        )
    return len(parsed["items"])


# ---------------------------------------------------------------- lectura


def run_status(conn: Connection) -> list[tuple]:
    """(run_id, tipo, estado de la corrida, estado del job, cantidad) por corrida."""
    return conn.execute(
        "SELECT r.run_id, r.kind, r.status, j.status, count(j.*) FROM scrape_runs r "
        "LEFT JOIN scrape_jobs j USING (run_id) GROUP BY 1, 2, 3, 4 ORDER BY 1, 4"
    ).fetchall()


def vertical_summary(conn: Connection) -> tuple[list[str], list[tuple]]:
    """Columnas y filas de `v_vertical_summary`."""
    cur = conn.execute("SELECT * FROM v_vertical_summary")
    return [d.name for d in cur.description], cur.fetchall()
