"""Embeddings CLIP de las fotos de productos y platos. Solo se guarda el vector; la imagen no.

Descarga con ritmo prudente. Por la regla del proyecto ("no correr dos descargas en paralelo"), se niega a
correr mientras haya una corrida del scraper en curso, salvo `force=True` (pensado para pruebas chicas).
"""

import hashlib
import io
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor

from psycopg import Connection

from ..db import set_index_build_memory
from .base import to_pgvector

log = logging.getLogger(__name__)

PLACEHOLDER = re.compile(r"NO-IMAGE", re.IGNORECASE)
MAX_BYTES = 5_000_000
TIMEOUT = 15
WORKERS = 4
BATCH = 32
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)"


class ScrapeRunning(RuntimeError):
    pass


def pending_images(conn: Connection, model: str, limit: int | None = None, vertical: str | None = None) -> list[str]:
    return [
        r[0]
        for r in conn.execute(
            """WITH urls AS (
                   SELECT DISTINCT d.metadata ->> 'imagen' AS url
                   FROM search_documents d
                   WHERE d.metadata ? 'imagen' AND (%(vertical)s::text IS NULL OR d.vertical = %(vertical)s)
               )
               SELECT url FROM urls
               WHERE url LIKE 'http%%'
                 AND NOT EXISTS (SELECT 1 FROM image_embeddings e
                                 WHERE e.image_url = urls.url AND e.embedding_model = %(model)s)
               ORDER BY md5(url)
               LIMIT %(limit)s""",
            {"model": model, "limit": limit, "vertical": vertical},
        )
    ]


def scrape_running(conn: Connection) -> bool:
    return bool(conn.execute("SELECT 1 FROM scrape_runs WHERE status = 'running' LIMIT 1").fetchone())


def embed_images(
    conn: Connection, clip, limit: int | None = None, vertical: str | None = None, force: bool = False
) -> dict:
    if scrape_running(conn) and not force:
        raise ScrapeRunning(
            "Hay una corrida del scraper en curso: espera a que termine (o usa --forzar con --limit chico)"
        )
    import requests

    urls = pending_images(conn, clip.model_name, limit, vertical)
    log.info("%d imágenes por embeber con %s", len(urls), clip.model_name)
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    counts = {"ok": 0, "error": 0, "placeholder": 0}
    started = time.monotonic()
    for start in range(0, len(urls), BATCH):
        batch = urls[start : start + BATCH]
        with ThreadPoolExecutor(WORKERS) as pool:
            images = list(pool.map(lambda u: _download(session, u), batch))
        ok = [(u, img) for u, (img, _) in zip(batch, images, strict=True) if img is not None]
        vectors = clip.embed_images([img for _, img in ok]) if ok else []
        by_url = {u: v for (u, _), v in zip(ok, vectors, strict=True)}
        rows = []
        for url, (_img, status_error) in zip(batch, images, strict=True):
            if url in by_url:
                rows.append((url, clip.model_name, to_pgvector(by_url[url]), "ok", None))
            else:
                status, error = status_error
                rows.append((url, clip.model_name, None, status, error))
            counts[rows[-1][3]] += 1
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO image_embeddings (image_url, embedding_model, embedding, status, error)
                   VALUES (%s, %s, %s::vector, %s, %s)
                   ON CONFLICT (image_url, embedding_model) DO UPDATE SET
                     embedding = EXCLUDED.embedding, status = EXCLUDED.status, error = EXCLUDED.error,
                     updated_at = now()""",
                rows,
            )
        conn.commit()
        log.info(
            "  %d/%d imágenes (%.1f/s)",
            start + len(batch),
            len(urls),
            (start + len(batch)) / (time.monotonic() - started),
        )
    ensure_image_index(conn, clip.model_name)
    return counts


def ensure_image_index(conn: Connection, model: str, dim: int = 512) -> None:
    name = f"image_embeddings_hnsw_{hashlib.md5(model.encode()).hexdigest()[:8]}"
    set_index_build_memory(conn)
    conn.execute(
        f"""CREATE INDEX IF NOT EXISTS {name} ON image_embeddings
            USING hnsw ((embedding::vector({int(dim)})) vector_cosine_ops)
            WHERE embedding_model = '{model.replace("'", "''")}' AND status = 'ok'"""
    )
    conn.commit()


def _download(session, url: str):
    """Devuelve (imagen PIL o None, (estado, error))."""
    if PLACEHOLDER.search(url):
        return None, ("placeholder", None)
    try:
        from PIL import Image

        response = session.get(url, timeout=TIMEOUT)
        response.raise_for_status()
        if len(response.content) > MAX_BYTES:
            return None, ("error", "imagen demasiado grande")
        image = Image.open(io.BytesIO(response.content)).convert("RGB")
        image.thumbnail((336, 336))
        time.sleep(0.2)  # ritmo prudente por hilo
        return image, ("ok", None)
    except Exception as exc:  # red, 404, formato raro: se registra y se sigue
        return None, ("error", f"{type(exc).__name__}: {str(exc)[:120]}")
