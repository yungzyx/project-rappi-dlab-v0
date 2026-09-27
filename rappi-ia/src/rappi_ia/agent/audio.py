"""Voz → texto con Whisper local (`faster-whisper`, extra `audio`). El audio no se embebe ni se guarda.

Control de calidad (docs/diseno-ia.md §3): se descarta si no hay voz o si Whisper "alucina" su frase típica
en silencios; si la confianza es baja, Bigotes pregunta "¿Dijiste…?" antes de buscar.
"""

import math
from dataclasses import dataclass
from functools import cache
from typing import BinaryIO

from .. import config
from ..concepts.taxonomy import load_taxonomy
from ..text import normalize

MAX_NO_SPEECH = 0.6
MIN_CONFIDENCE = 0.5
MAX_COMPRESSION = 2.4
KNOWN_HALLUCINATIONS = {
    "subtitulos realizados por la comunidad de amara org",
    "subtitulos por la comunidad de amara org",
    "gracias por ver el video",
    "gracias por ver",
    "suscribete",
    "suscribete al canal",
}


@dataclass
class Transcript:
    text: str
    confidence: float
    needs_confirmation: bool
    discarded: bool
    reason: str | None = None


def assess(segments: list, text: str) -> Transcript:
    """Decide con las métricas de Whisper si el texto sirve, hay que confirmarlo o se descarta."""
    if not segments or not text.strip():
        return Transcript("", 0.0, False, True, "sin voz")
    no_speech = max(s.no_speech_prob for s in segments)
    if no_speech > MAX_NO_SPEECH:
        return Transcript("", 0.0, False, True, f"sin voz (no_speech_prob {no_speech:.2f})")
    if normalize(text) in KNOWN_HALLUCINATIONS:
        return Transcript("", 0.0, False, True, "alucinación conocida de Whisper")
    avg_logprob = sum(s.avg_logprob for s in segments) / len(segments)
    confidence = round(math.exp(avg_logprob), 3)
    compression = max(s.compression_ratio for s in segments)
    needs_confirmation = confidence < MIN_CONFIDENCE or compression > MAX_COMPRESSION
    return Transcript(text.strip(), confidence, needs_confirmation, False)


class Transcriber:
    def __init__(self, model_size: str = config.WHISPER_MODEL):
        from faster_whisper import WhisperModel

        # En Mac, CTranslate2 corre en CPU; int8 es rápido y suficiente para frases cortas.
        self._model = WhisperModel(model_size, device="cpu", compute_type="int8")
        self.model_name = f"faster-whisper/{model_size}"
        self.prompt = vocabulary_prompt()

    def transcribe(self, audio: str | BinaryIO) -> Transcript:
        segments, _ = self._model.transcribe(
            audio,
            language="es",
            vad_filter=True,
            condition_on_previous_text=False,
            beam_size=5,
            initial_prompt=self.prompt,
        )
        segments = list(segments)
        return assess(segments, " ".join(s.text.strip() for s in segments))


def vocabulary_prompt(max_concepts: int = 60) -> str:
    """Vocabulario del dominio para Whisper: con él, "tienes pañales" deja de oírse como "tiene español"."""
    names = ", ".join(c.name.lower() for c in list(load_taxonomy().concepts.values())[:max_concepts])
    return f"Pedido por voz en Rappi Chile: {names}, pañales, chelas, completos."


@cache
def transcriber() -> Transcriber:
    return Transcriber()
