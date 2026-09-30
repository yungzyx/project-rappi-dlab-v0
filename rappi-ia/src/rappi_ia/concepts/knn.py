"""Refina los conceptos con vecinos cercanos (kNN) sobre embeddings del NOMBRE del ítem.

Por qué: las reglas por palabra clave fallan con nombres ambiguos ("Wok" es sartén, "mango" es un mango de
correa) y algunas tiendas llenan categorías con productos que no corresponden. Los vecinos votan con los
ítems ya etiquetados por su categoría con alta confianza.

Se embebe solo el nombre (+ marca o descripción corta), sin la categoría, para que un producto mal
categorizado no se parezca a su categoría por el texto "Categoría: …".
"""

import hashlib
import logging
from collections import defaultdict
from dataclasses import dataclass, replace

import numpy as np
from psycopg import Connection

from ..embeddings.base import TextEmbedder, to_pgvector
from .assign import Assignment
from .taxonomy import keeps_sensitive

log = logging.getLogger(__name__)

NEIGHBORS = 15
LABEL_MIN_CONFIDENCE = 0.8  # vecinos que votan: mapeo por categoría confiable
MAX_LABELS_PER_CONCEPT = 400  # acota el costo (y evita que los conceptos enormes dominen la votación)
OVERRIDE_SHARE = 0.75  # para contradecir a la categoría, los vecinos deben estar muy de acuerdo
FALLBACK_SHARE = 0.5  # para reemplazar una regla o llenar un vacío basta mayoría
CHUNK = 1024
FETCH_ROWS = 1000  # vectores del caché por viaje del cursor de servidor (~3 MB con 768 dimensiones)
EMBED_BATCH = 512  # nombres nuevos por llamada al modelo (y por commit al caché)


@dataclass(frozen=True)
class ItemText:
    entity_type: str
    entity_id: str
    text: str

    @property
    def content_hash(self) -> str:
        return hashlib.md5(f"nombre|{self.text}".encode()).hexdigest()


def item_texts(conn: Connection) -> list[ItemText]:
    catalog = conn.execute(
        """SELECT master_product_id::text, name || coalesce(' · ' || NULLIF(trademark, ''), '') FROM catalog_items"""
    ).fetchall()
    menu = conn.execute(
        """SELECT item_id::text, name || coalesce('. ' || left(NULLIF(description, ''), 100), '') FROM menu_items"""
    ).fetchall()
    return [ItemText("catalog_item", i, t) for i, t in catalog] + [ItemText("menu_item", i, t) for i, t in menu]


def embed_texts(conn: Connection, embedder: TextEmbedder, items: list[ItemText]) -> np.ndarray:
    """Vectores de los ítems, usando el caché `text_embeddings` (clave: hash del texto del nombre).

    Los del caché llegan en binario por bloques (cursor de servidor) y van directo a la matriz: pedidos como texto,
    los strings de ~220k nombres ocupaban ~1,6 GB antes de convertirlos."""
    rows_by_hash: dict[str, list[int]] = defaultdict(list)  # un mismo nombre puede estar en varios ítems
    for row, item in enumerate(items):
        rows_by_hash[item.content_hash].append(row)
    out = np.empty((len(items), embedder.dim), dtype=np.float32)
    missing = {h: items[rows[0]].text for h, rows in rows_by_hash.items()}
    with conn.cursor(name="knn_text_embeddings", binary=True) as cur:
        cur.itersize = FETCH_ROWS
        cur.execute(
            """SELECT content_hash, embedding FROM text_embeddings
               WHERE embedding_model = %s AND content_hash = ANY(%s)""",
            (embedder.model_name, list(rows_by_hash)),
        )
        for content_hash, embedding in cur:
            out[rows_by_hash[content_hash]] = _from_pgvector_binary(embedding)
            del missing[content_hash]
    if missing:
        log.info("Embebiendo %d nombres nuevos", len(missing))
        keys = sorted(missing, key=lambda h: len(missing[h]))  # por largo: lotes parejos (menos relleno)
        for start in range(0, len(keys), EMBED_BATCH):
            batch = keys[start : start + EMBED_BATCH]
            vectors = embedder.embed_documents([missing[h] for h in batch])
            with (
                conn.cursor() as cur,
                cur.copy("COPY text_embeddings (content_hash, embedding_model, embedding) FROM STDIN") as copy,
            ):
                for h, v in zip(batch, vectors, strict=True):
                    copy.write_row((h, embedder.model_name, to_pgvector(v)))
                    out[rows_by_hash[h]] = v
            conn.commit()
    return out


