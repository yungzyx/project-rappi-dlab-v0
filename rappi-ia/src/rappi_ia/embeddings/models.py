"""Modelos locales: e5 para texto y CLIP para imágenes (requieren el extra `ml`: `pip install -e ".[ml]"`).

Se cargan una sola vez por proceso. En un Mac con Apple Silicon usan la GPU (MPS) si está disponible.
"""

from functools import cache

import numpy as np

from .. import config


def _device() -> str:
    import torch

    return "mps" if torch.backends.mps.is_available() else "cpu"


class E5Embedder:
    """`intfloat/multilingual-e5-*`: exige prefijos `passage:` (documentos) y `query:` (consultas)."""

    def __init__(self, model_name: str = config.TEXT_EMBEDDING_MODEL, batch_size: int = 64):
        from sentence_transformers import SentenceTransformer

        self.model_name = model_name
        self.batch_size = batch_size
        self._model = SentenceTransformer(model_name, device=_device())
        self._model.max_seq_length = 512
        dimension = (
            getattr(self._model, "get_embedding_dimension", None) or self._model.get_sentence_embedding_dimension
        )
        self.dim = dimension()

    def _encode(self, texts: list[str]) -> np.ndarray:
        return self._model.encode(
            texts, batch_size=self.batch_size, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False
        ).astype(np.float32)

    def embed_documents(self, texts: list[str]) -> np.ndarray:
        return self._encode([f"passage: {t}" for t in texts])

    def embed_queries(self, texts: list[str]) -> np.ndarray:
        return self._encode([f"query: {t}" for t in texts])


class ClipEmbedder:
    """CLIP ViT-B/32 (pesos de OpenAI) para imágenes + codificador multilingüe alineado para texto en español.

    El codificador multilingüe solo está alineado con estos pesos: no mezclar con otros CLIP.
    """

    def __init__(
        self,
        image_model: str = config.IMAGE_EMBEDDING_MODEL,
        text_model: str = config.IMAGE_TEXT_EMBEDDING_MODEL,
    ):
        from sentence_transformers import SentenceTransformer

        device = _device()
        self.model_name = image_model
        self.text_model_name = text_model
        self._image_model = SentenceTransformer(image_model, device=device)
        self._text_model = SentenceTransformer(text_model, device=device)
        self.dim = 512

    def embed_images(self, images: list) -> np.ndarray:
        """`images`: objetos PIL.Image en RGB."""
        return self._image_model.encode(
            images, batch_size=32, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False
        ).astype(np.float32)

    def embed_texts(self, texts: list[str]) -> np.ndarray:
        return self._text_model.encode(
            texts, batch_size=64, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False
        ).astype(np.float32)


@cache
def text_embedder() -> E5Embedder:
    return E5Embedder()


@cache
def clip_embedder() -> ClipEmbedder:
    return ClipEmbedder()
