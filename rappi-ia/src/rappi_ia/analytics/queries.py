"""Métricas del panel empresa (definiciones en docs/diseno-ia.md §5). Todas filtran por `source`
('synthetic' o 'prototype'): nunca se mezclan datos simulados con otros.

`as_of` = último evento de esa fuente (los datos simulados terminan en la fecha con que se generaron).
"""

from psycopg import Connection
from psycopg.rows import dict_row

SOURCES = ("synthetic", "prototype")
ACTIVE_DAYS = 30
MULTI_VERTICAL_DAYS = 60
RETENTION_FROM, RETENTION_TO = 61, 120  # "retención" = pidió entre los días 61 y 120 desde su primer pedido
MIN_SUPPORT = 30  # usuarios mínimos para aprender una arista por co-ocurrencia
MIN_GROUP_USERS = 20  # agregados con menos usuarios no se muestran (privacidad)


def _rows(conn: Connection, sql: str, params: dict) -> list[dict]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        return [{k: _plain(v) for k, v in row.items()} for row in cur.fetchall()]


def _plain(value):
    from decimal import Decimal

    return float(value) if isinstance(value, Decimal) else value


def _check(source: str) -> None:
    if source not in SOURCES:
        raise ValueError(f"source debe ser uno de {SOURCES}")


_AS_OF = "(SELECT max(ts) FROM app_events WHERE source = %(source)s)"

# Ritmo por usuario: mediana de días entre pedidos (180 días); con 2 pedidos, el único intervalo acotado a [7, 30].
_RHYTHM = f"""
user_orders AS (
    SELECT user_id, ts, lag(ts) OVER (PARTITION BY user_id ORDER BY ts) AS prev
    FROM app_orders WHERE source = %(source)s AND ts > {_AS_OF} - interval '180 days'
),
rhythm AS (
    SELECT user_id, count(*) + 1 AS orders,
           CASE WHEN count(*) = 1 THEN least(greatest(max(extract(epoch FROM ts - prev) / 86400), 7), 30)
                ELSE percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ts - prev) / 86400) END AS days
    FROM user_orders WHERE prev IS NOT NULL GROUP BY user_id
),
last_order AS (
    SELECT user_id, count(*) AS orders, max(ts) AS last_ts FROM app_orders WHERE source = %(source)s GROUP BY user_id
),
risk AS (
    SELECT l.user_id, l.orders, r.days AS rhythm,
           extract(epoch FROM {_AS_OF} - l.last_ts) / 86400 AS since,
           CASE WHEN l.orders < 2 THEN 'sin_segunda_compra'
                WHEN extract(epoch FROM {_AS_OF} - l.last_ts) / 86400 > greatest(3 * r.days, 45) THEN 'perdido'
                WHEN extract(epoch FROM {_AS_OF} - l.last_ts) / 86400 > greatest(2 * r.days, 21) THEN 'en_riesgo'
                ELSE 'activo' END AS status
    FROM last_order l LEFT JOIN rhythm r USING (user_id)
)"""


def kpis(conn: Connection, source: str = "synthetic") -> dict:
    _check(source)
    [row] = _rows(
        conn,
        f"""WITH {_RHYTHM.strip()},
            active AS (
                SELECT DISTINCT user_id FROM app_events
                WHERE source = %(source)s AND ts > {_AS_OF} - interval '{ACTIVE_DAYS} days'
            ),
            orders30 AS (
                SELECT count(*) AS n FROM app_orders
                WHERE source = %(source)s AND ts > {_AS_OF} - interval '{ACTIVE_DAYS} days'
            ),
            carts AS (
                SELECT cart_id, max(ts) AS last_cart_ts FROM app_events
                WHERE source = %(source)s AND type = 'cart_add' AND cart_id IS NOT NULL GROUP BY cart_id
            ),
            abandoned AS (
                SELECT c.cart_id,
                       NOT EXISTS (SELECT 1 FROM app_orders o WHERE o.cart_id = c.cart_id AND o.source = %(source)s)
                         AND c.last_cart_ts < {_AS_OF} - interval '24 hours' AS is_abandoned
                FROM carts c
            ),
            multi AS (
                SELECT user_id, count(DISTINCT vertical) AS verticals FROM app_orders
                WHERE source = %(source)s AND ts > {_AS_OF} - interval '{MULTI_VERTICAL_DAYS} days' GROUP BY user_id
            ),
            searches AS (
                SELECT count(*) FILTER (WHERE unmet) AS unmet, count(*) AS total FROM app_events
                WHERE source = %(source)s AND type IN ('search', 'chat')
                  AND ts > {_AS_OF} - interval '{ACTIVE_DAYS} days'
            )
            SELECT {_AS_OF} AS as_of,
                   (SELECT count(*) FROM active) AS usuarios_activos,
                   (SELECT n FROM orders30) AS pedidos_30d,
                   round((SELECT n FROM orders30)::numeric / nullif((SELECT count(*) FROM active), 0), 2) AS frecuencia,
                   (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY days)::numeric, 1) FROM rhythm)
                       AS mediana_dias_entre_pedidos,
                   round(100.0 * (SELECT count(*) FILTER (WHERE is_abandoned) FROM abandoned)
                         / nullif((SELECT count(*) FROM abandoned), 0), 1) AS abandono_carrito_pct,
                   round(100.0 * (SELECT count(*) FILTER (WHERE verticals >= 2) FROM multi)
                         / nullif((SELECT count(*) FROM multi), 0), 1) AS multi_vertical_pct,
                   (SELECT count(*) FROM risk WHERE status = 'en_riesgo') AS en_riesgo,
                   (SELECT count(*) FROM risk WHERE status = 'perdido') AS perdidos,
                   round(100.0 * (SELECT unmet FROM searches) / nullif((SELECT total FROM searches), 0), 1)
                       AS busquedas_sin_resultado_pct""",
        {"source": source},
    )
    row["source"] = source
    return row


