"""Las tarjetas del juego en la base, con sus ligas a conceptos."""

import json

import pytest

from rappi_ia.concepts.assign import concept_matcher
from rappi_ia.concepts.pipeline import build_concepts
from rappi_ia.concepts.taxonomy import load_taxonomy
from rappi_ia.game import GAME_VERTICALS
from rappi_ia.game.cards import list_cards, load_knowledge, read_cards, read_links, rule_links


@pytest.fixture
def loaded(db):
    build_concepts(db)
    return load_knowledge(db)


def test_load_knowledge_writes_108_cards_and_reviewed_links(db, loaded):
    links = read_links()
    matcher = concept_matcher(load_taxonomy())
    cards = {c["id"]: c for c in read_cards()}

    assert loaded["tarjetas"] == 108
    rows = db.execute("SELECT card_id, concept_id, method FROM knowledge_card_concepts").fetchall()
    assert loaded["ligas"] == len(rows) == sum(len(entry.concepts) for entry in links.values())
    assert db.execute("SELECT count(*) FROM knowledge_cards").fetchone()[0] == 108
    assert {(card_id, concept_id) for card_id, concept_id, _ in rows} == {
        (card_id, concept_id) for card_id, entry in links.items() for concept_id in entry.concepts
    }
    for card_id, concept_id, method in rows:
        proposed = concept_id in rule_links(cards[card_id], matcher)
        assert method == ("regla" if proposed else "manual"), (card_id, concept_id)
    assert {"regla", "manual"} == {method for _, _, method in rows}


def test_load_knowledge_twice_does_not_duplicate(db, loaded):
    again = load_knowledge(db)

    assert again == loaded
    assert db.execute("SELECT count(*) FROM knowledge_cards").fetchone()[0] == 108
    assert db.execute("SELECT count(*) FROM knowledge_card_concepts").fetchone()[0] == loaded["ligas"]


def test_card_removed_from_file_leaves_the_base(db, loaded, tmp_path):
    cards = read_cards()
    kept = [cards[0], cards[7]]  # supermercado-01 (verduras) y supermercado-08 (verduras)
    cards_path = tmp_path / "cards.json"
    cards_path.write_text(json.dumps(kept), encoding="utf-8")

    result = load_knowledge(db, cards_path=cards_path)

    assert result["tarjetas"] == 2
    assert [row[0] for row in db.execute("SELECT card_id FROM knowledge_cards ORDER BY position")] == [
        cards[0]["id"],
        cards[7]["id"],
    ]
    left = {row[0] for row in db.execute("SELECT DISTINCT card_id FROM knowledge_card_concepts")}
    assert left == {cards[0]["id"], cards[7]["id"]}


def test_reordering_cards_does_not_trip_over_positions(db, loaded, tmp_path):
    cards_path = tmp_path / "cards.json"
    cards_path.write_text(json.dumps(list(reversed(read_cards()))), encoding="utf-8")

    load_knowledge(db, cards_path=cards_path)

    assert list_cards(db)[0]["id"] == "viajes-12"


def test_load_knowledge_asks_for_the_concepts_first(db):
    with pytest.raises(ValueError, match="rappi-ia concepts"):
        load_knowledge(db)


def test_load_knowledge_needs_a_reviewed_entry_per_card(db, loaded, tmp_path):
    links_path = tmp_path / "links.toml"
    links_path.write_text('[cards.supermercado-01]\nconcepts = ["verduras"]\n', encoding="utf-8")

    with pytest.raises(ValueError, match="supermercado-02"):
        load_knowledge(db, links_path=links_path)


def test_list_cards_keeps_file_order_and_shape(db, loaded):
    cards = list_cards(db)

    assert [c["id"] for c in cards] == [c["id"] for c in read_cards()]
    fact = next(c for c in cards if c["kind"] == "dato")
    question = next(c for c in cards if c["kind"] == "pregunta")
    assert "question" not in fact and "options" not in fact and "answer" not in fact
    assert "title" not in question and "text" not in question
    assert fact["concepts"] == ["verduras"] and fact["id"] == "supermercado-01"
    assert question["options"] and question["answer"] in {0, 1, 2}
    assert all(isinstance(c["concepts"], list) and c["concepts"] == sorted(c["concepts"]) for c in cards)
    originals = {c["id"]: c for c in read_cards()}
    for card in cards:
        assert {k: v for k, v in card.items() if k != "concepts"} == originals[card["id"]]


def test_list_cards_by_vertical(db, loaded):
    assert {c["vertical"] for c in list_cards(db, "licores")} == {"licores"}
    assert len(list_cards(db, "licores")) == 12
    assert all(len(list_cards(db, vertical)) == 12 for vertical in GAME_VERTICALS)
    assert list_cards(db, "no-existe") == []


def test_seed_demo_loads_cards_and_relations(db):
    from rappi_ia.demo.seed import seed_demo

    seed_demo(db)

    assert db.execute("SELECT count(*) FROM knowledge_cards").fetchone()[0] == 108
    relations = {row[0] for row in db.execute("SELECT DISTINCT relation FROM knowledge_edges")}
    assert {"sustituye", "conflicto"} <= relations
