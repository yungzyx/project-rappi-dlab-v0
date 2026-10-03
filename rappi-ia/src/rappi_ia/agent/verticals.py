"""En qué vertical buscar un concepto: donde es más típico, no donde hay más ítems.

Restaurantes tiene unas 5 veces más ítems que el súper y casi todos sus locales listan bebidas, papas fritas o
schop; por cantidad ganaría casi cualquier concepto. Por eso se compara la participación del concepto en el
catálogo de cada vertical (ítems del concepto / ítems del vertical), y restaurantes solo compite cuando el
concepto se pide hecho: comida preparada, postres o café.
"""

from psycopg import Connection

PREPARED_GROUPS = ("comida", "dulces")
PREPARED_CONCEPTS = ("cafe",)


def ranked_verticals(conn: Connection, concept_ids: list[str]) -> list[str]:
    """Verticales con oferta de los conceptos, del más típico al menos típico."""
    rows = conn.execute(
        """WITH total AS (SELECT vertical, sum(items) AS items FROM concept_assortment GROUP BY vertical)
           SELECT a.vertical
           FROM concept_assortment a
           JOIN total t USING (vertical)
           JOIN concepts c USING (concept_id)
           WHERE a.concept_id = ANY(%(ids)s) AND a.items > 0
             AND (a.vertical <> 'restaurantes' OR c.parent_id = ANY(%(groups)s) OR c.concept_id = ANY(%(prepared)s))
           GROUP BY a.vertical
           ORDER BY sum(a.items)::float / max(t.items) DESC, a.vertical""",
        {"ids": concept_ids, "groups": list(PREPARED_GROUPS), "prepared": list(PREPARED_CONCEPTS)},
    ).fetchall()
    return [r[0] for r in rows]


LOGO_BASE_URL = "https://images.rappi.cl/marketplace/"  # el scraper guarda solo el archivo del logo
STORES_PER_VERTICAL = 2
MIN_ITEMS_ELSEWHERE = 5  # con 1 o 2 productos (p. ej. hamburguesas congeladas en el mall) no vale la pena mostrarla


def available_elsewhere(conn: Connection, concept_id: str, exclude: set[str], limit: int = 3) -> list[dict]:
    """Otras verticales con oferta del concepto (las más típicas primero), con sus tiendas de más surtido."""
    items = dict(
        conn.execute("SELECT vertical, items FROM concept_assortment WHERE concept_id = %s", (concept_id,)).fetchall()
    )
    verticals = [
        v for v in ranked_verticals(conn, [concept_id]) if v not in exclude and items[v] >= MIN_ITEMS_ELSEWHERE
    ][:limit]
    if not verticals:
        return []
    stores: dict[str, list[dict]] = {v: [] for v in verticals}
    rows = conn.execute(
        """WITH items AS (
               SELECT sp.store_id FROM item_concepts ic
               JOIN store_products sp ON sp.master_product_id::text = ic.entity_id
               WHERE ic.entity_type = 'catalog_item' AND ic.concept_id = %(concept)s
               UNION ALL
               SELECT mi.store_id FROM item_concepts ic
               JOIN menu_items mi ON mi.item_id::text = ic.entity_id
               WHERE ic.entity_type = 'menu_item' AND ic.concept_id = %(concept)s
           )
           SELECT sv.vertical, trim(s.name), max(nullif(s.raw ->> 'image', '')), count(*) AS n
           FROM items i JOIN stores s USING (store_id) JOIN store_verticals sv USING (store_id)
           WHERE sv.vertical = ANY(%(verticals)s)
           GROUP BY 1, 2
           ORDER BY n DESC, 2""",
        {"concept": concept_id, "verticals": verticals},
    ).fetchall()
    # Una entrada por nombre (las sucursales se repiten) y sin repetir tienda entre verticales: las cadenas
    # grandes están en varias a la vez y la fila mostraría siempre las mismas.
    seen: set[str] = set()
    for vertical, name, logo, _ in rows:
        if len(stores[vertical]) < STORES_PER_VERTICAL and name.lower() not in seen:
            seen.add(name.lower())
            stores[vertical].append({"name": name, "logo": LOGO_BASE_URL + logo if logo else None})
    for vertical, name, logo, _ in rows:  # mejor una tienda repetida que una vertical sin tiendas
        if not stores[vertical]:
            stores[vertical].append({"name": name, "logo": LOGO_BASE_URL + logo if logo else None})
    return [{"vertical": v, "items": items.get(v, 0), "stores": stores[v]} for v in verticals]