def weekly(conn: Connection, source: str = "synthetic") -> list[dict]:
    """Serie semanal: usuarios activos, pedidos, frecuencia, abandono de carrito y búsquedas sin resultado."""
    _check(source)
    return _rows(
        conn,
        """WITH ev AS (SELECT * FROM app_events WHERE source = %(source)s),
            weeks AS (SELECT date_trunc('week', ts) AS week FROM ev GROUP BY 1)
           SELECT w.week::date AS semana,
                  (SELECT count(DISTINCT user_id) FROM ev WHERE date_trunc('week', ts) = w.week) AS usuarios_activos,
                  (SELECT count(*) FROM app_orders o WHERE o.source = %(source)s AND date_trunc('week', o.ts) = w.week)
                      AS pedidos,
                  (SELECT round(100.0 * count(*) FILTER (WHERE unmet) / nullif(count(*), 0), 1) FROM ev
                   WHERE type IN ('search', 'chat') AND date_trunc('week', ts) = w.week) AS sin_resultado_pct,
                  (SELECT round(100.0 * count(*) FILTER (WHERE NOT EXISTS (
                              SELECT 1 FROM app_orders o WHERE o.cart_id = c.cart_id AND o.source = %(source)s))
                          / nullif(count(*), 0), 1)
                   FROM (SELECT DISTINCT cart_id FROM ev WHERE type = 'cart_add' AND date_trunc('week', ts) = w.week) c)
                      AS abandono_carrito_pct
           FROM weeks w ORDER BY w.week""",
        {"source": source},
    )


def opportunities(conn: Connection, source: str = "synthetic", weeks: int = 4) -> list[dict]:
    """Demanda no satisfecha por concepto (o consulta) y vertical, con tendencia y acción sugerida."""
    _check(source)
    return _rows(
        conn,
        f"""WITH unmet AS (
                SELECT e.user_id, e.vertical, e.concept_id, lower(e.query) AS query, e.ts
                FROM app_events e
                WHERE e.source = %(source)s AND e.unmet AND e.type IN ('search', 'chat')
            ),
            agg AS (
                SELECT vertical, concept_id, CASE WHEN concept_id IS NULL THEN query END AS query,
                       count(*) AS busquedas, count(DISTINCT user_id) AS usuarios,
                       count(*) FILTER (WHERE ts > {_AS_OF} - make_interval(weeks => %(weeks)s)) AS recientes,
                       count(*) FILTER (WHERE ts <= {_AS_OF} - make_interval(weeks => %(weeks)s)
                                          AND ts > {_AS_OF} - make_interval(weeks => 2 * %(weeks)s)) AS anteriores
                FROM unmet GROUP BY 1, 2, 3
            )
            SELECT a.vertical, a.concept_id, coalesce(c.emoji || ' ' || c.name, a.query) AS que,
                   a.busquedas, a.usuarios, a.recientes, a.anteriores,
                   CASE WHEN a.anteriores = 0 THEN NULL
                        ELSE round(100.0 * (a.recientes - a.anteriores) / a.anteriores, 0) END AS crecimiento_pct,
                   (SELECT string_agg(ca.vertical, ', ' ORDER BY ca.items DESC) FROM v_concept_assortment ca
                    WHERE ca.concept_id = a.concept_id AND ca.vertical <> a.vertical AND ca.items >= 3)
                       AS existe_en,
                   CASE WHEN a.concept_id IS NULL THEN 'Revisar la consulta: sumar sinónimo o concepto nuevo'
                        WHEN EXISTS (SELECT 1 FROM v_concept_assortment ca WHERE ca.concept_id = a.concept_id
                                     AND ca.vertical <> a.vertical AND ca.items >= 3)
                             THEN 'Existe en otro vertical: que Bigotes lo ofrezca ahí'
                        ELSE 'Oportunidad: sumar comercios o categoría' END AS accion
            FROM agg a LEFT JOIN concepts c ON c.concept_id = a.concept_id
            WHERE a.usuarios >= %(min_users)s
              AND c.sensitive IS NOT TRUE  -- ninguna palanca usa conceptos sensibles (regla 6)
            ORDER BY a.usuarios DESC""",
        {"source": source, "weeks": weeks, "min_users": 5},
    )


