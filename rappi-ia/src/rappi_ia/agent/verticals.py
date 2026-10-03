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
