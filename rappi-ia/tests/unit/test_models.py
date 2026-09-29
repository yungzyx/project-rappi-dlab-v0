"""Carga de los modelos locales, con un SentenceTransformer falso (sin torch ni descargas)."""

import logging
import sys
import threading
import time
import types
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pytest

from rappi_ia.agent import audio
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


class CountingCall:
    """Cuenta cuántas llamadas al modelo corren a la vez (la API atiende en un pool de hilos)."""

    def __init__(self, result):
        self.result, self.active, self.peak = result, 0, 0
        self._lock = threading.Lock()

    def __call__(self, *args, **kwargs):
        with self._lock:
            self.active += 1
            self.peak = max(self.peak, self.active)
        time.sleep(0.02)
        with self._lock:
            self.active -= 1
        return self.result


def _in_parallel(fn, n=6):
    with ThreadPoolExecutor(n) as pool:
        list(pool.map(lambda _: fn(), range(n)))


@pytest.fixture
def fake_sentence_transformers(monkeypatch):
    monkeypatch.setitem(
        sys.modules, "sentence_transformers", types.SimpleNamespace(SentenceTransformer=FakeSentenceTransformer)
    )
    monkeypatch.setattr(models, "_device", lambda: "mps")


def test_e5_serves_one_request_at_a_time(fake_sentence_transformers):
    e5 = models.E5Embedder("e5-test")
    e5._model.encode = CountingCall(np.zeros((1, 768)))

    _in_parallel(lambda: e5.embed_queries(["cerveza"]))

    assert e5._model.encode.peak == 1


def test_clip_serves_one_request_at_a_time(fake_sentence_transformers):
    clip = models.ClipEmbedder("clip-test", "clip-texto-test")
    clip._image_model.encode = clip._text_model.encode = CountingCall(np.zeros((1, 512)))

    _in_parallel(lambda: (clip.embed_images(["foto"]), clip.embed_texts(["cerveza"])))

    assert clip._image_model.encode.peak == 1


def test_whisper_serves_one_request_at_a_time(monkeypatch):
    whisper = types.SimpleNamespace(WhisperModel=lambda *args, **kwargs: types.SimpleNamespace())
    monkeypatch.setitem(sys.modules, "faster_whisper", whisper)
    transcriber = audio.Transcriber("tiny")
    transcriber._model.transcribe = CountingCall(([], None))

    _in_parallel(lambda: transcriber.transcribe("audio.webm"))

    assert transcriber._model.transcribe.peak == 1
