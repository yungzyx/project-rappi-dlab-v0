"""Catálogo de prueba inventado: ocho verticales con tiendas, productos, platos y precios.

Todo es inventado (nada sale del catálogo descargado de rappi.cl) y cada nombre lleva «prueba». Sirve para la
verificación de punta a punta (`make mvp-check`) y para los tests de contrato de la API. Solo se carga en una base
cuyo nombre termina en `_test`: `reset_test_database` la borra entera antes de sembrar.
"""

import sys
from urllib.parse import urlparse

from psycopg import Connection
from rappi_scraper.storage.search import build_search_documents

from ..concepts.pipeline import build_concepts
from ..db import migrate

DEMO_VERTICALS = (
    "supermercado",
    "conveniencia",
    "turbo",
    "licores",
    "farmacia",
    "mall",
    "chocolateria",
    "restaurantes",
)

CITY = "Santiago"

# Dos tiendas por vertical: (store_id, nombre). Los precios de cada producto se dan en ese mismo orden.
# fmt: off
_STORES = {
    "supermercado": ((9101, "Supermercado de prueba Centro"), (9102, "Supermercado de prueba Norte")),
    "conveniencia": ((9201, "Tienda express de prueba Centro"), (9202, "Tienda express de prueba Oriente")),
    "turbo": ((9301, "Tienda turbo de prueba Centro"), (9302, "Tienda turbo de prueba Sur")),
    "licores": ((9401, "Botillería de prueba Centro"), (9402, "Botillería de prueba Oriente")),
    "farmacia": ((9501, "Farmacia de prueba Centro"), (9502, "Farmacia de prueba Sur")),
    "mall": ((9601, "Tienda mall de prueba Centro"), (9602, "Tienda mall de prueba Norte")),
    "chocolateria": ((9701, "Chocolatería de prueba Centro"), (9702, "Chocolatería de prueba Oriente")),
    "restaurantes": ((9801, "Pizzería de prueba Centro"), (9802, "Sushi y hamburguesas de prueba Norte")),
}
# fmt: on