def trends(conn: Connection, source: str = "synthetic", weeks: int = 4, limit: int = 12) -> list[dict]:
    """Conceptos que suben o bajan: interés (búsquedas, chat y carro) últimas N semanas vs las N anteriores."""
    _check(source)
    return _rows(
        conn,
        f"""WITH e AS (
                SELECT concept_id, ts FROM app_events
                WHERE source = %(source)s AND concept_id IS NOT NULL AND type IN ('search', 'chat', 'cart_add')
            ),
            agg AS (
                SELECT concept_id,
                       count(*) FILTER (WHERE ts > {_AS_OF} - make_interval(weeks => %(weeks)s)) AS recientes,
                       count(*) FILTER (WHERE ts <= {_AS_OF} - make_interval(weeks => %(weeks)s)
                                          AND ts > {_AS_OF} - make_interval(weeks => 2 * %(weeks)s)) AS anteriores
                FROM e GROUP BY 1
            )
            SELECT a.concept_id, c.emoji || ' ' || c.name AS concepto, a.recientes, a.anteriores,
                   round(100.0 * (a.recientes - a.anteriores) / nullif(a.anteriores, 0), 0) AS crecimiento_pct
            FROM agg a JOIN concepts c USING (concept_id)
            WHERE a.anteriores >= 20 AND NOT c.sensitive
            ORDER BY abs(a.recientes - a.anteriores)::float / a.anteriores DESC
            LIMIT %(limit)s""",
        {"source": source, "weeks": weeks, "limit": limit},
    )


def funnel(conn: Connection, source: str = "synthetic") -> list[dict]:
    """Por vertical: sesiones que buscan → agregan al carro → inician pago → piden."""
    _check(source)
    return _rows(
        conn,
        """WITH s AS (
               SELECT session_id, vertical,
                      bool_or(type IN ('search', 'chat', 'view_item')) AS busca,
                      bool_or(type = 'cart_add') AS carro,
                      bool_or(type = 'checkout_start') AS pago,
                      bool_or(type = 'order_placed') AS pedido
               FROM app_events WHERE source = %(source)s AND vertical IS NOT NULL GROUP BY 1, 2
           )
           SELECT vertical, count(*) FILTER (WHERE busca) AS buscan,
                  count(*) FILTER (WHERE busca AND carro) AS agregan,
                  count(*) FILTER (WHERE busca AND carro AND pago) AS pagan,
                  count(*) FILTER (WHERE busca AND carro AND pago AND pedido) AS piden
           FROM s GROUP BY 1 ORDER BY 2 DESC""",
        {"source": source},
    )


def cohorts(conn: Connection, source: str = "synthetic", max_weeks: int = 8) -> list[dict]:
    """Retención por cohorte semanal (semana del primer pedido): % que vuelve a pedir en la semana k."""
    _check(source)
    return _rows(
        conn,
        """WITH firsts AS (
               SELECT user_id, date_trunc('week', min(ts)) AS cohort FROM app_orders WHERE source = %(source)s
               GROUP BY 1
           ),
           activity AS (
               SELECT DISTINCT o.user_id, f.cohort,
                      -- en días enteros: el cambio de hora (semana de 6 días y 23 h) no corre las semanas
                      (date_trunc('week', o.ts)::date - f.cohort::date) / 7 AS k
               FROM app_orders o JOIN firsts f USING (user_id) WHERE o.source = %(source)s
           )
           SELECT cohort::date AS cohorte, k AS semana,
                  round(100.0 * count(*) / (SELECT count(*) FROM firsts f2 WHERE f2.cohort = activity.cohort), 1)
                      AS retencion_pct,
                  (SELECT count(*) FROM firsts f2 WHERE f2.cohort = activity.cohort) AS usuarios
           FROM activity WHERE k <= %(max_weeks)s
           GROUP BY cohort, k ORDER BY cohort, k""",
        {"source": source, "max_weeks": max_weeks},
    )


