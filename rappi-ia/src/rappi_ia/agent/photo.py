"""Foto del usuario → conceptos (CLIP zero-shot) y productos visualmente parecidos (image_embeddings).

La foto no se guarda. Un concepto solo cuenta si su probabilidad es ≥ 0,5 y le saca ≥ 0,2 al segundo, y
nunca se registra un concepto sensible detectado en una foto.
"""

from dataclasses import dataclass

import numpy as np
from psycopg import Connection

from ..concepts.taxonomy import load_taxonomy
from ..embeddings.base import to_pgvector

MIN_PROBABILITY = 0.5
MIN_MARGIN = 0.2
LOGIT_SCALE = 100.0  # escala de CLIP para pasar de coseno a probabilidades
NEAR_POOL = 100  # fotos candidatas del HNSW global (sin vertical)
OTHER_PROMPTS = [
    "una foto de una persona",
    "una foto de un paisaje",
    "una captura de pantalla",
    "una foto de un objeto cualquiera",
    "una foto borrosa",
]


@dataclass
class PhotoReading:
    concept: str | None
    probability: float
    runner_up: str | None
    vector: np.ndarray


class PhotoReader:
    def __init__(self, clip):
        self.clip = clip
        taxonomy = load_taxonomy()
        self.labels = [c.id for c in taxonomy.concepts.values()] + ["otro"] * len(OTHER_PROMPTS)
        prompts = [f"una foto de {c.name.lower()}" for c in taxonomy.concepts.values()] + OTHER_PROMPTS
        self.prompt_vectors = clip.embed_texts(prompts)
        self.sensitive = {c.id for c in taxonomy.concepts.values() if c.sensitive}

    def read(self, image) -> PhotoReading:
        vector = self.clip.embed_images([image])[0]
        return classify(vector, self.prompt_vectors, self.labels, self.sensitive)


def classify(vector: np.ndarray, prompt_vectors: np.ndarray, labels: list[str], sensitive: set[str]) -> PhotoReading:
    logits = LOGIT_SCALE * (prompt_vectors @ vector)
    probs = np.exp(logits - logits.max())
    probs /= probs.sum()
    by_label: dict[str, float] = {}
    for label, p in zip(labels, probs.tolist(), strict=True):
        by_label[label] = by_label.get(label, 0.0) + p  # las clases "otro" suman
    ranked = sorted(by_label.items(), key=lambda kv: kv[1], reverse=True)
    (best, p1), (second, p2) = ranked[0], ranked[1]
    confident = best != "otro" and p1 >= MIN_PROBABILITY and p1 - p2 >= MIN_MARGIN and best not in sensitive
    return PhotoReading(best if confident else None, round(p1, 3), second, vector)


def similar_items(
    conn: Connection, vector: np.ndarray, model: str, vertical: str | None = None, k: int = 12
) -> list[tuple[str, str, str, float]]:
    """(vertical, entity_type, entity_id, coseno) de ítems con foto parecida, dentro del vertical si se indica.

    Con vertical, la búsqueda es exacta sobre las fotos de ese vertical (filtrar después de un top global podía
    dejarlo vacío). Sin vertical, HNSW global con un pool mayor que el LIMIT (el ef_search por omisión es 40).
    """
    params = {"v": to_pgvector(vector), "model": model, "vertical": vertical, "k": k}
    if vertical is not None:
        return conn.execute(
            """SELECT d.vertical, d.entity_type, d.entity_id,
                      max(1 - ((e.embedding::vector(512)) <=> %(v)s::vector(512))) AS cosine
               FROM search_documents d
               JOIN image_embeddings e ON e.image_url = d.metadata ->> 'imagen'
                                      AND e.embedding_model = %(model)s AND e.status = 'ok'
               WHERE d.vertical = %(vertical)s AND d.entity_type <> 'store'
               GROUP BY 1, 2, 3
               ORDER BY cosine DESC
               LIMIT %(k)s""",
            params,
        ).fetchall()
    conn.execute(f"SET hnsw.ef_search = {NEAR_POOL}")
    conn.execute("SET hnsw.iterative_scan = relaxed_order")
    return conn.execute(
        f"""WITH near AS (
                SELECT image_url, 1 - ((embedding::vector(512)) <=> %(v)s::vector(512)) AS cosine
                FROM image_embeddings
                WHERE embedding_model = '{model.replace("'", "''")}' AND status = 'ok'
                ORDER BY (embedding::vector(512)) <=> %(v)s::vector(512)
                LIMIT {NEAR_POOL}
            )
            SELECT d.vertical, d.entity_type, d.entity_id, max(near.cosine) AS cosine
            FROM near
            JOIN search_documents d ON d.metadata ->> 'imagen' = near.image_url
            WHERE d.entity_type <> 'store'
            GROUP BY 1, 2, 3
            ORDER BY cosine DESC
            LIMIT %(k)s""",
        params,
    ).fetchall()