def refine(conn: Connection, embedder: TextEmbedder, assignments: list[Assignment]) -> list[Assignment]:
    items = item_texts(conn)
    if not items:
        return assignments
    vectors = embed_texts(conn, embedder, items)
    current = {(a.entity_type, a.entity_id): a for a in assignments}

    label_idx, label_concepts = _labels(items, current)
    if not label_idx:
        return assignments
    labels = vectors[label_idx]
    label_concept_arr = np.array(label_concepts)

    refined: dict[tuple[str, str], Assignment] = dict(current)
    changes = defaultdict(int)
    kth = min(NEIGHBORS, labels.shape[0] - 1)
    model_version = f"knn/{embedder.model_name}"
    for start in range(0, len(items), CHUNK):
        sims = vectors[start : start + CHUNK] @ labels.T
        top = np.argpartition(-sims, kth, axis=1)[:, : kth + 1]
        for row, item in enumerate(items[start : start + CHUNK]):
            key = (item.entity_type, item.entity_id)
            neighbor_ids = [j for j in top[row] if label_idx[j] != start + row][:NEIGHBORS]
            decision = _decide(
                current.get(key), item, sims[row, neighbor_ids], label_concept_arr[neighbor_ids], model_version
            )
            if decision is not None and decision != current.get(key):
                refined[key] = decision
                changes[decision.method if key in current else "nuevo"] += 1
    log.info("kNN: %s", dict(changes))
    return list(refined.values())


def _labels(items: list[ItemText], current: dict) -> tuple[list[int], list[str]]:
    per_concept: dict[str, list[int]] = defaultdict(list)
    for idx, item in enumerate(items):
        a = current.get((item.entity_type, item.entity_id))
        if a and a.method in ("llm", "curado") and a.confidence >= LABEL_MIN_CONFIDENCE:
            per_concept[a.concept_id].append(idx)
    label_idx, label_concepts = [], []
    for concept_id, idxs in per_concept.items():
        # Muestra determinista (por id) para acotar conceptos muy grandes.
        chosen = sorted(idxs, key=lambda i: hashlib.md5(items[i].entity_id.encode()).hexdigest())
        chosen = chosen[:MAX_LABELS_PER_CONCEPT]
        label_idx += chosen
        label_concepts += [concept_id] * len(chosen)
    return label_idx, label_concepts


def _decide(
    current: Assignment | None, item: ItemText, sims: np.ndarray, concepts: np.ndarray, model_version: str
) -> Assignment | None:
    if len(sims) == 0:
        return current
    weights = np.clip(sims, 0, None) ** 4  # los más parecidos pesan mucho más
    totals: dict[str, float] = defaultdict(float)
    for concept_id, w in zip(concepts.tolist(), weights.tolist(), strict=True):
        totals[concept_id] += w
    best, best_weight = max(totals.items(), key=lambda kv: kv[1])
    share = best_weight / (sum(totals.values()) or 1)

    if current and current.concept_id == best:
        return replace(current, confidence=round(max(current.confidence, share), 3))
    if current and keeps_sensitive(current.concept_id, best):  # los vecinos no sacan a nadie de un sensible
        return current
    knn = Assignment(
        item.entity_type,
        item.entity_id,
        best,
        "embedding",
        round(share, 3),
        model_version,
        f"vecinos:{best}" + (f" (antes {current.source})" if current else ""),
    )
    if current is None:
        return knn if share >= FALLBACK_SHARE else None
    if current.method == "regla":
        return knn if share >= FALLBACK_SHARE else current
    return knn if share >= OVERRIDE_SHARE and len(sims) >= NEIGHBORS - 5 else current


def _from_pgvector_binary(data: bytes) -> np.ndarray:
    """Formato binario de `vector`: dimensión y un campo sin uso (dos int16) y después los float4 en big-endian."""
    return np.frombuffer(data, dtype=">f4", offset=4)
