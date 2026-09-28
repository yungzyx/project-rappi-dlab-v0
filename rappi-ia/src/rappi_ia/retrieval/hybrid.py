"""Búsqueda híbrida dentro de UN vertical: léxico (tsvector sin tildes) + vectorial (e5) → RRF → refuerzo por concepto.

- Los filtros duros (precio máximo, tipo de entidad) van dentro de cada recuperador, antes de fusionar, para que un
  tope de precio no deje la lista vacía por haber filtrado después.
- "Sin resultado" (demanda no satisfecha) exige las tres condiciones de docs/diseno-ia.md §1: nada calza todas las
  palabras, el coseno máximo queda bajo τ del vertical y ningún ítem del vertical comparte concepto con la consulta.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path

from psycopg import Connection
from rappi_scraper.storage.search import VERTICALS

from ..concepts.assign import concept_matcher
from ..concepts.taxonomy import load_taxonomy
from ..embeddings.base import TextEmbedder, to_pgvector

RRF_K = 60  # constante estándar de Reciprocal Rank Fusion
CANDIDATES = 200  # tamaño del pool de cada recuperador
CONCEPT_BONUS = 0.5 / (RRF_K + 1)  # medio "primer lugar" extra si el ítem comparte concepto con la consulta
DEFAULT_TAU = 0.82  # coseno e5 mínimo para considerar que hay algo parecido; se calibra por vertical (eval)
MIN_CONCEPT_ITEMS = 3  # bajo esto (o bajo 0,05% del vertical) el concepto se considera ausente: surtido testimonial
MIN_CONCEPT_SHARE = 0.0005
THRESHOLDS_FILE = Path(__file__).resolve().parents[1] / "eval" / "thresholds.json"
MODES = ("lexico", "vector", "hibrido")


@dataclass(frozen=True)
class Filters:
    price_max: float | None = None
    entity_types: tuple[str, ...] = ("catalog_item", "menu_item")


@dataclass
class Hit:
    vertical: str
    entity_type: str
    entity_id: str
    content: str
    metadata: dict
    score: float
    concept_id: str | None = None
    cosine: float | None = None
    ranks: dict[str, int] = field(default_factory=dict)


@dataclass
class RetrievalResult:
    vertical: str
    query: str
    hits: list[Hit]
    query_concepts: list[str]
    strict_lexical_matches: int
    max_cosine: float | None
    concept_in_vertical: bool
    unmet: bool
    unmet_reason: str | None


def thresholds() -> dict[str, float]:
    try:
        return json.loads(THRESHOLDS_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def retrieve(
    conn: Connection,
    vertical: str,
    query: str,
    embedder: TextEmbedder | None = None,
    k: int = 10,
    filters: Filters | None = None,
    mode: str = "hibrido",
    concepts: list[str] | None = None,
) -> RetrievalResult:
    if vertical not in VERTICALS:
        raise ValueError(f"Vertical desconocido: {vertical}")
    if mode not in MODES:
        raise ValueError(f"Modo desconocido: {mode}")
    filters = filters or Filters()
    query_concepts = concepts if concepts is not None else _query_concepts(query)

    lexical = _lexical(conn, vertical, query, filters) if mode != "vector" else []
    vector: list[tuple[tuple[str, str], float]] = []
    if mode != "lexico" and embedder is not None:
        vector = _vector(conn, vertical, embedder.embed_queries([query])[0], embedder, filters)

    scores: dict[tuple[str, str], float] = {}
    ranks: dict[tuple[str, str], dict[str, int]] = {}
    for name, ranked in (("lexico", [key for key, _ in lexical]), ("vector", [key for key, _ in vector])):
        for position, key in enumerate(ranked, start=1):
            scores[key] = scores.get(key, 0.0) + 1.0 / (RRF_K + position)
            ranks.setdefault(key, {})[name] = position

    item_concepts = _concepts_of(conn, list(scores))
    if query_concepts and mode == "hibrido":
        for key in scores:
            if item_concepts.get(key) in query_concepts:
                scores[key] += CONCEPT_BONUS

    top = sorted(scores, key=scores.get, reverse=True)[:k]
    cosines = dict(vector)
    hits = _hydrate(conn, vertical, top, scores, item_concepts, cosines, ranks)

    strict = _strict_lexical_count(conn, vertical, query, filters)
    max_cosine = max(cosines.values()) if cosines else None
    concept_here = _concept_in_vertical(conn, vertical, query_concepts)
    unmet, reason = _unmet(
        vertical, strict, max_cosine, concept_here, bool(query_concepts), has_vectors=embedder is not None
    )
    return RetrievalResult(vertical, query, hits, query_concepts, strict, max_cosine, concept_here, unmet, reason)


def _query_concepts(query: str) -> list[str]:
    return [m.target for m in _matcher().matches(query)]


_MATCHER = None


def _matcher():
    global _MATCHER
    if _MATCHER is None:
        _MATCHER = concept_matcher(load_taxonomy())
    return _MATCHER


_PRICE = "price_min"  # columna generada desde metadata (migración 013), con índice (vertical, price_min)
# Con tope de precio, si califican hasta esta cantidad de documentos se revisan todos (búsqueda exacta): el HNSW
# filtrado corta en hnsw.max_scan_tuples y con un tope muy bajo en un vertical grande devolvería de menos.
EXACT_SEARCH_MAX = 5000


def _lexical(conn: Connection, vertical: str, query: str, filters: Filters) -> list[tuple[tuple[str, str], float]]:
    """Cualquier palabra de la consulta (OR), puntuada por IDF dentro del vertical: las palabras raras pesan más.

    Sin IDF, una unidad como "g" (presente en miles de productos) tapaba a "pañales" en "pañales talla g".
    ts_rank_cd solo desempata (palabras más juntas, más arriba).
    """
    rows = conn.execute(
        f"""WITH lexemes AS (
                SELECT DISTINCT lexeme FROM unnest(to_tsvector('spanish', es_unaccent(%(query)s)))
            ),
            docs AS MATERIALIZED (SELECT count(*)::float AS n FROM search_documents WHERE vertical = %(vertical)s),
            weights AS MATERIALIZED (
                SELECT l.lexeme, to_tsquery('simple', quote_literal(l.lexeme)) AS q,
                       ln(1 + docs.n / (1 + (SELECT count(*) FROM search_documents d
                                             WHERE d.vertical = %(vertical)s
                                               AND d.tsv_unaccent @@ to_tsquery('simple', quote_literal(l.lexeme)))))
                       AS idf
                FROM lexemes l, docs
            ),
            any_q AS (SELECT to_tsquery('simple', string_agg(quote_literal(lexeme), ' | ')) AS q FROM lexemes)
            SELECT d.entity_type, d.entity_id,
                   sum(w.idf) + max(ts_rank_cd(d.tsv_unaccent, any_q.q)) AS score
            FROM search_documents d
            CROSS JOIN any_q
            JOIN weights w ON d.tsv_unaccent @@ w.q
            WHERE d.vertical = %(vertical)s AND d.entity_type = ANY(%(types)s) AND any_q.q IS NOT NULL
              AND d.tsv_unaccent @@ any_q.q
              AND (%(price_max)s::numeric IS NULL OR {_PRICE} <= %(price_max)s::numeric)
            GROUP BY d.entity_type, d.entity_id
            ORDER BY score DESC, d.entity_id
            LIMIT %(k)s""",
        {
            "query": query,
            "vertical": vertical,
            "types": list(filters.entity_types),
            "price_max": filters.price_max,
            "k": CANDIDATES,
        },
    ).fetchall()
    return [((t, i), r) for t, i, r in rows]


def _strict_lexical_count(conn: Connection, vertical: str, query: str, filters: Filters) -> int:
    """Cuántos documentos calzan TODAS las palabras (sin filtro de precio: sirve para 'sin resultado')."""
    return conn.execute(
        """SELECT count(*) FROM (
               SELECT 1 FROM search_documents
               WHERE vertical = %s AND entity_type = ANY(%s)
                 AND tsv_unaccent @@ plainto_tsquery('spanish', es_unaccent(%s))
               LIMIT 50) s""",
        (vertical, list(filters.entity_types), query),
    ).fetchone()[0]


def _vector(
    conn: Connection, vertical: str, query_vector, embedder: TextEmbedder, filters: Filters
) -> list[tuple[tuple[str, str], float]]:
    dim = int(embedder.dim)
    model = embedder.model_name.replace("'", "''")  # literal: el índice parcial exige conocer el modelo al planificar
    params = {
        "v": to_pgvector(query_vector),
        "vertical": vertical,
        "types": list(filters.entity_types),
        "price_max": filters.price_max,
        "k": CANDIDATES,
        "cap": EXACT_SEARCH_MAX + 1,
    }
    where = f"""vertical = %(vertical)s AND embedding_model = '{model}' AND entity_type = ANY(%(types)s)
                AND (%(price_max)s::numeric IS NULL OR {_PRICE} <= %(price_max)s::numeric)"""
    distance = f"(embedding::vector({dim})) <=> %(v)s::vector({dim})"
    if filters.price_max is not None and _few_within_price(conn, where, params):
        rows = conn.execute(
            f"""WITH pool AS MATERIALIZED (SELECT entity_type, entity_id, embedding FROM search_documents WHERE {where})
                SELECT entity_type, entity_id, 1 - ({distance}) AS cosine FROM pool
                ORDER BY {distance}
                LIMIT %(k)s""",
            params,
        ).fetchall()
        return [((t, i), float(c)) for t, i, c in rows]
    conn.execute(f"SET hnsw.ef_search = {CANDIDATES}")
    conn.execute("SET hnsw.iterative_scan = relaxed_order")
    rows = conn.execute(
        f"""SELECT entity_type, entity_id, 1 - ({distance}) AS cosine
            FROM search_documents
            WHERE {where}
            ORDER BY {distance}
            LIMIT %(k)s""",
        params,
    ).fetchall()
    return [((t, i), float(c)) for t, i, c in rows]


def _few_within_price(conn: Connection, where: str, params: dict) -> bool:
    """¿Califican a lo más EXACT_SEARCH_MAX documentos? Usa el índice (vertical, price_min) y corta al pasarse."""
    return (
        conn.execute(
            f"SELECT count(*) FROM (SELECT 1 FROM search_documents WHERE {where} LIMIT %(cap)s) s", params
        ).fetchone()[0]
        <= EXACT_SEARCH_MAX
    )


def _concepts_of(conn: Connection, keys: list[tuple[str, str]]) -> dict[tuple[str, str], str]:
    if not keys:
        return {}
    rows = conn.execute(
        """SELECT ic.entity_type, ic.entity_id, ic.concept_id
           FROM item_concepts ic
           JOIN unnest(%s::text[], %s::text[]) AS k(entity_type, entity_id) USING (entity_type, entity_id)""",
        ([t for t, _ in keys], [i for _, i in keys]),
    ).fetchall()
    return {(t, i): c for t, i, c in rows}


def _concept_in_vertical(conn: Connection, vertical: str, concepts: list[str]) -> bool:
    if not concepts:
        return False
    return bool(
        conn.execute(
            """SELECT 1 FROM concept_assortment a
               WHERE a.vertical = %(v)s AND a.concept_id = ANY(%(c)s)
                 AND a.items >= greatest(%(min)s, round(%(share)s * (SELECT count(*) FROM search_documents
                                                                      WHERE vertical = %(v)s)))
               LIMIT 1""",
            {"v": vertical, "c": concepts, "min": MIN_CONCEPT_ITEMS, "share": MIN_CONCEPT_SHARE},
        ).fetchone()
    )


def _hydrate(conn, vertical, keys, scores, item_concepts, cosines, ranks) -> list[Hit]:
    if not keys:
        return []
    rows = conn.execute(
        """SELECT d.entity_type, d.entity_id, d.content, d.metadata
           FROM search_documents d
           JOIN unnest(%s::text[], %s::text[]) AS k(entity_type, entity_id) USING (entity_type, entity_id)
           WHERE d.vertical = %s""",
        ([t for t, _ in keys], [i for _, i in keys], vertical),
    ).fetchall()
    by_key = {(t, i): (content, metadata) for t, i, content, metadata in rows}
    return [
        Hit(
            vertical,
            key[0],
            key[1],
            by_key[key][0],
            by_key[key][1],
            round(scores[key], 6),
            item_concepts.get(key),
            cosines.get(key),
            ranks.get(key, {}),
        )
        for key in keys
        if key in by_key
    ]


def _unmet(
    vertical: str,
    strict: int,
    max_cosine: float | None,
    concept_here: bool,
    names_concept: bool,
    has_vectors: bool,
) -> tuple[bool, str | None]:
    """Sin resultado = nada calza todas las palabras Y (el concepto nombrado no está en el vertical, o bien,
    si la consulta no nombra un concepto, el coseno máximo queda bajo τ).

    Con e5 los cosenos se concentran (0,78–0,90), así que cuando la consulta nombra un concepto, su presencia
    en el vertical es mejor señal que el coseno ("pizza" en Rappi Mall: no hay; aunque el coseno sea 0,82).
    """
    if strict > 0:
        return False, None
    if names_concept:
        if concept_here:
            return False, None
        return (
            True,
            f"sin coincidencia léxica; el concepto pedido no está en {vertical} (o es testimonial)",
        )
    tau = thresholds().get(vertical, DEFAULT_TAU)
    if not has_vectors or max_cosine is None or max_cosine < tau:
        cosine = f"{max_cosine:.3f}" if max_cosine is not None else "sin vectores"
        return True, f"sin coincidencia léxica ni concepto; coseno máx {cosine} < τ {tau}"
    return False, None
