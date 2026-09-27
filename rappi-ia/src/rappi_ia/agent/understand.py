"""Entender el mensaje: intención, vertical, conceptos, ocasión y filtros (reglas; sin LLM).

Corrige los errores del cerebro por reglas del prototipo:
- un saludo al inicio ya no tapa el pedido ("hola, quiero sushi" → buscar sushi);
- palabras completas, no substrings ("bebestibles" no es bebé);
- el vertical sale del contexto (pantalla actual), de una mención explícita o del surtido del concepto; si un
  concepto vive en restaurantes y en tiendas con surtido parecido (pizza), se pregunta en vez de adivinar.
"""

import re
from dataclasses import dataclass, field

from psycopg import Connection

from ..concepts.assign import concept_matcher
from ..concepts.matcher import KeywordMatcher
from ..concepts.taxonomy import load_taxonomy
from ..text import normalize

GREETINGS = {"hola", "holi", "buenas", "buenos dias", "buenas tardes", "buenas noches", "hey", "wena", "alo", "ola"}
THANKS = {"gracias", "muchas gracias", "vale", "listo", "ok", "okay", "perfecto", "genial", "bacan"}

VERTICAL_MENTIONS = {
    "supermercado": ["supermercado", "super", "súper", "lider", "líder", "unimarc", "jumbo", "tottus"],
    "licores": ["botilleria", "botillería", "licoreria", "licorería", "liquor"],
    "farmacia": ["farmacia", "cruz verde", "salcobrand", "ahumada"],
    "restaurantes": ["restaurante", "restaurant", "para pedir", "delivery de comida", "comida preparada"],
    "mall": ["rappi mall", "tienda de ropa", "mall", "retail"],
    "conveniencia": ["oxxo", "express", "almacen", "almacén", "minimarket"],
    "chocolateria": ["chocolateria", "chocolatería"],
}
# Un concepto en restaurantes y en otra tienda es ambiguo si la tienda tiene al menos esta fracción del surtido.
AMBIGUITY_RATIO = 0.3
PRICE = re.compile(
    r"(?:bajo|menos de|hasta|maximo|max|no mas de|por menos de)\s*\$?\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*(mil|lucas|k)?"
)


@dataclass
class Intent:
    kind: str  # saludo | gracias | buscar | ocasion | aclarar | vacio
    text: str
    vertical: str | None = None
    concepts: list[str] = field(default_factory=list)
    occasion: str | None = None
    price_max: float | None = None
    confidence: float = 0.0
    options: list[str] = field(default_factory=list)  # verticales candidatos cuando hay que aclarar
    explicit_vertical: bool = False
    explicit_concepts: bool = False  # los conceptos se nombraron (no vienen solo de la ocasión)


class Understander:
    def __init__(self):
        taxonomy = load_taxonomy()
        self.taxonomy = taxonomy
        self.concepts = concept_matcher(taxonomy)
        self.occasions = KeywordMatcher((o.id, kw) for o in taxonomy.occasions.values() for kw in o.keywords)
        self.verticals = KeywordMatcher((v, kw) for v, kws in VERTICAL_MENTIONS.items() for kw in kws)

    def understand(self, conn: Connection, text: str, current_vertical: str | None = None) -> Intent:
        normalized = normalize(text)
        if not normalized:
            return Intent("vacio", text)
        if normalized in GREETINGS:
            return Intent("saludo", text, current_vertical, confidence=1.0)
        if normalized in THANKS:
            return Intent("gracias", text, current_vertical, confidence=1.0)

        body = _strip_greeting(normalized)
        price_max = _price(body)
        occasion = self.occasions.best(body)
        concept_matches = self.concepts.matches(body)
        concepts = [m.target for m in concept_matches]
        mention = self.verticals.best(body)

        explicit = bool(concepts)
        if occasion and not concepts:
            concepts = list(self.taxonomy.occasions[occasion.target].concepts)
        kind = "ocasion" if occasion else "buscar"
        confidence = 0.9 if concept_matches else (0.7 if occasion else 0.3)

        if mention:
            return Intent(
                kind, text, mention.target, concepts, _id(occasion), price_max, confidence, [], True, explicit
            )
        if current_vertical:
            return Intent(
                kind, text, current_vertical, concepts, _id(occasion), price_max, confidence, [], False, explicit
            )
        if not concepts:
            return Intent(kind, text, None, [], _id(occasion), price_max, confidence)

        options = _verticals_for(conn, concepts[0])
        if len(options) >= 2 and "restaurantes" in options[:2] and _comparable(conn, concepts[0], options[:2]):
            return Intent(
                "aclarar", text, None, concepts, _id(occasion), price_max, confidence, options[:2], False, explicit
            )
        return Intent(
            kind,
            text,
            options[0] if options else None,
            concepts,
            _id(occasion),
            price_max,
            confidence,
            [],
            False,
            explicit,
        )


def _strip_greeting(normalized: str) -> str:
    words = normalized.split()
    while words and (words[0] in GREETINGS or " ".join(words[:2]) in GREETINGS):
        words = words[2:] if " ".join(words[:2]) in GREETINGS else words[1:]
    return " ".join(words) or normalized


def _price(text: str) -> float | None:
    match = PRICE.search(text)
    if not match:
        return None
    value = float(re.sub(r"[.\s]", "", match.group(1)))
    return value * 1000 if match.group(2) else value


def _id(match) -> str | None:
    return match.target if match else None


def _verticals_for(conn: Connection, concept_id: str) -> list[str]:
    rows = conn.execute(
        "SELECT vertical FROM v_concept_assortment WHERE concept_id = %s AND items > 0 ORDER BY items DESC",
        (concept_id,),
    ).fetchall()
    return [r[0] for r in rows]


def _comparable(conn: Connection, concept_id: str, verticals: list[str]) -> bool:
    counts = dict(
        conn.execute(
            "SELECT vertical, items FROM v_concept_assortment WHERE concept_id = %s AND vertical = ANY(%s)",
            (concept_id, verticals),
        ).fetchall()
    )
    values = [counts.get(v, 0) for v in verticals]
    return min(values) >= AMBIGUITY_RATIO * max(values)
