"""Caché de embeddings de texto (`text_embeddings`) contra `rappi_ia_test`, con un embedder espía."""

import numpy as np
from rappi_scraper.storage.search import VERTICALS, build_search_documents

from conftest import add_product, add_store
from rappi_ia import config
from rappi_ia.concepts.knn import ItemText, embed_texts
from rappi_ia.embeddings import text_store
from rappi_ia.embeddings.base import HashEmbedder
from rappi_ia.embeddings.images import ensure_image_index

NAMES = [
    "Sal",
    "Pañales Babysec Premium Talla G paquete ahorro de 60 unidades",
    "Té verde",
    "Cerveza Kunstmann Torobayo 330 cc",
    "Arroz",
    "Papas fritas Lays Clásicas 180 g",
    "Leche entera Colun caja 1 L pack de 12 unidades",
    "Pan",
]


class SpyEmbedder(HashEmbedder):
    """Anota los textos que recibe en cada llamada (en el orden en que llegan al modelo)."""

    def __init__(self):
        super().__init__()
        self.calls: list[list[str]] = []

    def embed_documents(self, texts: list[str]) -> np.ndarray:
        self.calls.append(list(texts))
        return super().embed_documents(texts)


def _parse(text: str) -> np.ndarray:
    return np.array([float(x) for x in text.strip("[]").split(",")], dtype=np.float32)


def test_pending_texts_reach_the_model_sorted_by_length(db, monkeypatch):
    """Cada lote se rellena hasta su texto más largo: ordenados por largo, los lotes salen parejos."""
    add_store(db, 1, "supermercado", "Súper")
    add_store(db, 2, "licores", "Botillería")
    for pid, name in enumerate(NAMES, start=100):
        add_product(db, pid, name, 1 + pid % 2)
    # La 101 también en el súper: mismo texto en dos verticales, un solo hash.
    db.execute("INSERT INTO store_products (store_id, sku, master_product_id) VALUES (1, 'sku-101-b', 101)")
    db.commit()
    build_search_documents(db)
    monkeypatch.setattr(text_store, "BATCH_SIZE", 3)
    spy = SpyEmbedder()

    embedded = text_store.embed_pending(db, spy)

    sent = [text for call in spy.calls for text in call]
    assert all(len(call) <= 3 for call in spy.calls)
    assert [len(t) for t in sent] == sorted(len(t) for t in sent)
    distinct = db.execute("SELECT count(DISTINCT content_hash) FROM search_documents").fetchone()[0]
    assert embedded == len(sent) == distinct
    # Mismo hash → el vector de SU texto (el orden por largo no cruza hashes con vectores).
    rows = db.execute(
        """SELECT DISTINCT d.content, e.embedding::text FROM search_documents d
           JOIN text_embeddings e ON e.content_hash = d.content_hash AND e.embedding_model = %s""",
        (spy.model_name,),
    ).fetchall()
    assert len({content for content, _ in rows}) == distinct
    for content, vector in rows:
        assert np.allclose(_parse(vector), HashEmbedder().embed_documents([content])[0], atol=1e-5)
    calls = len(spy.calls)
    assert text_store.embed_pending(db, spy) == 0 and len(spy.calls) == calls  # incremental


def test_new_item_names_reach_the_model_sorted_by_length(db):
    items = [ItemText("catalog_item", str(i), name) for i, name in enumerate(NAMES)]
    spy = SpyEmbedder()

    vectors = embed_texts(db, spy, items)

    sent = [text for call in spy.calls for text in call]
    assert sorted(sent) == sorted(NAMES)
    assert [len(t) for t in sent] == sorted(len(t) for t in sent)
    assert np.allclose(vectors, HashEmbedder().embed_documents(NAMES), atol=1e-5)


class SpyConnection:
    """Delega en la conexión real y anota el `maintenance_work_mem` vigente en cada CREATE INDEX."""

    def __init__(self, conn):
        self._conn = conn
        self.memory_at_create: list[str] = []

    def execute(self, query, params=None):
        text = query if isinstance(query, str) else query.as_string(self._conn)
        if "CREATE INDEX" in text:
            self.memory_at_create.append(self._conn.execute("SHOW maintenance_work_mem").fetchone()[0])
        return self._conn.execute(query, params)

    def __getattr__(self, name):
        return getattr(self._conn, name)


def test_hnsw_indexes_get_more_memory_only_inside_their_transaction(db, monkeypatch):
    """Con los 64 MB por defecto el grafo de una partición grande no cabe y pgvector lo construye lento."""
    monkeypatch.setattr(config, "HNSW_MAINTENANCE_WORK_MEM", "123MB")
    before = db.execute("SHOW maintenance_work_mem").fetchone()[0]
    db.commit()
    spy = SpyConnection(db)

    created = text_store.ensure_hnsw_indexes(spy, "modelo-test", 64)
    ensure_image_index(spy, "clip-test")

    assert len(created) == len(VERTICALS)
    assert spy.memory_at_create == ["123MB"] * (len(VERTICALS) + 1)
    assert db.execute("SHOW maintenance_work_mem").fetchone()[0] == before != "123MB"  # SET LOCAL: no queda fijado
