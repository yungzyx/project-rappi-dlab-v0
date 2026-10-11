"""Los triggers de la migración 032 contra escrituras al azar (semilla fija): después de cada paso, latest_prices y
latest_menu_prices son exactamente el último snapshot de cada SKU y de cada plato según el historial."""

import random
from datetime import UTC, datetime, timedelta

from rappi_scraper.storage import repository

T0 = datetime(2026, 9, 1, tzinfo=UTC)
STORES, SKUS, DISHES = (1, 2), "abcd", (1, 2)

LATEST = "SELECT store_id, sku, price, real_price, discount_pct, pum, in_stock, run_id, scraped_at FROM latest_prices"
HISTORY = """
SELECT DISTINCT ON (store_id, sku) store_id, sku, price, real_price, discount_pct, pum, in_stock, run_id, scraped_at
FROM price_snapshots ORDER BY store_id, sku, scraped_at DESC, run_id DESC"""
LATEST_MENU = (
    "SELECT item_id, price, real_price, discount_pct, is_available, run_id, scraped_at FROM latest_menu_prices"
)
HISTORY_MENU = """
SELECT DISTINCT ON (item_id) item_id, price, real_price, discount_pct, is_available, run_id, scraped_at
FROM menu_price_snapshots ORDER BY item_id, scraped_at DESC, run_id DESC"""


def _assert_matches_history(db, step) -> None:
    assert set(db.execute(LATEST).fetchall()) == set(db.execute(HISTORY).fetchall()), step
    assert set(db.execute(LATEST_MENU).fetchall()) == set(db.execute(HISTORY_MENU).fetchall()), step


def test_latest_prices_always_match_the_history(db):
    rnd = random.Random(7)
    runs = [repository.start_run(db, "stores", {}) for _ in range(6)]
    for store_id in STORES:
        db.execute("INSERT INTO stores (store_id, name) VALUES (%s, 'Tienda')", (store_id,))
        for sku in SKUS:
            db.execute("INSERT INTO store_products (store_id, sku) VALUES (%s, %s)", (store_id, sku))
    for item_id in DISHES:
        db.execute(
            "INSERT INTO menu_items (item_id, rappi_item_id, store_id, name) VALUES (%s, %s, 1, 'Plato')",
            (item_id, item_id),
        )

    for step in range(400):
        op = rnd.random()
        store_id, sku, run, dish = rnd.choice(STORES), rnd.choice(SKUS), rnd.choice(runs), rnd.choice(DISHES)
        when = T0 + timedelta(days=rnd.choice((0, 1, 2, 3)))  # pocas fechas: muchos empates y llegadas desordenadas
        if op < 0.45:  # nuevo snapshot o reintento de la misma corrida (ON CONFLICT … DO UPDATE, como save_products)
            db.execute(
                "INSERT INTO price_snapshots (run_id, store_id, sku, price, scraped_at) VALUES (%s, %s, %s, %s, %s)"
                " ON CONFLICT (run_id, store_id, sku) DO UPDATE SET price = EXCLUDED.price,"
                " scraped_at = EXCLUDED.scraped_at",
                (run, store_id, sku, rnd.randint(10, 99), when),
            )
            db.execute(
                "INSERT INTO menu_price_snapshots (run_id, item_id, price, scraped_at) VALUES (%s, %s, %s, %s)"
                " ON CONFLICT (run_id, item_id) DO UPDATE SET price = EXCLUDED.price, scraped_at = EXCLUDED.scraped_at",
                (run, dish, rnd.randint(10, 99), when),
            )
        elif op < 0.62:  # borrar un snapshot cualquiera
            db.execute(
                "DELETE FROM price_snapshots WHERE run_id = %s AND store_id = %s AND sku = %s", (run, store_id, sku)
            )
            db.execute("DELETE FROM menu_price_snapshots WHERE run_id = %s AND item_id = %s", (run, dish))
        elif op < 0.80:  # corregir la fecha (hacia atrás o adelante) y el precio
            db.execute(
                "UPDATE price_snapshots SET scraped_at = %s, price = price + 1"
                " WHERE run_id = %s AND store_id = %s AND sku = %s",
                (when, run, store_id, sku),
            )
            db.execute(
                "UPDATE menu_price_snapshots SET scraped_at = %s WHERE run_id = %s AND item_id = %s", (when, run, dish)
            )
        elif op < 0.92:  # una sentencia que toca varias filas, y borrar el último snapshot de un SKU
            db.execute(
                "UPDATE price_snapshots SET scraped_at = scraped_at + interval '1 day' WHERE store_id = %s", (store_id,)
            )
            db.execute(
                """DELETE FROM price_snapshots WHERE store_id = %(s)s AND sku = %(k)s AND run_id = (
                       SELECT run_id FROM price_snapshots WHERE store_id = %(s)s AND sku = %(k)s
                       ORDER BY scraped_at DESC, run_id DESC LIMIT 1)""",
                {"s": store_id, "k": sku},
            )
        elif op < 0.97:  # el mismo SKU en todas las corridas a la vez (empate en la fecha)
            db.execute(
                "INSERT INTO price_snapshots (run_id, store_id, sku, price, scraped_at)"
                " SELECT r, %s, %s, 10 + r, %s FROM unnest(%s::bigint[]) r ON CONFLICT DO NOTHING",
                (store_id, sku, when, runs),
            )
        else:  # borrar una corrida entera (en cascada) y abrir otra
            db.execute("DELETE FROM scrape_runs WHERE run_id = %s", (run,))
            runs[runs.index(run)] = repository.start_run(db, "stores", {})
        _assert_matches_history(db, step)

    assert db.execute("SELECT count(*) FROM latest_prices").fetchone()[0] > 0  # no es una comprobación vacía
    db.execute("DELETE FROM store_products WHERE store_id = 2 AND sku = 'a'")  # en cascada desde el producto
    db.execute("DELETE FROM menu_items WHERE item_id = 2")
    _assert_matches_history(db, "productos borrados")
    db.execute("TRUNCATE scrape_runs CASCADE")
    assert db.execute("SELECT count(*) FROM latest_prices").fetchone()[0] == 0
    assert db.execute("SELECT count(*) FROM latest_menu_prices").fetchone()[0] == 0
