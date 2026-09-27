"""Reporte de cobertura de la capa 2: cuánto del catálogo y de los menús tiene concepto, y cómo se asignó."""

from psycopg import Connection

MIN_COVERAGE_PCT = 85  # meta de la etapa 1 (docs/diseno-ia.md §7)


def coverage_report(conn: Connection) -> dict:
    by_vertical = conn.execute(
        """SELECT iv.vertical, count(DISTINCT iv.master_product_id), count(DISTINCT ic.entity_id)
           FROM v_item_verticals iv
           LEFT JOIN item_concepts ic ON ic.entity_type = 'catalog_item' AND ic.entity_id = iv.master_product_id::text
           GROUP BY 1
           UNION ALL
           SELECT 'restaurantes', count(*), count(ic.entity_id)
           FROM menu_items mi
           LEFT JOIN item_concepts ic ON ic.entity_type = 'menu_item' AND ic.entity_id = mi.item_id::text
           ORDER BY 2 DESC"""
    ).fetchall()
    totals = conn.execute(
        """SELECT 'catalog_item', count(*), count(ic.entity_id) FROM catalog_items i
           LEFT JOIN item_concepts ic ON ic.entity_type = 'catalog_item' AND ic.entity_id = i.master_product_id::text
           UNION ALL
           SELECT 'menu_item', count(*), count(ic.entity_id) FROM menu_items mi
           LEFT JOIN item_concepts ic ON ic.entity_type = 'menu_item' AND ic.entity_id = mi.item_id::text"""
    ).fetchall()
    by_method = conn.execute(
        "SELECT entity_type, method, count(*) FROM item_concepts GROUP BY 1, 2 ORDER BY 1, 3 DESC"
    ).fetchall()
    top_concepts = conn.execute(
        """SELECT c.emoji || ' ' || c.name, count(*) FROM item_concepts ic JOIN concepts c USING (concept_id)
           GROUP BY 1 ORDER BY 2 DESC LIMIT 15"""
    ).fetchall()
    empty_concepts = conn.execute(
        """SELECT c.concept_id FROM concepts c
           WHERE c.parent_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM item_concepts ic WHERE ic.concept_id = c.concept_id)
           ORDER BY 1"""
    ).fetchall()
    return {
        "totales": {kind: _pct_row(total, mapped) for kind, total, mapped in totals},
        "por_vertical": {vertical: _pct_row(total, mapped) for vertical, total, mapped in by_vertical},
        "por_metodo": [{"tipo": t, "metodo": m, "n": n} for t, m, n in by_method],
        "conceptos_top": [{"concepto": name, "n": n} for name, n in top_concepts],
        "conceptos_sin_items": [row[0] for row in empty_concepts],
    }


def render_text(report: dict) -> str:
    lines = []
    warnings = [
        f"{kind} {row['pct']}%"
        for kind, row in report["totales"].items()
        if row["total"] and row["pct"] < MIN_COVERAGE_PCT
    ]
    lines.append(
        f"⚠ Cobertura bajo {MIN_COVERAGE_PCT}%: {', '.join(warnings)}"
        if warnings
        else f"✓ Cobertura ≥ {MIN_COVERAGE_PCT}% en productos y platos"
    )
    lines.append("")
    lines.append("Cobertura por vertical (con concepto / total):")
    for vertical, row in report["por_vertical"].items():
        lines.append(f"  {vertical:<14} {row['mapped']:>7} / {row['total']:<7} {row['pct']:>5}%")
    lines.append("")
    lines.append("Cómo se asignó:")
    for row in report["por_metodo"]:
        lines.append(f"  {row['tipo']:<13} {row['metodo']:<10} {row['n']:>7}")
    lines.append("")
    top = ", ".join(f"{r['concepto']} ({r['n']})" for r in report["conceptos_top"])
    lines.append(f"Conceptos con más ítems: {top}")
    if report["conceptos_sin_items"]:
        lines.append("Conceptos sin ítems todavía: " + ", ".join(report["conceptos_sin_items"]))
    return "\n".join(lines)


def _pct_row(total: int, mapped: int) -> dict:
    return {"total": total, "mapped": mapped, "pct": round(100 * mapped / total, 1) if total else 0.0}
