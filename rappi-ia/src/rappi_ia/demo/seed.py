"""Catálogo de prueba inventado: ocho verticales con tiendas, productos, platos y precios.

Todo es inventado (nada sale del catálogo descargado de rappi.cl) y cada nombre lleva «prueba». Sirve para la
verificación de punta a punta (`make mvp-check`) y para los tests de contrato de la API. Solo se carga en una base
cuyo nombre termina en `_test`: `reset_test_database` la borra entera antes de sembrar.
"""

import re
import sys
from urllib.parse import urlparse

from psycopg import Connection
from psycopg.types.json import Jsonb
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

# Dos sucursales del súper sin ofertas vigentes (no se listan ni se abren): la 9103 es del mismo formato que la 9101
# pero solo salió en una corrida anterior; la 9104 se descubrió en el listado y nunca se bajó.
_OLD_BRANCH = (9103, "Supermercado de prueba Sur (corrida anterior)")
_DISCOVERED_BRANCH = (9104, "Supermercado de prueba Poniente (solo descubierta)")

# Providencia, Santiago: las tiendas de prueba se reparten a unos kilómetros alrededor.
_HOME = (-33.4263, -70.6106)

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

# Más despensa para el súper de prueba: con el café y el arroz de arriba, el pasillo «Despensa» queda con 30 productos
# (una página de 24 y otra de 6). Las tres últimas no están en la segunda tienda. (nombre, categoría, precio)
# fmt: off
_PANTRY = [
    ("Fideos tallarín 400 g", "Pastas", 1290), ("Fideos espirales 400 g", "Pastas", 1290),
    ("Fideos cabello de ángel 400 g", "Pastas", 1190), ("Fideos corbata 400 g", "Pastas", 1290),
    ("Fideos tornillo 400 g", "Pastas", 1290), ("Lasaña seca 200 g", "Pastas", 1590),
    ("Lentejas 400 g", "Granos", 1490), ("Arroz integral 1 kg", "Arroz", 1590),
    ("Aceite de maravilla 1 L", "Aceite", 2990), ("Aceite de maravilla 900 ml", "Aceite", 2690),
    ("Aceite de canola 1 L", "Aceite", 3190), ("Aceite de oliva extra virgen 500 ml", "Aceite", 5990),
    ("Aceite de coco 250 ml", "Aceite", 3490),
    ("Azúcar granulada 1 kg", "Azucar", 1190), ("Azúcar flor 500 g", "Azucar", 1090),
    ("Azúcar rubia 1 kg", "Azucar", 1390), ("Endulzante en polvo 200 g", "Azucar", 2290),
    ("Choclo en lata 300 g", "Otras conservas", 1190), ("Duraznos en conserva 590 g", "Otras conservas", 1990),
    ("Palmitos 400 g", "Otras conservas", 2490), ("Champiñones en lata 400 g", "Otras conservas", 1690),
    ("Arvejas en lata 300 g", "Otras conservas", 990), ("Tomate triturado 400 g", "Otras conservas", 1090),
    ("Harina de trigo 1 kg", "Harina", 1190), ("Harina sin polvos de hornear 1 kg", "Harina", 1090),
    ("Harina de maíz 500 g", "Harina", 1390), ("Premezcla para panqueques 400 g", "Harina", 1990),
    ("Café instantáneo 170 g", "Café", 4990),
]
# fmt: on
_PRODUCTS += [
    (
        91101 + i,
        f"{name} (prueba)",
        category,
        False,
        {"supermercado": (price, price + 100 if i < len(_PANTRY) - 3 else None)},
    )
    for i, (name, category, price) in enumerate(_PANTRY)
]

# Ofertas del súper de prueba Centro (9101) que NO están vigentes, para probar la regla de vigencia:
# (id, nombre, categoría, motivo, precio). «corrida anterior»: su último precio es de una corrida anterior a la que
# bajó el formato de la tienda; «agotado»: su último precio dice in_stock = false. Aparecen en ningún pasillo.
_NOT_CURRENT = [
    (91201, "Atún en lata 170 g (prueba)", "Otras conservas", "corrida anterior", 1890),
    (91202, "Mermelada de damasco 250 g (prueba)", "Mermeladas", "agotado", 1490),
]

# Pasillos y subpasillos del súper, en el orden de Rappi: (pasillo, [(subpasillo, [categorías de Rappi])]). Una
# categoría que no figura aquí es su propio pasillo, sin subpasillos (los licores, la farmacia, el mall…).
_AISLES = [
    (
        "Despensa",
        [
            ("Pastas y legumbres", ["Pastas", "Granos", "Arroz"]),
            ("Aceites y conservas", ["Aceite", "Otras conservas"]),
            ("Harinas y azúcar", ["Harina", "Azucar"]),
            ("Café", ["Café"]),
        ],
    ),
    (
        "Snacks y Dulces",
        [("Snacks", ["Snacks salados"]), ("Galletas", ["Galletas"]), ("Golosinas", ["Gomitas y caramelos"])],
    ),
    (
        "Bebidas",
        [
            ("Gaseosas", ["Gaseosas"]),
            ("Jugos", ["Jugos"]),
            ("Agua y energizantes", ["Agua Natural", "Energizantes", "Té listo"]),
        ],
    ),
    ("Cuidado del bebé", [("Pañales", ["Pañales"])]),
]