def rhythm_histogram(conn: Connection, source: str = "synthetic") -> list[dict]:
    """Distribución del ritmo de compra (mediana de días entre pedidos por usuario)."""
    _check(source)
    return _rows(
        conn,
        f"""WITH {_RHYTHM.strip()}
            SELECT bucket AS dias, count(*) AS usuarios FROM (
                SELECT CASE WHEN days < 3 THEN '0–3' WHEN days < 7 THEN '3–7' WHEN days < 14 THEN '7–14'
                            WHEN days < 30 THEN '14–30' ELSE '30+' END AS bucket,
                       CASE WHEN days < 3 THEN 1 WHEN days < 7 THEN 2 WHEN days < 14 THEN 3
                            WHEN days < 30 THEN 4 ELSE 5 END AS ord
                FROM rhythm) b
            GROUP BY bucket, ord ORDER BY ord""",
        {"source": source},
    )


def at_risk(conn: Connection, source: str = "synthetic", limit: int = 50) -> list[dict]:
    """Usuarios en riesgo o perdidos (id seudónimo) con su concepto top NO sensible y la acción sugerida."""
    _check(source)
    return _rows(
        conn,
        f"""WITH {_RHYTHM.strip()},
            top_concept AS (
                SELECT DISTINCT ON (o.user_id) o.user_id, l.concept_id, count(*) AS n
                FROM app_order_lines l JOIN app_orders o USING (order_id)
                JOIN concepts c ON c.concept_id = l.concept_id
                WHERE o.source = %(source)s AND NOT c.sensitive
                GROUP BY o.user_id, l.concept_id
                ORDER BY o.user_id, n DESC
            )
            SELECT 'u-' || left(md5(r.user_id), 8) AS usuario, u.segment AS persona, r.status AS estado,
                   round(r.rhythm::numeric, 1) AS ritmo_dias, round(r.since::numeric, 0) AS dias_sin_pedir,
                   c.emoji || ' ' || c.name AS concepto_top, u.consent_notifications AS consiente_avisos,
                   CASE WHEN NOT u.consent_notifications THEN 'Sin consentimiento: solo en la app (Bigotes)'
                        WHEN r.status = 'perdido' THEN 'Reactivar con novedad de su concepto top'
                        ELSE 'Recordatorio en su ritmo con su concepto top + complemento' END AS accion
            FROM risk r
            JOIN app_users u USING (user_id)
            LEFT JOIN (SELECT user_id, concept_id FROM top_concept) t USING (user_id)
            LEFT JOIN concepts c ON c.concept_id = t.concept_id
            WHERE r.status IN ('en_riesgo', 'perdido')
            ORDER BY r.status DESC, r.since DESC
            LIMIT %(limit)s""",
        {"source": source, "limit": limit},
    )


def suggestions(conn: Connection, source: str = "synthetic") -> list[dict]:
    """Rendimiento de las sugerencias cruzadas de Bigotes por concepto sugerido."""
    _check(source)
    return _rows(
        conn,
        """WITH s AS (
               SELECT concept_id, vertical,
                      count(*) FILTER (WHERE type = 'suggestion_shown') AS mostradas,
                      count(*) FILTER (WHERE type = 'suggestion_accepted') AS aceptadas,
                      count(*) FILTER (WHERE type = 'suggestion_dismissed') AS ignoradas
               FROM app_events WHERE source = %(source)s AND type LIKE 'suggestion_%%' GROUP BY 1, 2
           ),
           converted AS (
               SELECT l.concept_id, o.vertical, count(*) AS convertidas
               FROM app_order_lines l JOIN app_orders o USING (order_id)
               WHERE o.source = %(source)s AND l.from_suggestion GROUP BY 1, 2
           )
           SELECT c.emoji || ' ' || c.name AS concepto, s.vertical, s.mostradas, s.aceptadas, s.ignoradas,
                  coalesce(cv.convertidas, 0) AS convertidas,
                  round(100.0 * s.aceptadas / nullif(s.mostradas, 0), 1) AS aceptacion_pct
           FROM s JOIN concepts c USING (concept_id)
           LEFT JOIN converted cv ON cv.concept_id = s.concept_id AND cv.vertical = s.vertical
           WHERE s.mostradas >= 10
           ORDER BY s.mostradas DESC""",
        {"source": source},
    )


