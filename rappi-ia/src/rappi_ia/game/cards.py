"""Las tarjetas de conocimiento del juego (`knowledge.json`) y sus ligas a conceptos (`card_concepts.toml`).

Las ligas salen de una regla (el mismo reconocedor de palabras clave que asigna conceptos a los productos) y se
revisan una por una: cada propuesta de la regla queda aceptada (`concepts`) o rechazada (`rejected`), y en la revisión
se agrega el concepto evidente que la regla no vio. Solo esa revisión llega a la base.
"""

import json
import re
import tomllib
from dataclasses import dataclass
from pathlib import Path

from psycopg import Connection
from psycopg.types.json import Jsonb

from ..concepts.assign import concept_matcher
from ..concepts.taxonomy import load_taxonomy
from ..offers.guards import OFFER_BLOCKED_VERTICALS
from . import GAME_VERTICALS

DATA_DIR = Path(__file__).resolve().parent
CARDS_FILE = DATA_DIR / "knowledge.json"
LINKS_FILE = DATA_DIR / "card_concepts.toml"

# Los textos de la regla: nunca las alternativas de una pregunta, que traen distractores.
RULE_FIELDS = ("title", "text", "question", "explanation")
KINDS = {
    "dato": ("title", "text"),
    "pregunta": ("question", "options", "answer", "explanation"),
}
OPTIONS = 3


@dataclass(frozen=True)
class CardLinks:
    concepts: tuple[str, ...]  # aceptadas: de la regla (method 'regla') o agregadas a mano (method 'manual')
    rejected: tuple[str, ...]  # propuestas de la regla que no calzan con la tarjeta