# Productos sin foto, para probar que una tarjeta sin imagen no se rompe.
_NO_IMAGE = {97005}

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


def _aisle_layout() -> tuple[dict[str, tuple[int, int | None]], dict[int, tuple[str, int | None]]]:
    """(categoría de Rappi -> (id del pasillo, id del subpasillo), id -> (nombre, id del pasillo padre)).

    El id del pasillo es su posición (100, 200…) y el de cada subpasillo sigue al de su pasillo: ordenar por id es
    ordenar como Rappi. Los mismos ids en todas las tiendas, como en una cadena."""
    of_category: dict[str, tuple[int, int | None]] = {}
    names: dict[int, tuple[str, int | None]] = {}
    for position, (aisle, subaisles) in enumerate(_AISLES, start=1):
        aisle_id = 100 * position
        names[aisle_id] = (aisle, None)
        for offset, (subaisle, categories) in enumerate(subaisles, start=1):
            names[aisle_id + offset] = (subaisle, aisle_id)
            of_category.update(dict.fromkeys(categories, (aisle_id, aisle_id + offset)))
    aisle_id = 100 * len(_AISLES)
    categories = [product[2] for product in _PRODUCTS] + [offer[2] for offer in _NOT_CURRENT]
    for category in dict.fromkeys(categories):
        if category not in of_category:
            aisle_id += 100
            of_category[category] = (aisle_id, None)
            names[aisle_id] = (category, None)
    return of_category, names


_AISLE_OF_CATEGORY, _AISLE_NAMES = _aisle_layout()

# La presentación de Rappi («180 g», «1,5 L»); en este catálogo inventado sale del nombre, y si no lo dice, no hay.
_SIZE = re.compile(r"\d[\d,.]*\s?(?:kg|mg|ml|cc|g|L)\b")


def _presentation(name: str) -> str | None:
    found = _SIZE.search(name)
    return found.group(0) if found else None


def _refuse_non_test(name: str) -> None:
    print(
        f"Por seguridad, seed-demo solo siembra una base de prueba (nombre terminado en _test), no {name}",
        file=sys.stderr,
    )
    raise SystemExit(2)


def ensure_test_database(url: str) -> None:
    """Se detiene (código 2) si la base no es de prueba: `seed-demo` la borra entera antes de sembrar."""
    name = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    if not name.endswith("_test"):
        _refuse_non_test(name)


def reset_test_database(conn: Connection) -> None:
    """Deja la base vacía con todas las migraciones aplicadas (borra los esquemas `capa` y `public`).
    Revisa a qué base está conectada de verdad: `postgresql:///rappi_test?dbname=rappi` pasa la revisión del nombre de
    la URL pero conecta a `rappi`."""
    name = conn.execute("SELECT current_database()").fetchone()[0]
    if not name.endswith("_test"):
        _refuse_non_test(name)
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
    _insert_aisles(conn)
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
    placed = 0
    for vertical, stores in _STORES.items():
        for store_id, name in stores:
            # Un formato propio por tienda (store_type): v_store_verticals cruza las tiendas del mismo formato.
            store_type = "restaurant" if vertical == "restaurantes" else f"prueba_{store_id}"
            if vertical == "restaurantes":
                _insert_store(conn, store_id, name, store_type, vertical)
            else:
                placed += 1
                _insert_store(conn, store_id, name, store_type, vertical, placed)
    # La sucursal de una corrida anterior comparte formato con la 9101; la descubierta no se bajó (sin raw).
    _insert_store(conn, *_OLD_BRANCH, "prueba_9101", "supermercado", placed + 1)
    _insert_store(conn, *_DISCOVERED_BRANCH, "prueba_9104", "supermercado")


