"""La búsqueda léxica con el df de cada palabra en la caché del catálogo (`retrieval/hybrid._lexical`): devuelve
exactamente lo mismo que el SQL anterior, que contaba el df de cada palabra en cada búsqueda y puntuaba con un JOIN más
GROUP BY (queda aquí como referencia), y una segunda búsqueda no vuelve a contar el df. Vence con la caché del
catálogo."""

import pytest
from rappi_scraper.storage.search import VERTICALS, build_search_documents

from conftest import add_price, add_product
from rappi_ia.catalog import cache
from rappi_ia.demo.seed import seed_demo
from rappi_ia.retrieval import hybrid
from rappi_ia.retrieval.hybrid import CANDIDATES, Filters, vertical_doc_count

# El `_lexical` de antes de la caché de df, tal cual.
OLD_SQL = """WITH lexemes AS (
                SELECT DISTINCT lexeme FROM unnest(to_tsvector('spanish', es_unaccent(%(query)s)))
            ),
            weights AS MATERIALIZED (
                SELECT l.lexeme, quote_literal(l.lexeme)::tsquery AS q,
                       ln(1 + %(n)s::float / (1 + (SELECT count(*) FROM search_documents d
                                                   WHERE d.vertical = %(vertical)s
                                                     AND d.tsv_unaccent @@ quote_literal(l.lexeme)::tsquery)))
                       AS idf
                FROM lexemes l
            ),
            any_q AS (SELECT string_agg(quote_literal(lexeme), ' | ')::tsquery AS q FROM lexemes)
            SELECT d.entity_type, d.entity_id,
                   sum(w.idf) + max(ts_rank_cd(d.tsv_unaccent, any_q.q)) AS score
            FROM search_documents d
            CROSS JOIN any_q
            JOIN weights w ON d.tsv_unaccent @@ w.q
            WHERE d.vertical = %(vertical)s AND d.entity_type = ANY(%(types)s) AND any_q.q IS NOT NULL
              AND d.tsv_unaccent @@ any_q.q
              AND (%(price_max)s::numeric IS NULL OR price_min <= %(price_max)s::numeric)
            GROUP BY d.entity_type, d.entity_id
            ORDER BY score DESC, d.entity_id
            LIMIT %(k)s"""

QUERIES = [
    "papas fritas",
    "cerveza",
    "pizza",
    "café molido",
    "chocolate amargo 70% cacao",
    "algo para el carrete",
    "coca-cola",
    "pañales talla g",
    "panales",
    "sushi acevichado",
    "té",
    "xyz",
    "leche descremada sin lactosa",
]
FILTERS = [Filters(), Filters(price_max=2500), Filters(entity_types=("catalog_item",))]


def old_lexical(conn, vertical: str, query: str, filters: Filters, n: int):
    rows = conn.execute(
        OLD_SQL,
        {
            "query": query,
            "vertical": vertical,
            "n": n,
            "types": list(filters.entity_types),
            "price_max": filters.price_max,
            "k": CANDIDATES,
        },
    ).fetchall()
    return [((t, i), r) for t, i, r in rows]


class CountingConnection:
    def __init__(self, conn):
        self._conn = conn
        self.statements: list[str] = []

    def execute(self, query, *args, **kwargs):
        self.statements.append(str(query))
        return self._conn.execute(query, *args, **kwargs)

    def __getattr__(self, name):
        return getattr(self._conn, name)


def _df_counts(statements: list[str]) -> list[str]:
    return [s for s in statements if "count(*)" in s and "tsv_unaccent" in s]


@pytest.fixture
def catalog(db):
    seed_demo(db)
    db.commit()
    return db


def test_lexical_returns_exactly_what_the_old_sql_returned(catalog):
    with_results = 0
    for query in QUERIES:
        for vertical in VERTICALS:
            n = vertical_doc_count(catalog, vertical)
            for filters in FILTERS:
                new = hybrid._lexical(catalog, vertical, query, filters, n)
                old = old_lexical(catalog, vertical, query, filters, n)
                assert new == old, (query, vertical, filters)  # mismo orden y mismo puntaje
                with_results += bool(new)
    assert with_results >= 20  # la comparación no es entre listas vacías


def test_a_second_search_does_not_count_the_df_again(catalog):
    counting = CountingConnection(catalog)
    n = vertical_doc_count(catalog, "supermercado")

    first = hybrid._lexical(counting, "supermercado", "papas fritas", Filters(), n)
    assert first and _df_counts(counting.statements)  # la primera cuenta el df de «papas» y «frit»

    counting.statements.clear()
    second = hybrid._lexical(counting, "supermercado", "papas fritas", Filters(price_max=2500), n)
    assert [s for s in counting.statements if "scrape_runs" not in s] == [counting.statements[-1]]  # solo puntúa

    counting.statements.clear()
    third = hybrid._lexical(counting, "supermercado", "papas", Filters(), n)  # otra consulta: sus lexemas, sin df
    assert _df_counts(counting.statements) == []
    assert len([s for s in counting.statements if "scrape_runs" not in s]) == 2

    assert second == old_lexical(catalog, "supermercado", "papas fritas", Filters(price_max=2500), n)
    assert third == old_lexical(catalog, "supermercado", "papas", Filters(), n)


def test_the_df_is_counted_again_when_the_catalog_cache_expires(catalog, monkeypatch):
    """El df vive en la caché del catálogo: como el conteo de documentos de la vertical, se vuelve a contar con una
    corrida nueva o al vencer su TTL (lo que cambia sin corrida, como un `make post-refresh`)."""
    now = [1000.0]
    monkeypatch.setattr(cache, "_now", lambda: now[0])
    before = hybrid._lexical(catalog, "supermercado", "papas", Filters(), vertical_doc_count(catalog, "supermercado"))

    store = catalog.execute(
        "SELECT store_id FROM store_verticals WHERE vertical = 'supermercado' ORDER BY store_id LIMIT 1"
    ).fetchone()[0]
    for pid in range(990_001, 990_004):
        add_product(catalog, pid, f"Papas nativas de prueba {pid}", store)
        add_price(catalog, store, pid, 1500)
    catalog.commit()
    build_search_documents(catalog)
    catalog.commit()

    counting = CountingConnection(catalog)
    stale_n = vertical_doc_count(counting, "supermercado")
    hybrid._lexical(counting, "supermercado", "papas", Filters(), stale_n)
    assert _df_counts(counting.statements) == []  # todavía en caché

    now[0] += cache.DEFAULT_TTL_S + 1
    n = vertical_doc_count(counting, "supermercado")
    after = hybrid._lexical(counting, "supermercado", "papas", Filters(), n)

    assert n > stale_n and _df_counts(counting.statements)  # contó de nuevo
    assert after != before
    assert after == old_lexical(catalog, "supermercado", "papas", Filters(), n)
