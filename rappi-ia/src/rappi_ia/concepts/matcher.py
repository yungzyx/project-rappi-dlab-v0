"""Reglas por palabras clave: encuentra el concepto (u ocasión) que nombra un texto.

Calza por palabras completas (no substrings: "bebestibles" no es "bebé"). Una palabra suelta también
calza su plural (s/es). Si varias reglas calzan, gana la más específica (más palabras) y, a igualdad,
la que aparece primero en el texto ("Combo hamburguesa + bebida" → hamburguesa).
"""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass

from ..text import tokens


@dataclass(frozen=True)
class Match:
    target: str  # id del concepto u ocasión
    keyword: str
    words: int
    position: int


class KeywordMatcher:
    def __init__(self, entries: Iterable[tuple[str, str]]):
        """`entries`: pares (id, palabra clave)."""
        self._by_first: dict[str, list[tuple[tuple[str, ...], str, str]]] = defaultdict(list)
        for target, keyword in entries:
            words = tuple(tokens(keyword))
            if words:
                self._by_first[words[0]].append((words, target, keyword))

    def matches(self, text: str) -> list[Match]:
        words = tokens(text)
        found: dict[str, Match] = {}
        for i, word in enumerate(words):
            for candidate in self._candidates(word):
                for kw_words, target, keyword in self._by_first.get(candidate, ()):
                    if _matches_at(words, i, kw_words):
                        match = Match(target, keyword, len(kw_words), i)
                        best = found.get(target)
                        if best is None or _rank(match) > _rank(best):
                            found[target] = match
        # Sin solapes: si "papas fritas" (snacks) calzó, "papas" (verduras) en las mismas palabras no cuenta.
        covered: set[int] = set()
        result = []
        for match in sorted(found.values(), key=_rank, reverse=True):
            span = set(range(match.position, match.position + match.words))
            if span & covered:
                continue
            covered |= span
            result.append(match)
        return result

    def best(self, text: str) -> Match | None:
        found = self.matches(text)
        return found[0] if found else None

    @staticmethod
    def _candidates(word: str) -> tuple[str, ...]:
        """La palabra tal cual y su posible singular (galletas → galleta, panes → pan)."""
        options = [word]
        if len(word) > 3 and word.endswith("es"):
            options.append(word[:-2])
        if len(word) > 2 and word.endswith("s"):
            options.append(word[:-1])
        return tuple(options)


def _matches_at(words: list[str], start: int, kw_words: tuple[str, ...]) -> bool:
    if start + len(kw_words) > len(words):
        return False
    if len(kw_words) == 1:
        return True  # la primera palabra ya calzó (con plural) en `matches`
    return tuple(words[start : start + len(kw_words)]) == kw_words


def _rank(match: Match) -> tuple[int, int]:
    return (match.words, -match.position)
