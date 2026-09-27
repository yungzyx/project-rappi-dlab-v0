"""Embeddings de texto de `search_documents`: caché por contenido, copia a cada partición e índices HNSW.

Es incremental y se puede cortar: solo embebe textos (content_hash) que aún no tienen vector para el modelo,
y guarda por lotes.
"""

import hashlib
import logging
import time

from psycopg import Connection
from rappi_scraper.storage.search import SEARCH_DOCUMENTS_LOCK, VERTICALS

from .base import TextEmbedder, to_pgvector
from .images import ScrapeRunning, scrape_running

log = logging.getLogger(__name__)

BATCH_SIZE = 256


def pending_texts(conn: Connection, model: str, limit: int | None = None) -> list[tuple[str, str]]:
    """(content_hash, content) sin vector en el caché para este modelo."""
    return conn.execute(
        """SELECT DISTINCT ON (d.content_hash) d.content_hash, d.content
           FROM search_documents d
           WHERE NOT EXISTS (SELECT 1 FROM text_embeddings e
                             WHERE e.content_hash = d.content_hash AND e.embedding_model = %s)
           ORDER BY d.content_hash
           LIMIT %s""",
        (model, limit),
    ).fetchall()


def embed_pending(conn: Connection, embedder: TextEmbedder, limit: int | None = None) -> int:
    pending = pending_texts(conn, embedder.model_name, limit)
    log.info("%d textos por embeber con %s", len(pending), embedder.model_name)
    started = time.monotonic()
    for start in range(0, len(pending), BATCH_SIZE):
        batch = pending[start : start + BATCH_SIZE]
        vectors = embedder.embed_documents([content for _, content in batch])
        with (
            conn.cursor() as cur,
            cur.copy("COPY text_embeddings (content_hash, embedding_model, embedding) FROM STDIN") as copy,
        ):
            for (content_hash, _), vector in zip(batch, vectors, strict=True):
                copy.write_row((content_hash, embedder.model_name, to_pgvector(vector)))
        conn.commit()
        done = start + len(batch)
        if done % (BATCH_SIZE * 10) == 0 or done == len(pending):
            rate = done / max(time.monotonic() - started, 1e-6)
            log.info("  %d/%d textos (%.0f/s)", done, len(pending), rate)
    return len(pending)


def sync_document_embeddings(conn: Connection, model: str) -> int:
    """Copia los vectores del caché a `search_documents` (donde los usa el índice HNSW de cada partición).

    Toma el mismo candado que `build_search_documents` del scraper: si la reescritura está en curso, no espera ni
    compite por las filas (deadlock); avisa que hay que correrlo después."""
    if not conn.execute("SELECT pg_try_advisory_xact_lock(%s)", (SEARCH_DOCUMENTS_LOCK,)).fetchone()[0]:
        conn.rollback()
        raise ScrapeRunning("El scraper está reescribiendo los documentos de búsqueda: embed-text corre después")
    updated = conn.execute(
        """UPDATE search_documents d
           SET embedding = e.embedding, embedding_model = e.embedding_model
           FROM text_embeddings e
           WHERE e.content_hash = d.content_hash AND e.embedding_model = %s
             AND (d.embedding IS NULL OR d.embedding_model IS DISTINCT FROM %s)""",
        (model, model),
    ).rowcount
    conn.commit()
    return updated


def hnsw_index_name(vertical: str, model: str) -> str:
    return f"search_documents_{vertical}_hnsw_{hashlib.md5(model.encode()).hexdigest()[:8]}"


def ensure_hnsw_indexes(conn: Connection, model: str, dim: int) -> list[str]:
    """Un índice HNSW por partición (vertical), parcial por modelo: las búsquedas nunca cruzan verticales."""
    created = []
    for vertical in VERTICALS:
        name = hnsw_index_name(vertical, model)
        exists = conn.execute("SELECT 1 FROM pg_indexes WHERE indexname = %s", (name,)).fetchone()
        if exists:
            continue
        conn.execute(
            f"""CREATE INDEX {name} ON search_documents_{vertical}
                USING hnsw ((embedding::vector({int(dim)})) vector_cosine_ops)
                WHERE embedding_model = '{model.replace("'", "''")}'"""
        )
        created.append(name)
    conn.commit()
    return created


def embed_search_documents(conn: Connection, embedder: TextEmbedder, limit: int | None = None) -> dict:
    # La copia a search_documents bloquea filas que el scraper reescribe al final de su corrida (deadlock).
    if scrape_running(conn):
        raise ScrapeRunning("Hay una corrida del scraper en curso: embed-text corre después (make post-refresh)")
    embedded = embed_pending(conn, embedder, limit)
    synced = sync_document_embeddings(conn, embedder.model_name)
    indexes = ensure_hnsw_indexes(conn, embedder.model_name, embedder.dim)
    coverage = conn.execute(
        """SELECT count(*) FILTER (WHERE embedding_model = %s), count(*) FROM search_documents""",
        (embedder.model_name,),
    ).fetchone()
    return {
        "textos_nuevos": embedded,
        "documentos_actualizados": synced,
        "indices_creados": len(indexes),
        "documentos_con_vector": coverage[0],
        "documentos_total": coverage[1],
    }
