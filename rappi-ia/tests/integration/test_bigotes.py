"""Conducta de Bigotes (docs/diseno-ia.md §4) contra `rappi_ia_test`, con el modelo falso de embeddings."""

import pytest
from rappi_scraper.storage.search import build_search_documents

from conftest import add_dish, add_price, add_product, add_store
from rappi_ia.agent.bigotes import Bigotes, Context
from rappi_ia.concepts.pipeline import build_concepts
from rappi_ia.embeddings.base import HashEmbedder
from rappi_ia.embeddings.text_store import embed_search_documents


@pytest.fixture
def bigotes(db):
    add_store(db, 1, "supermercado", "Súper")
    add_store(db, 2, "licores", "Botillería")
    add_store(db, 3, "restaurantes", "Pizzería")
    products = [
        (100, "Papas fritas Lays Clásicas 180 g", 1, "Snacks salados", 1990),
        (101, "Pizza congelada pepperoni", 1, "Pizas y tartas saladas", 3990),
        (200, "Cerveza Escudo Lata 470 cc", 2, "Cervezas", 1290),
        (201, "Cerveza Kunstmann Torobayo 330 cc", 2, "Cervezas", 2990),
        (202, "Cigarrillos Marlboro Rojo 20 u", 2, "Cigarrillos", 5500),
    ]
    for pid, name, store, category, price in products:
        add_product(db, pid, name, store, category)
        add_price(db, store, pid, price)
    add_dish(db, 500, "Pizza pepperoni familiar", 3, "Pizzas", ["Pizzas"])
    db.execute("INSERT INTO scrape_runs (run_id, kind, status) VALUES (999, 'restaurants', 'done')")
    db.execute("INSERT INTO menu_price_snapshots (run_id, item_id, price) VALUES (999, 500, 8990)")
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    embedder = HashEmbedder()
    embed_search_documents(db, embedder)
    return Bigotes(embedder), db


def test_greeting_does_not_hide_the_request_and_suggests_cross_vertical(bigotes):
    agent, db = bigotes
    r = agent.reply(db, "hola, quiero cerveza", Context(vertical="licores"))

    assert r["intent"]["kind"] == "buscar" and r["vertical"] == "licores"
    assert {p["concept"] for p in r["products"]} == {"cerveza"}
    assert all(p["price"].startswith("$") for p in r["products"])  # precios vigentes por SQL
    assert r["age_notice"] and "mayores de 18" in r["text"]
    assert r["suggestion"]["vertical"] == "supermercado"  # de otra tienda
    assert r["suggestion"]["concept"] == "snacks-salados"
    assert r["reason"] == r["suggestion"]["reason"] == "Porque llevas 🍺 cerveza"


def test_no_cross_suggestion_in_rappi_hoy_mode_or_when_topic_already_shown(bigotes):
    agent, db = bigotes
    assert "suggestion" not in agent.reply(db, "cerveza", Context(vertical="licores", mode="actual"))
    shown = Context(vertical="licores", shown_topics=["snacks-salados"])
    assert "suggestion" not in agent.reply(db, "cerveza", shown)


def test_tobacco_only_when_asked_by_name(bigotes):
    agent, db = bigotes
    carrete = agent.reply(db, "algo para el carrete", Context(vertical="licores"))
    assert "cigarrillos" not in {p["concept"] for p in carrete["products"]}
    asked = agent.reply(db, "cigarrillos marlboro", Context(vertical="licores"))
    assert [p["concept"] for p in asked["products"]] == ["cigarrillos"]
    assert "suggestion" not in asked  # un concepto sensible nunca es origen de una sugerencia


def test_price_filter_and_cheapest_alternative(bigotes):
    agent, db = bigotes
    cheap = agent.reply(db, "cerveza bajo 2 mil", Context(vertical="licores"))
    assert [p["entity_id"] for p in cheap["products"]] == ["200"]
    none = agent.reply(db, "cerveza bajo 500", Context(vertical="licores"))
    assert none["products"] == [] and "$1.290" in none["text"] and not none["unmet"]


def test_ambiguous_between_restaurant_and_store_asks(bigotes):
    agent, db = bigotes
    r = agent.reply(db, "quiero pizza")
    assert r["intent"]["kind"] == "aclarar"
    assert {a["vertical"] for a in r["actions"]} == {"restaurantes", "supermercado"}
    assert r["text"].startswith("¿🍕 Pizza")


def test_unmet_demand_is_flagged_and_said(bigotes):
    agent, db = bigotes
    r = agent.reply(db, "kebab mixto", Context(vertical="restaurantes"))
    assert r["unmet"] and r["products"] == []
    assert "No encontré" in r["text"] and "Lo anoté" in r["text"]


def test_greeting_mentions_only_non_sensitive_interests(bigotes):
    agent, db = bigotes
    hello = agent.reply(db, "hola", Context(profile={"cerveza": 3.0, "cigarrillos": 9.0}))
    assert "cerveza" in hello["text"] and "cigarrillo" not in hello["text"].lower()
    assert "Veo que" not in agent.reply(db, "hola", Context(profile={"cigarrillos": 9.0}))["text"]


def test_explicit_request_wins_over_occasion(bigotes):
    agent, db = bigotes
    r = agent.reply(db, "cervezas y papas fritas para el carrete", Context(vertical="licores"))
    assert r["intent"]["kind"] == "ocasion" and r["intent"]["occasion"] == "carrete"
    assert set(r["intent"]["concepts"]) == {"cerveza", "snacks-salados"}
    assert {p["concept"] for p in r["products"]} <= {"cerveza", "snacks-salados"}


def test_symptoms_never_bring_medicines_but_add_pharmacy_notice(bigotes):
    agent, db = bigotes
    r = agent.reply(db, "tengo fiebre", Context(vertical="supermercado"))
    assert "medicamentos" not in {p["concept"] for p in r["products"]}
    assert "químico farmacéutico" in r["text"]


def test_age_notice_covers_the_cross_suggestion(bigotes):
    agent, db = bigotes
    r = agent.reply(db, "pizza", Context(vertical="restaurantes"))
    assert r["suggestion"]["concept"] == "cerveza"
    assert r["age_notice"] and "mayores de 18" in r["text"]


def test_unmet_is_recorded_even_with_a_price_cap(bigotes):
    agent, db = bigotes
    r = agent.reply(db, "kebab bajo 10 mil", Context(vertical="restaurantes"))
    assert r["unmet"] and "Lo anoté" in r["text"]