def _insert_store(
    conn: Connection, store_id: int, name: str, store_type: str, vertical: str, place: int | None = None
) -> None:
    """Una tienda con su vertical. Con `place`, es una sucursal bajada: tiene coordenadas y el `raw` de Rappi (logo y
    minutos de entrega); sin él, solo está descubierta."""
    lat = lng = raw = None
    if place is not None:
        # Repartidas en una cuadrícula alrededor del punto fijo, sin repetirse (17 es primo).
        lat = _HOME[0] + ((place * 5) % 17 - 8) * 0.004
        lng = _HOME[1] + ((place * 3) % 17 - 8) * 0.004
        raw = Jsonb({"image": f"prueba-{store_id}.png", "eta_value": 20 + 5 * (store_id % 4), "lat": lat, "lng": lng})
    conn.execute(
        """INSERT INTO stores (store_id, name, store_type, city, path, lat, lng, raw)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
        (store_id, name, store_type, CITY, f"/tiendas/{store_id}", lat, lng, raw),
    )
    conn.execute("INSERT INTO store_verticals (store_id, vertical) VALUES (%s, %s)", (store_id, vertical))


def _insert_products(conn: Connection) -> None:
    # Todos los precios de la descarga actual en una misma corrida, como una descarga real; antes hubo otra.
    old_run = conn.execute(
        "INSERT INTO scrape_runs (kind, status, started_at) VALUES ('stores', 'done', now() - interval '7 days') "
        "RETURNING run_id"
    ).fetchone()[0]
    run_id = conn.execute(
        "INSERT INTO scrape_runs (kind, status) VALUES ('stores', 'done') RETURNING run_id"
    ).fetchone()[0]
    category_ids: dict[str, int] = {}
    for product_id, name, category, adult, offers in _PRODUCTS:
        _insert_catalog_item(conn, category_ids, product_id, name, category, adult)
        for vertical, prices in offers.items():
            for (store_id, _), price in zip(_STORES[vertical], prices, strict=True):
                if price is not None:
                    _insert_offer(conn, run_id, store_id, product_id, category, price)

    # Antes de bajar el precio de las papas en el Centro, valían $1.790; la sucursal de una corrida anterior las vendía.
    _insert_snapshot(conn, old_run, 9101, 91001, 1790, old=True)
    _insert_offer(conn, old_run, _OLD_BRANCH[0], 91001, "Snacks salados", 1790, old=True)
    for product_id, name, category, reason, price in _NOT_CURRENT:
        _insert_catalog_item(conn, category_ids, product_id, name, category, False)
        if reason == "corrida anterior":
            _insert_offer(conn, old_run, 9101, product_id, category, price, old=True)
        else:
            _insert_offer(conn, run_id, 9101, product_id, category, price, in_stock=False)


def _insert_catalog_item(
    conn: Connection, category_ids: dict[str, int], product_id: int, name: str, category: str, adult: bool = False
) -> None:
    if category not in category_ids:
        category_ids[category] = len(category_ids) + 1
        conn.execute("INSERT INTO categories (category_id, name) VALUES (%s, %s)", (category_ids[category], category))
    image = None if product_id in _NO_IMAGE else f"https://imagenes.prueba.invalid/productos/{product_id}.png"
    conn.execute(
        """INSERT INTO catalog_items (master_product_id, name, presentation, image_url, category_id, is_alcoholic,
                                      age_restricted)
           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (product_id, name, _presentation(name), image, category_ids[category], adult, adult),
    )


def _insert_offer(
    conn: Connection,
    run_id: int,
    store_id: int,
    product_id: int,
    category: str,
    price: int,
    in_stock: bool = True,
    old: bool = False,
) -> None:
    """El producto en una tienda (con su pasillo y subpasillo) y su precio en una corrida."""
    aisle_id, subaisle_id = _AISLE_OF_CATEGORY[category]
    conn.execute(
        """INSERT INTO store_products (store_id, sku, master_product_id, aisle_id, sub_aisle_id)
           VALUES (%s, %s, %s, %s, %s)""",
        (store_id, f"sku-{product_id}", product_id, aisle_id, subaisle_id),
    )
    _insert_snapshot(conn, run_id, store_id, product_id, price, in_stock, old)


def _insert_snapshot(
    conn: Connection, run_id: int, store_id: int, product_id: int, price: int, in_stock: bool = True, old: bool = False
) -> None:
    conn.execute(
        """INSERT INTO price_snapshots (run_id, store_id, sku, price, in_stock, scraped_at)
           VALUES (%s, %s, %s, %s, %s, now() - make_interval(days => %s))""",
        (run_id, store_id, f"sku-{product_id}", price, in_stock, 7 if old else 0),
    )


def _insert_aisles(conn: Connection) -> None:
    """Los pasillos y subpasillos de cada tienda: los de los productos que tiene (la 9101 tiene uno sin ofertas
    vigentes, «Mermeladas»)."""
    used = conn.execute(
        """SELECT store_id, aisle_id FROM store_products WHERE aisle_id IS NOT NULL
           UNION SELECT store_id, sub_aisle_id FROM store_products WHERE sub_aisle_id IS NOT NULL
           ORDER BY 1, 2"""
    ).fetchall()
    for store_id, aisle_id in used:
        name, parent = _AISLE_NAMES[aisle_id]
        conn.execute(
            "INSERT INTO aisles (store_id, aisle_id, parent_aisle_id, name) VALUES (%s, %s, %s, %s)",
            (store_id, aisle_id, parent, name),
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
