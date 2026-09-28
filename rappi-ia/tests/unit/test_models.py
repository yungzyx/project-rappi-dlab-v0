"""Carga de los modelos locales, con un SentenceTransformer falso (sin torch ni descargas)."""

import logging
import sys
import types

from rappi_ia.embeddings import models


class FakeSentenceTransformer:
    def __init__(self, name: str, device: str):
        self.name, self.device = name, device

    def get_sentence_embedding_dimension(self) -> int:
        return 768


def test_models_log_the_device_they_load_on(monkeypatch, caplog):
    fake = types.SimpleNamespace(SentenceTransformer=FakeSentenceTransformer)
    monkeypatch.setitem(sys.modules, "sentence_transformers", fake)
    monkeypatch.setattr(models, "_device", lambda: "mps")

    with caplog.at_level(logging.INFO, logger=models.__name__):
        e5 = models.E5Embedder("e5-test")
        models.ClipEmbedder("clip-test", "clip-texto-test")

    assert e5._model.device == "mps"
    messages = [r.getMessage() for r in caplog.records]
    assert "Cargando e5-test en mps" in messages
    assert "Cargando clip-test y clip-texto-test en mps" in messages