def read_cards(path: Path = CARDS_FILE) -> list[dict]:
    """Lee las tarjetas en el orden del archivo y valida su forma; `ValueError` en español si algo no cumple."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise ValueError(f"{path.name}: debe ser una lista de tarjetas")
    if not raw:
        raise ValueError(f"{path.name}: sin tarjetas (¿archivo vacío o cortado?)")
    seen: set[str] = set()
    for card in raw:
        _validate(card)
        if card["id"] in seen:
            raise ValueError(f"Tarjeta {card['id']}: id repetido")
        seen.add(card["id"])
    return raw


def _validate(card: object) -> None:
    if not isinstance(card, dict) or not isinstance(card.get("id"), str):
        raise ValueError(f"Tarjeta sin id: {card!r}")
    card_id = card["id"]
    kind = card.get("kind")
    if kind not in KINDS:
        raise ValueError(f"Tarjeta {card_id}: tipo inválido {kind!r} (dato o pregunta)")
    vertical = card.get("vertical")
    if vertical not in GAME_VERTICALS:
        raise ValueError(f"Tarjeta {card_id}: vertical inválida {vertical!r}")
    if not re.fullmatch(rf"{vertical}-\d\d", card_id):
        raise ValueError(f"Tarjeta {card_id}: el id debe ser «{vertical}-NN»")
    expected = {"id", "vertical", "kind", "source", *KINDS[kind]}
    if set(card) != expected:
        raise ValueError(f"Tarjeta {card_id}: claves {sorted(set(card) ^ expected)} sobran o faltan")
    for key in KINDS[kind]:
        if key not in ("options", "answer") and not _text(card[key]):
            raise ValueError(f"Tarjeta {card_id}: «{key}» debe ser un texto no vacío")
    if kind == "pregunta":
        options = card["options"]
        if not (isinstance(options, list) and len(options) == OPTIONS and all(_text(o) for o in options)):
            raise ValueError(f"Tarjeta {card_id}: debe tener {OPTIONS} alternativas con texto")
        if len(set(options)) != OPTIONS:
            raise ValueError(f"Tarjeta {card_id}: las alternativas deben ser distintas")
        answer = card["answer"]
        if isinstance(answer, bool) or not isinstance(answer, int) or not 0 <= answer < OPTIONS:
            raise ValueError(f"Tarjeta {card_id}: «answer» debe ser 0, 1 o 2")
    source = card["source"]
    if not (isinstance(source, dict) and set(source) == {"title", "url"} and _text(source["title"])):
        raise ValueError(f"Tarjeta {card_id}: «source» debe traer título y url")
    if not (_text(source["url"]) and source["url"].startswith("https://")):
        raise ValueError(f"Tarjeta {card_id}: la fuente debe ser una url https")


def _text(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def rule_links(card: dict, matcher) -> set[str]:
    """Conceptos que la regla propone para una tarjeta: los que nombran su título, texto, pregunta o explicación.
    Sin los sensibles: una tarjeta del juego nunca se liga a ellos."""
    concepts = load_taxonomy().concepts
    found: set[str] = set()
    for key in RULE_FIELDS:
        if card.get(key):
            found |= {m.target for m in matcher.matches(card[key])}
    return {concept_id for concept_id in found if not concepts[concept_id].sensitive}


def read_links(path: Path = LINKS_FILE) -> dict[str, CardLinks]:
    raw = tomllib.loads(path.read_text(encoding="utf-8"))
    for card_id, entry in raw.get("cards", {}).items():
        for key in entry.keys() - {"concepts", "rejected"}:
            raise ValueError(f"{path.name}, tarjeta {card_id}: clave desconocida «{key}» (solo concepts y rejected)")
    return {
        card_id: CardLinks(tuple(entry.get("concepts", ())), tuple(entry.get("rejected", ())))
        for card_id, entry in raw.get("cards", {}).items()
    }


def load_knowledge(conn: Connection, cards_path: Path = CARDS_FILE, links_path: Path = LINKS_FILE) -> dict:
    """Deja en la base las tarjetas del archivo con sus ligas revisadas y borra las que ya no están (con sus ligas).
    Idempotente. Los conceptos ya deben estar en la base (`rappi-ia concepts`)."""
    cards = read_cards(cards_path)
    links = read_links(links_path)
    without_links = [c["id"] for c in cards if c["id"] not in links]
    if without_links:
        raise ValueError(f"Tarjetas sin revisión de ligas en {links_path.name}: {', '.join(without_links)}")
    known = {row[0] for row in conn.execute("SELECT concept_id FROM concepts")}
    missing = sorted({cid for c in cards for cid in links[c["id"]].concepts} - known)
    if missing:
        raise ValueError(f"Conceptos que no están en la base ({', '.join(missing)}): corre `rappi-ia concepts`")
    matcher = concept_matcher(load_taxonomy())
    ids = [c["id"] for c in cards]
    conn.execute("DELETE FROM knowledge_cards WHERE card_id <> ALL(%s)", (ids,))
    conn.execute("DELETE FROM knowledge_card_concepts WHERE card_id = ANY(%s)", (ids,))
    linked = 0
    for position, card in enumerate(cards, start=1):
        conn.execute(
            """INSERT INTO knowledge_cards (card_id, vertical, kind, position, title, text, question, options, answer,
                                            explanation, source_title, source_url, updated_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
               ON CONFLICT (card_id) DO UPDATE SET
                 vertical = EXCLUDED.vertical, kind = EXCLUDED.kind, position = EXCLUDED.position,
                 title = EXCLUDED.title, text = EXCLUDED.text, question = EXCLUDED.question,
                 options = EXCLUDED.options, answer = EXCLUDED.answer, explanation = EXCLUDED.explanation,
                 source_title = EXCLUDED.source_title, source_url = EXCLUDED.source_url, updated_at = now()""",
            (
                card["id"],
                card["vertical"],
                card["kind"],
                position,
                card.get("title"),
                card.get("text"),
                card.get("question"),
                Jsonb(card["options"]) if "options" in card else None,
                card.get("answer"),
                card.get("explanation"),
                card["source"]["title"],
                card["source"]["url"],
            ),
        )
        proposed = rule_links(card, matcher)
        for concept_id in links[card["id"]].concepts:
            conn.execute(
                "INSERT INTO knowledge_card_concepts (card_id, concept_id, method) VALUES (%s, %s, %s)",
                (card["id"], concept_id, "regla" if concept_id in proposed else "manual"),
            )
            linked += 1
    conn.commit()
    return {"tarjetas": len(cards), "ligas": linked}


def list_cards(conn: Connection, vertical: str | None = None) -> list[dict]:
    """Las tarjetas en el orden del archivo, cada una con las claves de su tipo (como en el JSON) y sus `concepts`."""
    rows = conn.execute(
        """SELECT c.card_id, c.vertical, c.kind, c.title, c.text, c.question, c.options, c.answer, c.explanation,
                  c.source_title, c.source_url,
                  coalesce(array_agg(l.concept_id ORDER BY l.concept_id) FILTER (WHERE l.concept_id IS NOT NULL),
                           '{}') AS concepts
           FROM knowledge_cards c LEFT JOIN knowledge_card_concepts l USING (card_id)
           WHERE %(vertical)s::text IS NULL OR c.vertical = %(vertical)s
           GROUP BY c.card_id ORDER BY c.position""",
        {"vertical": vertical},
    ).fetchall()
    result = []
    for card_id, vertical_, kind, title, text, question, options, answer, explanation, s_title, s_url, concepts in rows:
        card = {"id": card_id, "vertical": vertical_, "kind": kind}
        if kind == "dato":
            card |= {"title": title, "text": text}
        else:
            card |= {"question": question, "options": options, "answer": answer, "explanation": explanation}
        result.append(card | {"source": {"title": s_title, "url": s_url}, "concepts": list(concepts)})
    return result


def did_you_know(conn: Connection, concept_ids: list[str], user_id: str | None) -> dict | None:
    """El primer dato del juego ligado a lo que la persona buscó, o `None`. Va en el orden de `concept_ids` y después
    en el del archivo. Es una oferta (nadie lo pidió): por eso no sale de una vertical que las ofertas bloquean, ni
    de una tarjeta ligada a algún concepto sensible o +18, ni uno que la persona ya descubrió o guardó."""
    # Se lee el documento tal cual: un id que ya no existe es inofensivo en la exclusión.
    row = conn.execute("SELECT state FROM game_state WHERE user_id = %s", (user_id,)).fetchone() if user_id else None
    seen = []
    if row:
        seen = [*row[0]["cards"], *(card for cards in row[0]["discovered"].values() for card in cards)]
    row = conn.execute(
        """SELECT c.card_id, c.vertical, c.title, c.text, c.source_title, c.source_url
           FROM unnest(%(concepts)s::text[]) WITH ORDINALITY AS wanted (concept_id, ord)
           JOIN knowledge_card_concepts l ON l.concept_id = wanted.concept_id
           JOIN knowledge_cards c ON c.card_id = l.card_id
           WHERE c.kind = 'dato'
             AND c.vertical <> ALL(%(blocked)s::text[])
             AND c.card_id <> ALL(%(seen)s::text[])
             AND NOT EXISTS (SELECT 1 FROM knowledge_card_concepts other
                             JOIN concepts k ON k.concept_id = other.concept_id
                             WHERE other.card_id = c.card_id AND (k.sensitive OR k.age_restricted))
           ORDER BY wanted.ord, c.position LIMIT 1""",
        {"concepts": concept_ids, "blocked": list(OFFER_BLOCKED_VERTICALS), "seen": seen},
    ).fetchone()
    if row is None:
        return None
    card_id, vertical, title, text, source_title, source_url = row
    return {
        "id": card_id,
        "vertical": vertical,
        "title": title,
        "text": text,
        "source": {"title": source_title, "url": source_url},
    }
