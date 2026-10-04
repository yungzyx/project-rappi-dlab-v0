"""Arma `search_documents` (uno por entidad y vertical) y permite buscar por texto dentro de un vertical.

El texto (`content`) no incluye precios: así un cambio de precio no obliga a regenerar el
embedding. Si el texto cambia (otro `content_hash`), el embedding guardado se invalida.
"""

from psycopg import Connection

VERTICALS = ("supermercado", "conveniencia", "turbo", "mall", "farmacia", "licores", "chocolateria", "restaurantes")

# Bajo $10 no hay precio real en pesos chilenos: un plato a $0 o $1 es de relleno (su precio depende de las opciones
# que se elijan) y pasaba cualquier tope de precio. Se trata como precio desconocido.
MIN_PRICE = 10

# Clave de pg_advisory_xact_lock para reescribir search_documents. rappi-ia la toma antes de copiar vectores: sin
# ella, su UPDATE masivo y el upsert de abajo bloquean filas en distinto orden (deadlock). No sirve mirar
# scrape_runs: la corrida ya quedó 'done' cuando empieza esta reescritura.
SEARCH_DOCUMENTS_LOCK = 72_001

# Los documentos se arman primero en una tabla temporal y solo se escriben los que cambiaron: reescribir las
# ~300 mil filas en cada refresh insertaba cada una de nuevo en todos los índices (GIN y HNSW por partición).
_STAGE = """
CREATE TEMP TABLE staged_documents (
    vertical text, entity_type text, entity_id text, content text, metadata jsonb, content_hash text
) ON COMMIT DROP
"""

_UPSERT = """
INSERT INTO search_documents (vertical, entity_type, entity_id, content, metadata, content_hash)
SELECT vertical, entity_type, entity_id, content, metadata, content_hash FROM staged_documents
ON CONFLICT (vertical, entity_type, entity_id) DO UPDATE SET
    content = EXCLUDED.content,
    metadata = EXCLUDED.metadata,
    content_hash = EXCLUDED.content_hash,
    embedding = CASE WHEN search_documents.content_hash = EXCLUDED.content_hash
                     THEN search_documents.embedding END,
    embedding_model = CASE WHEN search_documents.content_hash = EXCLUDED.content_hash
                           THEN search_documents.embedding_model END,
    updated_at = now()
WHERE (search_documents.content_hash, search_documents.metadata)
      IS DISTINCT FROM (EXCLUDED.content_hash, EXCLUDED.metadata)
"""

_DELETE_STALE = """
DELETE FROM search_documents d
WHERE NOT EXISTS (SELECT 1 FROM staged_documents s
                  WHERE s.vertical = d.vertical AND s.entity_type = d.entity_type AND s.entity_id = d.entity_id)
"""

# Los precios se agregan una sola vez por (producto, vertical) en CTEs; hacerlo con un
# LATERAL por producto recalculaba el último precio de todo el historial en cada fila.
CATALOG_DOCS = """
WITH latest AS (
    SELECT DISTINCT ON (store_id, sku) store_id, sku, price
    FROM price_snapshots
    ORDER BY store_id, sku, scraped_at DESC
),
store_vertical AS (SELECT DISTINCT store_id, vertical FROM v_store_verticals),
prices AS (
    SELECT sp.master_product_id, sv.vertical,
           min(l.price) AS precio_min, max(l.price) AS precio_max,
           array_agg(DISTINCT COALESCE(b.name, s.name)) AS cadenas
    FROM store_products sp
    JOIN store_vertical sv ON sv.store_id = sp.store_id
    JOIN latest l ON l.store_id = sp.store_id AND l.sku = sp.sku
    JOIN stores s ON s.store_id = sp.store_id
    LEFT JOIN brands b ON b.brand_id = s.brand_id
    WHERE sp.master_product_id IS NOT NULL
    GROUP BY sp.master_product_id, sv.vertical
)
INSERT INTO staged_documents (vertical, entity_type, entity_id, content, metadata, content_hash)
SELECT iv.vertical, 'catalog_item', ci.master_product_id::text, d.content,
       jsonb_strip_nulls(jsonb_build_object(
           'master_product_id', ci.master_product_id, 'categoria', c.name, 'marca', NULLIF(ci.trademark, ''),
           'subverticales', iv.subverticals, 'tiendas', iv.stores, 'cadenas', p.cadenas,
           'precio_min', p.precio_min, 'precio_max', p.precio_max, 'imagen', NULLIF(ci.image_url, ''),
           'alcohol', ci.is_alcoholic, 'restriccion_edad', ci.age_restricted)),
       md5(d.content)
FROM v_item_verticals iv
JOIN catalog_items ci USING (master_product_id)
LEFT JOIN categories c USING (category_id)
CROSS JOIN LATERAL (SELECT concat_ws('. ', clean_html(ci.name), 'Marca: ' || NULLIF(ci.trademark, ''),
                                     NULLIF(ci.presentation, ''), 'Categoría: ' || c.name,
                                     NULLIF(NULLIF(clean_html(ci.description), ''), ci.name)) AS content) d
LEFT JOIN prices p ON p.master_product_id = iv.master_product_id AND p.vertical = iv.vertical
"""

