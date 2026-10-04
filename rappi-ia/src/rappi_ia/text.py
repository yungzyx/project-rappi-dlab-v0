"""Normalización de texto en español para reglas y comparación: minúsculas, sin tildes ni ñ, solo letras y números."""

import re
import unicodedata

_NON_WORD = re.compile(r"[^a-z0-9]+")

# Palabras de un mensaje que no dicen qué se busca (normalizadas): saludo, cortesía, nombre del asistente y pedido.
GREETING_WORDS = {"hola", "holi", "buenas", "buenos", "dias", "tardes", "noches", "hey", "wena", "alo", "ola"}
THANKS_WORDS = {"gracias", "muchas", "vale", "listo", "ok", "okay", "perfecto", "genial", "bacan", "buenisimo"}
ASSISTANT_WORDS = {"bigotes"}
REQUEST_WORDS = {
    "quiero",
    "queria",
    "busco",
    "necesito",
    "tienen",
    "tienes",
    "hay",
    "dame",
    "me",
    "podrias",
    "puedes",
    "porfa",
    "por",
    "favor",
    "un",
    "una",
    "unos",
    "unas",
}
FILLER_WORDS = frozenset(GREETING_WORDS | THANKS_WORDS | ASSISTANT_WORDS | REQUEST_WORDS)


def normalize(text: str) -> str:
    """'Pañales Talla G, 40 u.' → 'panales talla g 40 u'."""
    decomposed = unicodedata.normalize("NFD", text.lower())
    without_marks = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return _NON_WORD.sub(" ", without_marks).strip()


def tokens(text: str) -> list[str]:
    return normalize(text).split()
