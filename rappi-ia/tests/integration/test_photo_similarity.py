"""Fotos parecidas (CLIP) contra `rappi_ia_test`, con vectores de juguete en vez del modelo."""

import numpy as np
from rappi_scraper.storage.search import build_search_documents

from conftest import add_product, add_store
from rappi_ia.agent.photo import similar_items
from rappi_ia.embeddings.base import to_pgvector

MODEL = "clip-test"


def _unit(i: int, noise: float = 0.0) -> np.ndarray:
    v = np.zeros(512, dtype=np.float32)
    v[i] = 1.0
    v[(i + 1) % 512] = noise
    return v / np.linalg.norm(v)


def _image(db, product_id: int, vector: np.ndarray) -> None:
    url = f"https://img.test/{product_id}.jpg"
    db.execute("UPDATE catalog_items SET image_url = %s WHERE master_product_id = %s", (url, product_id))
    db.execute(
        "INSERT INTO image_embeddings (image_url, embedding_model, embedding, status) VALUES (%s, %s, %s, 'ok')",
        (url, MODEL, to_pgvector(vector)),
    )


def test_vertical_scoped_search_is_not_starved_by_closer_images_elsewhere(db):
    add_store(db, 1, "mall", "Mall")
    add_store(db, 2, "farmacia", "Farmacia")
    for pid in range(100, 230):  # 130 fotos del mall más parecidas que la de farmacia
        add_product(db, pid, f"Crema mall {pid}", 1)
        _image(db, pid, _unit(0, noise=0.01))
    add_product(db, 900, "Crema hidratante farmacia", 2)
    _image(db, 900, _unit(0, noise=0.5))
    db.commit()
    build_search_documents(db)

    in_pharmacy = similar_items(db, _unit(0), MODEL, "farmacia")
    assert [(v, e) for v, _, e, _ in in_pharmacy] == [("farmacia", "900")]
    anywhere = similar_items(db, _unit(0), MODEL, k=12)
    assert len(anywhere) == 12 and {v for v, *_ in anywhere} == {"mall"}