def multi_vertical_retention(conn: Connection, source: str = "synthetic") -> list[dict]:
    """Retención (pedido entre días 61 y 120) de multi-vertical vs un vertical, a igual número de pedidos.

    Estratificar por pedidos evita la confusión obvia (quien pide más cae más en 2 verticales y retiene más).
    Solo usuarios cuyo primer pedido fue hace ≥ 120 días.
    """
    _check(source)
    return _rows(
        conn,
        f"""WITH firsts AS (
                SELECT user_id, min(ts) AS first_ts FROM app_orders WHERE source = %(source)s GROUP BY 1
            ),
            eligible AS (SELECT * FROM firsts WHERE first_ts <= {_AS_OF} - interval '{RETENTION_TO} days'),
            early AS (
                SELECT e.user_id, count(*) AS pedidos, count(DISTINCT o.vertical) AS verticales
                FROM eligible e JOIN app_orders o ON o.user_id = e.user_id AND o.source = %(source)s
                WHERE o.ts < e.first_ts + interval '{MULTI_VERTICAL_DAYS} days'
                GROUP BY e.user_id
            ),
            retained AS (
                SELECT e.user_id, EXISTS (
                    SELECT 1 FROM app_orders o WHERE o.user_id = e.user_id AND o.source = %(source)s
                      AND o.ts >= e.first_ts + interval '{RETENTION_FROM} days'
                      AND o.ts < e.first_ts + interval '{RETENTION_TO} days') AS kept
                FROM eligible e
            )
            SELECT CASE WHEN pedidos <= 2 THEN '1–2 pedidos' WHEN pedidos <= 5 THEN '3–5 pedidos'
                        ELSE '6+ pedidos' END AS estrato,
                   CASE WHEN verticales >= 2 THEN 'multi-vertical' ELSE 'un vertical' END AS grupo,
                   count(*) AS usuarios, round(100.0 * avg(kept::int), 1) AS retencion_pct
            FROM early JOIN retained USING (user_id)
            GROUP BY 1, 2 HAVING count(*) >= %(min_users)s ORDER BY 1, 2""",
        {"source": source, "min_users": MIN_GROUP_USERS},
    )


def affinity(conn: Connection, source: str = "synthetic", limit: int = 25) -> list[dict]:
    """Afinidad dirigida A → B: P(B | A) entre usuarios que compran A (lift como filtro), sin sensibles.

    No cuenta las líneas que vinieron de una sugerencia de Bigotes (evita que el sistema se retroalimente).
    """
    _check(source)
    return _rows(
        conn,
        _AFFINITY_SQL + " ORDER BY confianza DESC LIMIT %(limit)s",
        {"source": source, "limit": limit, "min_support": MIN_SUPPORT},
    )


_AFFINITY_SQL = """
WITH bought AS (
    SELECT DISTINCT o.user_id, l.concept_id
    FROM app_order_lines l JOIN app_orders o USING (order_id) JOIN concepts c ON c.concept_id = l.concept_id
    WHERE o.source = %(source)s AND NOT l.from_suggestion AND NOT c.sensitive
),
users AS (SELECT count(DISTINCT user_id)::float AS n FROM bought),
per_concept AS (SELECT concept_id, count(*) AS n FROM bought GROUP BY 1),
pairs AS (
    SELECT a.concept_id AS a, b.concept_id AS b, count(*) AS both_n
    FROM bought a JOIN bought b ON a.user_id = b.user_id AND a.concept_id <> b.concept_id
    GROUP BY 1, 2
)
SELECT p.a AS desde, p.b AS hacia,
       ca.emoji || ' ' || ca.name AS desde_nombre, cb.emoji || ' ' || cb.name AS hacia_nombre,
       p.both_n AS usuarios, round((p.both_n::float / pa.n)::numeric, 3) AS confianza,
       round((p.both_n::float / pa.n / (pb.n / users.n))::numeric, 2) AS lift
FROM pairs p
JOIN per_concept pa ON pa.concept_id = p.a
JOIN per_concept pb ON pb.concept_id = p.b
JOIN concepts ca ON ca.concept_id = p.a
JOIN concepts cb ON cb.concept_id = p.b
CROSS JOIN users
WHERE p.both_n >= %(min_support)s AND p.both_n::float / pa.n / (pb.n / users.n) > 1
"""