# (master_product_id, nombre, categoría de Rappi, +18, {vertical: (precio en la 1.ª tienda, precio en la 2.ª)}).
# Las categorías están en concepts/category_map.csv: así `build_concepts` asigna concepto en cada vertical.
# Un producto que figura en varios verticales (la cerveza, las papas, los pañales) es uno solo del catálogo.
# fmt: off
_PRODUCTS = [
    (91001, "Papas fritas clásicas 180 g (prueba)", "Snacks salados", False,
     {"supermercado": (1990, 2090), "conveniencia": (2290, None), "turbo": (2490, 2490)}),
    (91002, "Galletas de vainilla 200 g (prueba)", "Galletas", False, {"supermercado": (1290, 1350)}),
    (91003, "Gaseosa cola 1,5 L (prueba)", "Gaseosas", False, {"supermercado": (1790, 1850)}),
    (91004, "Café molido tostado 250 g (prueba)", "Café", False, {"supermercado": (3990, 4190)}),
    (91005, "Jugo de naranja 1 L (prueba)", "Jugos", False, {"supermercado": (1590, 1590)}),
    (91006, "Arroz grado 1 de 1 kg (prueba)", "Arroz", False, {"supermercado": (1290, 1250)}),
    (91007, "Pañales talla M x 40 (prueba)", "Pañales", False,
     {"supermercado": (8990, 9290), "farmacia": (9490, None)}),
    (92001, "Gaseosa cola 500 cc (prueba)", "Gaseosas", False, {"conveniencia": (1290, 1290), "turbo": (1390, None)}),
    (92002, "Chocolate con leche 100 g (prueba)", "Chocolates", False,
     {"conveniencia": (1490, 1590), "chocolateria": (1690, 1690)}),
    (92003, "Agua mineral sin gas 600 cc (prueba)", "Agua Natural", False,
     {"conveniencia": (890, 890), "turbo": (990, 990)}),
    (92004, "Bebida energética 250 cc (prueba)", "Energizantes", False,
     {"conveniencia": (1590, 1590), "turbo": (1690, 1690)}),
    (92005, "Gomitas ácidas 150 g (prueba)", "Gomitas y caramelos", False, {"conveniencia": (1190, 1190)}),
    (93001, "Helado de vainilla 1 L (prueba)", "Helados", False, {"turbo": (3990, 4190)}),
    (93002, "Hielo en cubos 2 kg (prueba)", "Hielo", False, {"turbo": (1490, 1490)}),
    (93003, "Té helado durazno 500 cc (prueba)", "Té listo", False, {"turbo": (1290, None)}),
    (94001, "Cerveza rubia lata 470 cc (prueba)", "Cervezas", True,
     {"licores": (1290, 1190), "supermercado": (1390, 1390), "conveniencia": (1490, 1490), "turbo": (1590, 1590)}),
    (94002, "Cerveza negra botella 330 cc (prueba)", "Cervezas", True, {"licores": (1790, 1790)}),
    (94003, "Vino tinto reserva 750 cc (prueba)", "Vino tinto", True, {"licores": (5990, 5790)}),
    (94004, "Vino blanco sauvignon 750 cc (prueba)", "Vino blanco", True, {"licores": (5490, 5490)}),
    (94005, "Pisco 35° 750 cc (prueba)", "Pisco", True, {"licores": (6990, 7190)}),
    (94006, "Whisky 12 años 700 cc (prueba)", "Whiskys", True, {"licores": (24990, 25990)}),
    (94007, "Ron añejo 750 cc (prueba)", "Rones", True, {"licores": (9990, 9990)}),
    (94008, "Espumante brut 750 cc (prueba)", "Espumantes", True, {"licores": (6490, 6490)}),
    (95001, "Paracetamol 500 mg 16 comprimidos (prueba)", "Analgésicos sistémicos", False, {"farmacia": (1990, 2190)}),
    (95002, "Ibuprofeno 400 mg 20 comprimidos (prueba)", "Analgésicos sistémicos", False, {"farmacia": (2490, 2490)}),
    (95003, "Vitamina C 1 g 30 comprimidos (prueba)", "Vitaminas y multivitamínicos", False,
     {"farmacia": (4990, 5190)}),
    (95004, "Cepillo dental suave (prueba)", "Cepillos dentales", False, {"farmacia": (1990, 1990)}),
    (95005, "Desodorante en barra 50 g (prueba)", "Desodorantes", False, {"farmacia": (2990, 3090)}),
    (95006, "Toallas higiénicas ultradelgadas x 10 (prueba)", "Toallas higiénicas", False, {"farmacia": (1790, 1790)}),
    (95007, "Protector solar FPS 50 120 ml (prueba)", "Protectores solares corporales", False,
     {"farmacia": (8990, 9490)}),
    (96001, "Perfume floral 100 ml (prueba)", "Fragancias", False, {"mall": (24990, 25990)}),
    (96002, "Aros plateados pequeños, par (prueba)", "Aretes y Earcuff", False, {"mall": (3990, 3990)}),
    (96003, "Collar de cadena dorada (prueba)", "Collares y Cadenas", False, {"mall": (5990, 6290)}),
    (96004, "Pulsera trenzada de hilo (prueba)", "Pulseras y Tobilleras", False, {"mall": (2990, 2990)}),
    (96005, "Juguete didáctico de encaje (prueba)", "Juguetes didácticos", False, {"mall": (6990, 7490)}),
    (96006, "Set de utensilios de cocina x 5 (prueba)", "Utensilios de Cocina", False, {"mall": (9990, 9990)}),
    (96007, "Vela aromática de vainilla (prueba)", "Velas", False, {"mall": (3490, 3490)}),
    (96008, "Shampoo reparador 400 ml (prueba)", "Shampoo", False, {"mall": (4990, 4990)}),
    (97001, "Chocolate amargo 70 % 100 g (prueba)", "Chocolates", False, {"chocolateria": (2490, 2590)}),
    (97002, "Bombones surtidos caja x 12 (prueba)", "Chocolates", False, {"chocolateria": (7990, 7990)}),
    (97003, "Trufas de chocolate x 6 (prueba)", "Chocolates", False, {"chocolateria": (4990, 5190)}),
    (97004, "Torta de chocolate porción (prueba)", "Tortas y ponques", False, {"chocolateria": (3490, 3490)}),
    (97005, "Brownie con nueces (prueba)", "Postres", False, {"chocolateria": (2490, 2490)}),
    (97006, "Helado de chocolate 500 cc (prueba)", "Helados", False, {"chocolateria": (3990, 3990)}),
    (97007, "Galletas con chips de chocolate 150 g (prueba)", "Galletas", False, {"chocolateria": (1990, 1990)}),
]
# fmt: on

# Menús de los dos restaurantes, en el orden de _STORES["restaurantes"]:
# (cocinas, {sección: [(item_id, plato, precio)]}).
# Las secciones y cocinas son de category_map.csv (tipos «seccion_menu» y «cocina»); los platos que nombran su tipo
# (pizza, roll, hamburguesa) también calzan por regla.
_MENUS = [
    (
        ["Pizzas"],
        {
            "Pizzas": [
                (98001, "Pizza pepperoni familiar (prueba)", 12990),
                (98002, "Pizza margarita mediana (prueba)", 8990),
            ],
            "Bebidas": [(98003, "Bebida cola 500 cc (prueba)", 1990)],
            "Postres": [(98004, "Tiramisú individual (prueba)", 3990)],
        },
    ),
    (
        ["Sushi", "Hamburguesa"],
        {
            "Rolls": [
                (98005, "Roll california 10 piezas (prueba)", 6990),
                (98006, "Roll salmón palta 10 piezas (prueba)", 7490),
            ],
            "Hamburguesas": [(98007, "Hamburguesa doble queso (prueba)", 6490)],
            "Bebidas": [(98008, "Jugo natural de naranja (prueba)", 2490)],
        },
    ),
]


