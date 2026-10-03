"""Mapa multivertical de la presentación: qué productos y conceptos comparten las verticales del catálogo.

`rappi-ia multivertical` escribe una página autocontenida (sin internet) en dashboard-empresa/public/presentacion/:
productos compartidos entre verticales, el mapa radial de conceptos (cada uno junto a la vertical donde es más
típico, la misma regla de Bigotes) y los productos y cadenas que están en más verticales.
"""

import json
from pathlib import Path

from psycopg import Connection

from .. import config
from ..agent.verticals import typical_verticals

TEMPLATE = Path(__file__).resolve().parent / "multivertical.html"
OUTPUT = config.PROJECT_ROOT.parent / "dashboard-empresa" / "public" / "presentacion" / "mapa-multivertical.html"
ORDER = ["supermercado", "conveniencia", "turbo", "licores", "chocolateria", "restaurantes", "farmacia", "mall"]
LABELS = {
    "supermercado": "Súper",
    "conveniencia": "Express",
    "turbo": "Turbo",
    "licores": "Licores",
    "chocolateria": "Chocolatería",
    "restaurantes": "Restaurantes",
    "farmacia": "Farmacia",
    "mall": "Rappi Mall",
}
MIN_ITEMS = 20  # una línea concepto → vertical necesita al menos estos productos
BRIDGE_MIN_VERTICALS = 5
TOP = 12

_PRODUCT_VERTICALS = """SELECT DISTINCT sp.master_product_id, sv.vertical FROM store_products sp
                        JOIN store_verticals sv USING (store_id)"""


def collect(conn: Connection) -> dict:
    products = dict(conn.execute(f"SELECT vertical, count(*) FROM ({_PRODUCT_VERTICALS}) pv GROUP BY 1").fetchall())
    products["restaurantes"] = conn.execute("SELECT count(*) FROM menu_items").fetchone()[0]
    shared = conn.execute(
        f"""WITH pv AS ({_PRODUCT_VERTICALS})
            SELECT a.vertical, b.vertical, count(*) FROM pv a JOIN pv b USING (master_product_id)
            WHERE a.vertical < b.vertical GROUP BY 1, 2 ORDER BY 1, 2"""
    ).fetchall()
    spread = conn.execute(
        f"""SELECT n, count(*) FROM (
                SELECT master_product_id, count(*) AS n FROM ({_PRODUCT_VERTICALS}) pv GROUP BY 1
            ) x GROUP BY 1 ORDER BY 1"""
    ).fetchall()
    groups = dict(conn.execute("SELECT concept_id, name FROM concepts WHERE parent_id IS NULL").fetchall())
    items_by_concept: dict[str, dict[str, int]] = {}
    for cid, vertical, items in conn.execute(
        "SELECT concept_id, vertical, items FROM concept_assortment WHERE items > 0"
    ):
        items_by_concept.setdefault(cid, {})[vertical] = items
    homes = typical_verticals(conn)
    concepts = []
    for cid, name, emoji, parent, sensitive in conn.execute(
        "SELECT concept_id, name, emoji, parent_id, sensitive FROM concepts WHERE parent_id IS NOT NULL ORDER BY 1"
    ):
        items = items_by_concept.get(cid)
        if not items:
            continue
        home = homes.get(cid) or max(items, key=items.get)
        concepts.append(
            {
                "id": cid,
                "name": name,
                "emoji": emoji,
                "group": groups[parent],
                "sensitive": sensitive,
                "home": home,
                "items": items,
            }
        )
    complements = conn.execute(
        "SELECT from_concept, to_concept, weight FROM concept_edges WHERE method = 'curado' ORDER BY 1, 2"
    ).fetchall()
    bridges = conn.execute(
        """SELECT ci.name, array_agg(DISTINCT sv.vertical), count(DISTINCT sp.store_id)
           FROM catalog_items ci
           JOIN store_products sp USING (master_product_id)
           JOIN store_verticals sv USING (store_id)
           GROUP BY ci.master_product_id, ci.name HAVING count(DISTINCT sv.vertical) >= %s
           ORDER BY count(DISTINCT sv.vertical) DESC, count(DISTINCT sp.store_id) DESC, ci.name LIMIT %s""",
        (BRIDGE_MIN_VERTICALS, TOP),
    ).fetchall()
    chains = conn.execute(
        """SELECT trim(s.name), array_agg(DISTINCT sv.vertical), count(*) FROM stores s
           JOIN store_verticals sv USING (store_id) WHERE trim(s.name) <> ''
           GROUP BY 1 HAVING count(DISTINCT sv.vertical) >= 2
           ORDER BY count(DISTINCT sv.vertical) DESC, 3 DESC, 1 LIMIT %s""",
        (TOP,),
    ).fetchall()
    in_order = lambda verticals: sorted(verticals, key=ORDER.index)  # noqa: E731
    return {
        "order": ORDER,
        "labels": LABELS,
        "minItems": MIN_ITEMS,
        "products": products,
        "catalogTotal": conn.execute("SELECT count(*) FROM catalog_items").fetchone()[0],
        "shared": [[a, b, n] for a, b, n in shared],
        "spread": [[n, c] for n, c in spread],
        "concepts": concepts,
        "complements": [[a, b, float(w)] for a, b, w in complements],
        "bridges": [[name, in_order(v), n] for name, v, n in bridges],
        "chains": [[name, in_order(v), n] for name, v, n in chains],
    }


def render(data: dict) -> str:
    # «</» escapado: un nombre del catálogo con «</script>» no puede cerrar el script (JSON lo lee igual).
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    return TEMPLATE.read_text(encoding="utf-8").replace("/*__DATA__*/null", payload)


def write(conn: Connection, path: Path = OUTPUT) -> dict:
    data = collect(conn)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render(data), encoding="utf-8")
    return data