MENU_DOCS = f"""
WITH latest AS (
    SELECT DISTINCT ON (item_id) item_id, price, real_price
    FROM menu_price_snapshots
    ORDER BY item_id, scraped_at DESC
)
INSERT INTO staged_documents (vertical, entity_type, entity_id, content, metadata, content_hash)
SELECT 'restaurantes', 'menu_item', mi.item_id::text, d.content,
       jsonb_strip_nulls(jsonb_build_object(
           'store_id', s.store_id, 'restaurante', s.name, 'cadena', b.name, 'ciudad', NULLIF(s.city, ''),
           'cocinas', cu.cocinas, 'precio', CASE WHEN mp.price >= {MIN_PRICE} THEN mp.price END,
           'precio_normal', mp.real_price,
           'popular', mi.is_popular, 'imagen', NULLIF(mi.image_url, ''))),
       md5(d.content)
FROM menu_items mi
JOIN stores s ON s.store_id = mi.store_id
LEFT JOIN brands b ON b.brand_id = s.brand_id
LEFT JOIN menu_sections ms ON ms.store_id = mi.store_id AND ms.section_id = mi.section_id
LEFT JOIN LATERAL (SELECT string_agg(cuisine, ', ' ORDER BY cuisine) AS cocinas
                   FROM restaurant_cuisines rc WHERE rc.store_id = s.store_id) cu ON true
LEFT JOIN latest mp ON mp.item_id = mi.item_id
CROSS JOIN LATERAL (SELECT concat_ws('. ', clean_html(mi.name), NULLIF(NULLIF(clean_html(mi.description), ''), mi.name),
                                     'Sección: ' || ms.name,
                                     'Restaurante: ' || s.name, 'Cocina: ' || cu.cocinas) AS content) d
"""

STORE_DOCS = """
INSERT INTO staged_documents (vertical, entity_type, entity_id, content, metadata, content_hash)
SELECT DISTINCT ON (vsv.vertical, s.store_id)
       vsv.vertical, 'store', s.store_id::text, d.content,
       jsonb_strip_nulls(jsonb_build_object(
           'store_id', s.store_id, 'cadena', b.name, 'ciudad', NULLIF(s.city, ''),
           'subvertical', COALESCE(vsv.subvertical, NULLIF(s.sub_group, '')), 'path', s.path)),
       md5(d.content)
FROM stores s
JOIN v_store_verticals vsv ON vsv.store_id = s.store_id
LEFT JOIN brands b ON b.brand_id = s.brand_id
LEFT JOIN LATERAL (SELECT string_agg(cuisine, ', ' ORDER BY cuisine) AS cocinas
                   FROM restaurant_cuisines rc WHERE rc.store_id = s.store_id) cu ON true
LEFT JOIN LATERAL (SELECT string_agg(a.name, ', ' ORDER BY a.product_count_declared DESC NULLS LAST) AS pasillos
                   FROM aisles a WHERE a.store_id = s.store_id AND a.parent_aisle_id IS NULL) pa ON true
CROSS JOIN LATERAL (SELECT concat_ws('. ', s.name, 'Marca: ' || b.name,
                                     'Tipo: ' || COALESCE(vsv.subvertical, NULLIF(s.sub_group, '')),
                                     'Cocina: ' || cu.cocinas, 'Pasillos: ' || pa.pasillos,
                                     'Ciudad: ' || NULLIF(s.city, '')) AS content) d
WHERE EXISTS (SELECT 1 FROM store_products sp WHERE sp.store_id = s.store_id)
   OR EXISTS (SELECT 1 FROM menu_items mi WHERE mi.store_id = s.store_id)
ORDER BY vsv.vertical, s.store_id, vsv.subvertical NULLS LAST
"""


def build_search_documents(conn: Connection) -> dict[str, int]:
    """Regenera los documentos a partir de las tablas núcleo. Devuelve documentos armados por tipo, cuántos se
    escribieron (nuevos o con otro texto, precio o metadatos) y cuántos se borraron (ya no existen)."""
    counts = {}
    with conn.transaction():
        conn.execute("SELECT pg_advisory_xact_lock(%s)", (SEARCH_DOCUMENTS_LOCK,))
        conn.execute("DROP TABLE IF EXISTS pg_temp.staged_documents")
        conn.execute(_STAGE)
        for name, sql in (("catalog_item", CATALOG_DOCS), ("menu_item", MENU_DOCS), ("store", STORE_DOCS)):
            counts[name] = conn.execute(sql).rowcount
        conn.execute("ANALYZE staged_documents")
        counts["escritos"] = conn.execute(_UPSERT).rowcount
        counts["eliminados"] = conn.execute(_DELETE_STALE).rowcount
    return counts


def search(conn: Connection, vertical: str, query: str, limit: int = 10) -> list[dict]:
    """Búsqueda por texto (español) **dentro de un solo vertical**."""
    if vertical not in VERTICALS:
        raise ValueError(f"Vertical desconocido: {vertical!r}. Opciones: {', '.join(VERTICALS)}")
    rows = conn.execute(
        """
        SELECT entity_type, entity_id, content, metadata, ts_rank(tsv, q) AS rank
        FROM search_documents, websearch_to_tsquery('spanish', %s) q
        WHERE vertical = %s AND tsv @@ q
        ORDER BY rank DESC
        LIMIT %s
        """,
        (query, vertical, limit),
    ).fetchall()
    return [{"entity_type": r[0], "entity_id": r[1], "content": r[2], "metadata": r[3], "rank": r[4]} for r in rows]