def learn_edges(conn: Connection, source: str = "synthetic") -> int:
    """Guarda aristas aprendidas (method 'coocurrencia', data_source = source). El agente ignora las 'synthetic'."""
    _check(source)
    conn.execute("DELETE FROM concept_edges WHERE method = 'coocurrencia' AND data_source = %s", (source,))
    rows = _rows(conn, _AFFINITY_SQL, {"source": source, "min_support": MIN_SUPPORT})
    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO concept_edges (from_concept, to_concept, method, weight, support, data_source)
               VALUES (%s, %s, 'coocurrencia', %s, %s, %s)""",
            [(r["desde"], r["hacia"], min(1.0, r["confianza"]), r["usuarios"], source) for r in rows],
        )
    conn.commit()
    return len(rows)


def catalog_health(conn: Connection) -> dict:
    """Muestra pública REAL del catálogo: cobertura, calidad y precios (no depende de datos simulados)."""
    coverage = _rows(
        conn,
        """SELECT sv.vertical, count(DISTINCT a.store_id) AS tiendas,
                  sum(a.product_count_declared) AS declarados,
                  (SELECT count(DISTINCT sp.master_product_id) FROM store_products sp
                   JOIN v_store_verticals v ON v.store_id = sp.store_id WHERE v.vertical = sv.vertical) AS obtenidos
           FROM aisles a JOIN store_verticals sv USING (store_id)
           WHERE a.parent_aisle_id IS NULL
           GROUP BY 1 ORDER BY 3 DESC NULLS LAST""",
        {},
    )
    quality = _rows(
        conn,
        """SELECT iv.vertical, count(DISTINCT ci.master_product_id) AS productos,
                  round(100.0 * count(DISTINCT ci.master_product_id) FILTER (
                      WHERE ci.image_url IS NULL OR ci.image_url ILIKE '%%NO-IMAGE%%')
                      / nullif(count(DISTINCT ci.master_product_id), 0), 1) AS sin_imagen_pct,
                  round(100.0 * count(DISTINCT ci.master_product_id) FILTER (WHERE ci.category_id IS NULL)
                      / nullif(count(DISTINCT ci.master_product_id), 0), 1) AS sin_categoria_pct,
                  round(100.0 * count(DISTINCT ci.master_product_id) FILTER (WHERE ic.entity_id IS NULL)
                      / nullif(count(DISTINCT ci.master_product_id), 0), 1) AS sin_concepto_pct
           FROM v_item_verticals iv
           JOIN catalog_items ci USING (master_product_id)
           LEFT JOIN item_concepts ic ON ic.entity_type = 'catalog_item' AND ic.entity_id = ci.master_product_id::text
           GROUP BY 1 ORDER BY 2 DESC""",
        {},
    )
    cross = _rows(
        conn,
        "SELECT n_verticales, count(*) AS productos FROM v_cross_vertical_items_real GROUP BY 1 ORDER BY 1",
        {},
    )
    return {"cobertura": coverage, "calidad": quality, "cruzados_reales": cross}


def assortment_vs_demand(conn: Connection, source: str = "synthetic", limit: int = 20) -> list[dict]:
    """Surtido real por concepto frente a la demanda (simulada): dónde hay más interés que oferta."""
    _check(source)
    return _rows(
        conn,
        """WITH demand AS (
               SELECT concept_id, vertical, count(DISTINCT user_id) AS usuarios FROM app_events
               WHERE source = %(source)s AND concept_id IS NOT NULL AND type IN ('search', 'chat') GROUP BY 1, 2
           )
           SELECT c.emoji || ' ' || c.name AS concepto, d.vertical, d.usuarios AS usuarios_que_buscan,
                  coalesce(a.items, 0) AS items_en_catalogo,
                  round(d.usuarios::numeric / greatest(coalesce(a.items, 0), 1), 2) AS usuarios_por_item
           FROM demand d JOIN concepts c USING (concept_id)
           LEFT JOIN v_concept_assortment a ON a.concept_id = d.concept_id AND a.vertical = d.vertical
           WHERE NOT c.sensitive
           ORDER BY usuarios_por_item DESC LIMIT %(limit)s""",
        {"source": source, "limit": limit},
    )
