"""Normalización de texto en español para reglas y comparación: minúsculas, sin tildes ni ñ, solo letras y números."""

import re
import unicodedata

_NON_WORD = re.compile(r"[^a-z0-9]+")


def normalize(text: str) -> str:
    """'Pañales Talla G, 40 u.' → 'panales talla g 40 u'."""
    decomposed = unicodedata.normalize("NFD", text.lower())
    without_marks = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return _NON_WORD.sub(" ", without_marks).strip()


def tokens(text: str) -> list[str]:
    return normalize(text).split()
