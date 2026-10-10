"""El archivo de tarjetas del juego (108) y la revisión a mano de sus ligas a conceptos."""

import json
import re

import pytest

from rappi_ia.concepts.assign import concept_matcher
from rappi_ia.concepts.taxonomy import load_taxonomy
from rappi_ia.game import GAME_VERTICALS
from rappi_ia.game.cards import read_cards, read_links, rule_links

LIMITS = {"title": 40, "text": 200, "question": 140, "option": 60, "explanation": 200}


@pytest.fixture(scope="module")
def cards():
    return read_cards()


@pytest.fixture(scope="module")
def matcher():
    return concept_matcher(load_taxonomy())


def of(cards, vertical, kind=None):
    return [c for c in cards if c["vertical"] == vertical and (kind is None or c["kind"] == kind)]


def test_has_six_facts_and_six_questions_per_vertical(cards):
    for vertical in GAME_VERTICALS:
        assert len(of(cards, vertical, "dato")) == 6, vertical
        assert len(of(cards, vertical, "pregunta")) == 6, vertical
    assert len(cards) == 108


def test_ids_are_unique_and_prefixed_by_vertical(cards):
    assert len({c["id"] for c in cards}) == len(cards)
    for card in cards:
        assert re.fullmatch(rf"{card['vertical']}-\d\d", card["id"]), card["id"]


def test_texts_fit_the_card(cards):
    for card in cards:
        if card["kind"] == "dato":
            assert len(card["title"]) <= LIMITS["title"], card["id"]
            assert len(card["text"]) <= LIMITS["text"], card["id"]
        else:
            assert len(card["question"]) <= LIMITS["question"], card["id"]
            assert len(card["explanation"]) <= LIMITS["explanation"], card["id"]
            assert all(len(option) <= LIMITS["option"] for option in card["options"]), card["id"]


def test_every_source_is_https(cards):
    for card in cards:
        assert card["source"]["title"], card["id"]
        assert card["source"]["url"].startswith("https://"), card["id"]


def test_questions_have_three_distinct_options_and_a_valid_answer(cards):
    for card in (c for c in cards if c["kind"] == "pregunta"):
        assert len(card["options"]) == 3, card["id"]
        assert len(set(card["options"])) == 3, card["id"]
        assert card["answer"] in {0, 1, 2}, card["id"]


def test_answers_do_not_all_sit_in_the_same_position_per_vertical(cards):
    for vertical in GAME_VERTICALS:
        assert len({c["answer"] for c in of(cards, vertical, "pregunta")}) > 1, vertical


def test_read_cards_rejects_a_broken_card(cards, tmp_path):
    broken = {k: v for k, v in cards[0].items() if k != "source"}
    path = tmp_path / "cards.json"
    path.write_text(json.dumps([broken]), encoding="utf-8")

    with pytest.raises(ValueError, match=cards[0]["id"]):
        read_cards(path)


def test_read_cards_rejects_a_repeated_id(cards, tmp_path):
    path = tmp_path / "cards.json"
    path.write_text(json.dumps([cards[0], cards[0]]), encoding="utf-8")

    with pytest.raises(ValueError, match="repetido"):
        read_cards(path)


def test_read_cards_rejects_an_empty_file(tmp_path):
    path = tmp_path / "cards.json"
    path.write_text("[]", encoding="utf-8")

    with pytest.raises(ValueError, match="sin tarjetas"):
        read_cards(path)


def test_read_links_rejects_unknown_keys(tmp_path):
    path = tmp_path / "links.toml"
    path.write_text('[cards.supermercado-01]\nconcepts = ["verduras"]\nrejcted = []\n', encoding="utf-8")

    with pytest.raises(ValueError, match="supermercado-01.*rejcted"):
        read_links(path)


def test_every_card_has_a_reviewed_links_entry(cards):
    links = read_links()
    assert {c["id"] for c in cards} == set(links)


def test_every_rule_proposal_was_reviewed(cards, matcher):
    links = read_links()
    for card in cards:
        reviewed = set(links[card["id"]].concepts) | set(links[card["id"]].rejected)
        assert rule_links(card, matcher) <= reviewed, card["id"]


def test_linked_concepts_exist_and_are_not_sensitive(cards):
    concepts = load_taxonomy().concepts
    for card_id, links in read_links().items():
        for concept_id in (*links.concepts, *links.rejected):
            assert concept_id in concepts, (card_id, concept_id)
        for concept_id in links.concepts:
            assert not concepts[concept_id].sensitive, (card_id, concept_id)
        assert not set(links.concepts) & set(links.rejected), card_id


def test_rule_links_ignore_options(matcher):
    card = {
        "id": "licores-99",
        "vertical": "licores",
        "kind": "pregunta",
        "question": "¿Cuál de estas cosas es la correcta?",
        "options": ["La cerveza", "Una cosa", "Otra cosa"],
        "answer": 1,
        "explanation": "Ninguna nombra nada.",
    }

    assert rule_links(card, matcher) == set()
    assert rule_links({**card, "question": "¿Cómo se hace la cerveza?"}, matcher) == {"cerveza"}


def test_rule_links_skip_sensitive_concepts(matcher):
    card = {"id": "farmacia-99", "kind": "dato", "title": "Aspirina y cigarrillos", "text": "Un texto."}

    assert {m.target for m in matcher.matches(card["title"])} >= {"medicamentos", "cigarrillos"}
    assert rule_links(card, matcher) == set()


def test_links_file_only_names_cards_of_the_file(cards):
    assert set(read_links()) <= {c["id"] for c in cards}