def ensure_test_database(url: str) -> None:
    """Se detiene (código 2) si la base no es de prueba: `seed-demo` la borra entera antes de sembrar."""
    name = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    if not name.endswith("_test"):
        print(
            f"Por seguridad, seed-demo solo siembra una base de prueba (nombre terminado en _test), no {name}",
            file=sys.stderr,
        )
        raise SystemExit(2)


def reset_test_database(conn: Connection) -> None:
    """Deja la base vacía con todas las migraciones aplicadas (borra los esquemas `capa` y `public`)."""
    conn.execute("DROP SCHEMA IF EXISTS capa CASCADE")
    conn.execute("DROP SCHEMA public CASCADE")
    conn.execute("CREATE SCHEMA public")
    conn.commit()
    migrate(conn)


def seed_demo(conn: Connection) -> dict[str, int]:
    """Carga el catálogo inventado en una base recién migrada, arma los documentos de búsqueda y asigna conceptos.
    Devuelve los ítems (productos y platos) de cada vertical."""
    _insert_stores(conn)
    _insert_products(conn)
    _insert_restaurants(conn)
    conn.commit()
    build_search_documents(conn)
    build_concepts(conn)
    counted = dict(
        conn.execute(
            """SELECT vertical, count(*) FROM search_documents
               WHERE entity_type IN ('catalog_item', 'menu_item') GROUP BY 1"""
        ).fetchall()
    )
    return {vertical: counted.get(vertical, 0) for vertical in DEMO_VERTICALS}


def _insert_stores(conn: Connection) -> None:
    for vertical, stores in _STORES.items():
        for store_id, name in stores:
            # Un formato propio por tienda (store_type): v_store_verticals cruza las tiendas del mismo formato.
            store_type = "restaurant" if vertical == "restaurantes" else f"prueba_{store_id}"
            conn.execute(
                "INSERT INTO stores (store_id, name, store_type, city, path) VALUES (%s, %s, %s, %s, %s)",
                (store_id, name, store_type, CITY, f"/tiendas/{store_id}"),
            )
            conn.execute("INSERT INTO store_verticals (store_id, vertical) VALUES (%s, %s)", (store_id, vertical))


def _insert_products(conn: Connection) -> None:
    # Todos los precios en una misma corrida, como una descarga real.
    run_id = conn.execute(
        "INSERT INTO scrape_runs (kind, status) VALUES ('stores', 'done') RETURNING run_id"
    ).fetchone()[0]
    category_ids = {}
    for product_id, name, category, adult, offers in _PRODUCTS:
        if category not in category_ids:
            category_ids[category] = len(category_ids) + 1
            conn.execute(
                "INSERT INTO categories (category_id, name) VALUES (%s, %s)", (category_ids[category], category)
            )
        conn.execute(
            """INSERT INTO catalog_items (master_product_id, name, category_id, is_alcoholic, age_restricted)
               VALUES (%s, %s, %s, %s, %s)""",
            (product_id, name, category_ids[category], adult, adult),
        )
        for vertical, prices in offers.items():
            for (store_id, _), price in zip(_STORES[vertical], prices, strict=True):
                if price is None:
                    continue
                sku = f"sku-{product_id}"
                conn.execute(
                    "INSERT INTO store_products (store_id, sku, master_product_id) VALUES (%s, %s, %s)",
                    (store_id, sku, product_id),
                )
                conn.execute(
                    """INSERT INTO price_snapshots (run_id, store_id, sku, price, in_stock)
                       VALUES (%s, %s, %s, %s, true)""",
                    (run_id, store_id, sku, price),
                )


def _insert_restaurants(conn: Connection) -> None:
    run_id = conn.execute(
        "INSERT INTO scrape_runs (kind, status) VALUES ('restaurants', 'done') RETURNING run_id"
    ).fetchone()[0]
    for (store_id, _), (cuisines, sections) in zip(_STORES["restaurantes"], _MENUS, strict=True):
        for cuisine in cuisines:
            conn.execute("INSERT INTO cuisines (name) VALUES (%s) ON CONFLICT DO NOTHING", (cuisine,))
            conn.execute("INSERT INTO restaurant_cuisines (store_id, cuisine) VALUES (%s, %s)", (store_id, cuisine))
        for position, (section, dishes) in enumerate(sections.items()):
            section_id = position + 1
            conn.execute(
                "INSERT INTO menu_sections (store_id, section_id, name, position) VALUES (%s, %s, %s, %s)",
                (store_id, section_id, section, position),
            )
            for item_id, name, price in dishes:
                conn.execute(
                    """INSERT INTO menu_items (item_id, rappi_item_id, store_id, section_id, name)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (item_id, item_id, store_id, section_id, name),
                )
                conn.execute(
                    "INSERT INTO menu_price_snapshots (run_id, item_id, price, is_available) VALUES (%s, %s, %s, true)",
                    (run_id, item_id, price),
                )
