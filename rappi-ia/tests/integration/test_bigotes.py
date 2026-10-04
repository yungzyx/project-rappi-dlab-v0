"""Conducta de Bigotes (docs/diseno-ia.md §4) contra `rappi_ia_test`, con el modelo falso de embeddings."""

from types import SimpleNamespace

import pytest
from rappi_scraper.storage.search import build_search_documents

from conftest import add_dish, add_price, add_product, add_store
from rappi_ia.agent import verticals
from rappi_ia.agent.bigotes import Bigotes, Context
from rappi_ia.agent.tools import search_products
from rappi_ia.agent.verticals import ranked_verticals
from rappi_ia.concepts.pipeline import build_concepts
from rappi_ia.embeddings.base import HashEmbedder
from rappi_ia.embeddings.text_store import embed_search_documents
from rappi_ia.retrieval import hybrid


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


def test_price_cap_never_shows_another_concept(bigotes):
    """Con tope, lo que cabe bajo el tope era otra cosa (vasos, chocolates) y se mostraba con «Porque llevas
    cerveza»; el «no hay bajo $X, el más barato cuesta $Y» nunca se alcanzaba."""
    agent, db = bigotes
    for pid, name, category, price in [
        (210, "Vasos Plásticos Desechables 10 u", "Vajilla desechable", 250),
        (211, "Chocolate Trencito 25 g", "Chocolates", 300),
    ]:
        add_product(db, pid, name, 2, category)
        add_price(db, 2, pid, price)
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    embed_search_documents(db, agent.embedder)

    r = agent.reply(db, "cerveza bajo 500", Context(vertical="licores"))

    assert r["products"] == [] and "suggestion" not in r
    assert "No encontré" in r["text"] and "$1.290" in r["text"] and not r["unmet"]


def test_cheapest_without_the_cap_is_also_of_the_requested_concept(bigotes):
    """Sin tope, el súper no trae cervezas entre sus resultados (un vaso calza la palabra y no es «sin resultado»):
    «el más barato» no puede ser otra cosa, como las papas fritas a $1.990."""
    agent, db = bigotes
    add_product(db, 220, "Vaso Schop Vidrio 500 ml", 1, "Vajilla")
    add_price(db, 1, 220, 2500)
    db.execute("UPDATE catalog_items SET description = 'Ideal para servir cerveza' WHERE master_product_id = 220")
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    embed_search_documents(db, agent.embedder)

    r = agent.reply(db, "cerveza bajo 500", Context(vertical="supermercado"))

    assert r["vertical"] == "supermercado" and r["intent"]["concepts"] == ["cerveza"]
    assert r["products"] == [] and not r["unmet"]
    assert "más barato" not in r["text"] and "$1.990" not in r["text"]


def test_unmet_by_cosine_shows_nothing_and_is_recorded(bigotes, monkeypatch):
    """Sin concepto nombrado, «sin resultado» lo decide el coseno bajo τ: antes se mostraban sus vecinos igual
    (arena para gato a quien pedía un pasaje de avión) y la demanda no se anotaba."""
    agent, db = bigotes
    monkeypatch.setattr(hybrid, "thresholds", lambda: {"supermercado": 0.99})

    r = agent.reply(db, "pasaje de avión a punta arenas", Context(vertical="supermercado"))

    assert r["intent"]["concepts"] == []
    assert r["products"] == [] and r["unmet"] and "τ" in r["unmet_reason"]
    assert "Lo anoté" in r["text"]


def test_a_query_without_words_to_search_is_not_recorded_as_unmet(bigotes, monkeypatch):
    """«té» es stopword: la regla léxica estricta nunca puede confirmarlo y, sin concepto nombrado, solo quedaba el
    coseno bajo τ. Express y Licores respondían «No encontré «té»… Lo anoté» teniendo decenas de tés."""
    agent, db = bigotes
    add_product(db, 820, "Té Supremo Canela 20 bolsitas", 1, "Té e infusiones")
    add_price(db, 1, 820, 1990)
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    embed_search_documents(db, agent.embedder)
    monkeypatch.setattr(hybrid, "thresholds", lambda: {"supermercado": 0.99})

    r = agent.reply(db, "té", Context(vertical="supermercado"))

    assert r["intent"]["concepts"] == []
    assert not r["unmet"] and r["products"] and "Lo anoté" not in r["text"]


def test_symptoms_are_not_recorded_as_unmet_demand(bigotes, monkeypatch):
    """Por síntomas no se ofrecen medicamentos (regla 6d): no mostrarlos no es falta de surtido. «tengo tos» en
    farmacia quedaba anotado como demanda no satisfecha por el coseno bajo τ."""
    agent, db = bigotes
    monkeypatch.setattr(hybrid, "thresholds", lambda: {"supermercado": 0.99})

    r = agent.reply(db, "tengo tos", Context(vertical="supermercado"))

    assert "químico farmacéutico" in r["text"]  # habló de síntomas
    assert not r["unmet"] and "Lo anoté" not in r["text"]


def test_conditioner_finds_conditioners_and_soap_finds_soap(bigotes):
    """El concepto de la consulta sale de las keywords y el del producto de su categoría: si no coinciden
    («acondicionador» era keyword de higiene-personal y los acondicionadores están en cuidado-cabello), el foco se
    quedaba con el jabón. Se arregla en la taxonomía, no cediendo el foco ante las palabras."""
    agent, db = bigotes
    for pid, name, category in [
        (800, "Acondicionador Sedal Ceramidas 340 ml", "Acondicionador"),
        (801, "Acondicionador Pantene Rizos Definidos 400 ml", "Acondicionador"),
        (802, "Jabón Líquido Dove Original 250 ml", "Jabones y exfoliantes corporales"),
    ]:
        add_product(db, pid, name, 1, category)
        add_price(db, 1, pid, 2990)
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    embed_search_documents(db, agent.embedder)

    outcome = search_products(db, "supermercado", "acondicionador", None, agent.embedder)

    assert outcome.result.query_concepts == ["cuidado-cabello"]
    assert {p.entity_id for p in outcome.products} == {"800", "801"}
    soap = search_products(db, "supermercado", "jabón", None, agent.embedder)
    assert [p.entity_id for p in soap.products] == ["802"]


def test_chance_word_matches_do_not_replace_the_concept_of_the_query(bigotes):
    """La coincidencia estricta mira todo el texto (descripción y categoría incluidas) y el stemming junta palabras
    (flores/flor, perfume/perfuma): si el foco cedía ante esa mayoría, «flores» mostraba azúcar flor y ron Flor de
    Caña, y «perfume» un suavizante y un limpiapisos que «perfuman»."""
    agent, db = bigotes
    for pid, name, category, description in [
        (810, "Ramo de Rosas Rojas 12 u", "Regalos", None),
        (811, "Azúcar Flor Iansa 1 kg", "Azúcar y endulzantes", None),
        (812, "Ron Flor de Caña 4 Años 750 ml", "Ron", None),
        (813, "Body Mist Bfresh Vainilla 250 ml", "Fragancias", None),
        (814, "Suavizante Downy Brisa 1 L", "Suavizantes", "Perfuma tu ropa por semanas"),
        (815, "Limpiapisos Excell Lavanda 900 ml", "Limpiapisos", "Perfuma tu hogar"),
    ]:
        add_product(db, pid, name, 1, category)
        add_price(db, 1, pid, 2990)
        if description:
            db.execute("UPDATE catalog_items SET description = %s WHERE master_product_id = %s", (description, pid))
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    embed_search_documents(db, agent.embedder)

    flowers = search_products(db, "supermercado", "flores", None, agent.embedder)
    perfume = search_products(db, "supermercado", "perfume", None, agent.embedder)

    assert flowers.result.query_concepts == ["flores-regalos"]
    assert [p.entity_id for p in flowers.products] == ["810"]
    assert perfume.result.query_concepts == ["fragancias"]
    assert [p.entity_id for p in perfume.products] == ["813"]


def test_filler_prices_are_never_shown(bigotes):
    """$0 y $1 son precios de relleno de platos que dependen de sus opciones: pasaban cualquier tope y se ofrecían
    a «$0»."""
    agent, db = bigotes
    for item_id, name, price in [
        (530, "Completo Dinámico", 0),
        (531, "Completo Elige Tu Salsa", 1),
        (532, "Completo Italiano", 900),
    ]:
        add_dish(db, item_id, name, 3, "Completos")
        db.execute("INSERT INTO menu_price_snapshots (run_id, item_id, price) VALUES (999, %s, %s)", (item_id, price))
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    embed_search_documents(db, agent.embedder)

    capped = search_products(db, "restaurantes", "completo", None, agent.embedder, price_max=1000)
    assert [p.entity_id for p in capped.products] == ["532"]
    shown = [p.entity_id for p in search_products(db, "restaurantes", "completo", None, agent.embedder).products]
    assert "532" in shown and not {"530", "531"} & set(shown)


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


def test_symptoms_starting_with_me_get_the_pharmacy_notice_and_no_painkillers(bigotes):
    """«me duele la cabeza» se limpiaba a «duele la cabeza» antes de buscar el síntoma: sin aviso de farmacia y con
    un analgésico que calzaba la palabra «cabeza»."""
    agent, db = bigotes
    add_product(db, 710, "Anacin Max Dolor de Cabeza X 8 Comprimidos", 1, "Analgésicos sistémicos")
    add_price(db, 1, 710, 2600)
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    embed_search_documents(db, agent.embedder)

    r = agent.reply(db, "me duele la cabeza", Context(vertical="supermercado"))

    assert r["intent"]["occasion"] == "enfermo"
    assert "químico farmacéutico" in r["text"]
    assert "710" not in [p["entity_id"] for p in r["products"]]


def test_unlabeled_medicines_are_never_shown_for_symptoms_or_in_pharmacy(bigotes, monkeypatch):
    """El filtro de sensibles miraba solo el concepto: un medicamento sin concepto (su categoría, «Analgésicos
    sistémicos», no está en category_map.csv) pasaba siempre. «tengo tos» mostraba antitusivos y «me siento mal»,
    laxantes, traídos por cercanía. Con síntomas, o en farmacia, lo que no tiene concepto no se muestra."""
    agent, db = bigotes
    add_store(db, 11, "farmacia", "Farmacia")
    for pid, name, store, category in [
        (710, "Anacin Max Dolor de Cabeza y Tos X 8 Comprimidos", 1, "Analgésicos sistémicos"),
        (711, "Anacin Clásico Nivea X 8 Comprimidos", 11, "Analgésicos sistémicos"),
        (712, "Crema de Manos Nivea 75 ml", 11, "Cremas de manos"),
    ]:
        add_product(db, pid, name, store, category)
        add_price(db, store, pid, 2600)
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    embed_search_documents(db, agent.embedder)
    monkeypatch.setattr(hybrid, "thresholds", lambda: {"supermercado": 0.0, "farmacia": 0.0})  # sin «sin resultado»

    for text in ["tengo tos", "me duele la cabeza"]:
        r = agent.reply(db, text, Context(vertical="supermercado"))
        assert "710" not in [p["entity_id"] for p in r["products"]], text
    shown = [p["entity_id"] for p in agent.reply(db, "nivea", Context(vertical="farmacia"))["products"]]
    assert "712" in shown and "711" not in shown


def test_a_photo_in_pharmacy_does_not_show_unlabeled_medicines(bigotes):
    """La foto filtraba sin `strict`: en farmacia mostraba analgésicos sin concepto (y ocultaba los del concepto
    medicamentos)."""
    agent, db = bigotes
    add_store(db, 11, "farmacia", "Farmacia")
    for pid, name, category in [
        (711, "Anacin Clásico X 8 Comprimidos", "Analgésicos sistémicos"),
        (712, "Crema de Manos Nivea 75 ml", "Cremas de manos"),
    ]:
        add_product(db, pid, name, 11, category)
        add_price(db, 11, pid, 2600)
    db.commit()
    build_search_documents(db)
    build_concepts(db)

    reading = SimpleNamespace(concept=None, probability=0.2)
    similar = [("farmacia", "catalog_item", "711", 0.9), ("farmacia", "catalog_item", "712", 0.8)]
    r = agent.reply_photo(db, reading, similar, Context(vertical="farmacia"))
    assert [p["entity_id"] for p in r["products"]] == ["712"]


def test_the_suggestion_reason_names_what_the_answer_shows_and_symptoms_get_none(bigotes):
    """En una ocasión, el origen de la sugerencia salía de todos sus conceptos: «regalo para mi polola» mostraba solo
    chocolates y decía «Porque llevas 🍷 vino». A quien tiene fiebre se le hacía venta cruzada («Porque llevas 🍎
    frutas», sin frutas en la respuesta), aunque con síntomas ni siquiera se muestra «También en»."""
    agent, db = bigotes
    add_store(db, 10, "chocolateria", "Chocolatería")
    for pid, name, store, category in [
        (600, "Chocolate Sahne-Nuss 250 g", 10, "Chocolates"),
        (620, "Queso Gouda Colún 250 g", 1, "Quesos"),
        (621, "Café Nescafé Tradición 170 g", 1, "Café"),
        (622, "Jugo Watts Naranja 1 L", 1, "Jugos"),
        (623, "Leche Colún Entera 1 L", 1, "Leches"),
    ]:
        add_product(db, pid, name, store, category)
        add_price(db, store, pid, 1990)
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    embed_search_documents(db, agent.embedder)

    gift = agent.reply(db, "regalo para mi polola", Context(vertical="chocolateria"))
    assert {p["concept"] for p in gift["products"]} == {"chocolates"}
    assert gift["suggestion"]["reason"] == "Porque llevas 🍫 chocolates"

    sick = agent.reply(db, "tengo fiebre", Context(vertical="supermercado"))
    assert sick["products"] and "suggestion" not in sick and sick["reason"] is None
    # Con un concepto nombrado que sí tiene complemento (el mismo que sugiere en el regalo), tampoco.
    sick = agent.reply(db, "tengo fiebre, quiero chocolate", Context(vertical="chocolateria"))
    assert {p["concept"] for p in sick["products"]} == {"chocolates"}
    assert "suggestion" not in sick and sick["reason"] is None


def test_age_notice_covers_the_cross_suggestion(bigotes):
    agent, db = bigotes
    r = agent.reply(db, "pizza", Context(vertical="restaurantes"))
    assert r["suggestion"]["concept"] == "cerveza"
    assert r["age_notice"] and "mayores de 18" in r["text"]


def test_unmet_is_recorded_even_with_a_price_cap(bigotes):
    agent, db = bigotes
    r = agent.reply(db, "kebab bajo 10 mil", Context(vertical="restaurantes"))
    assert r["unmet"] and "Lo anoté" in r["text"]


def test_occasion_picks_its_vertical_without_asking_about_its_first_concept(bigotes):
    """Antes el vertical salía solo del primer concepto de la ocasión: 'tengo hambre' preguntaba por pizza (o iba
    al súper) y un carrete iba adonde estuviera la cerveza aunque el resto de la ocasión estuviera en otro lado."""
    agent, db = bigotes
    hungry = agent.reply(db, "tengo hambre", Context())
    assert hungry["intent"]["kind"] == "ocasion" and hungry["vertical"] == "restaurantes"  # vertical fijo
    # Carrete: cerveza (2 en licores) va primero, pero snacks (3 en el súper) pesa más en el total de la ocasión.
    for pid, name in [(102, "Ramitas Evercrisp Queso 250 g"), (103, "Papas Kryzpo Original 130 g")]:
        add_product(db, pid, name, 1, "Snacks salados")
        add_price(db, 1, pid, 1590)
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    party = agent.reply(db, "arma un carrete", Context())
    assert party["intent"]["kind"] == "ocasion" and party["vertical"] == "supermercado"


@pytest.fixture
def pharmacy_bigotes(bigotes):
    """Farmacia con las categorías que esos productos tienen en la base (category_map.csv): «Antiácidos» y
    «Gotas, lubricantes y lágrimas» son medicamentos, «Lubricantes» es bienestar sexual."""
    agent, db = bigotes
    add_store(db, 11, "farmacia", "Farmacia")
    products = [
        (700, "Sal de Fruta Eno Limón 5 g", "Antiácidos"),
        (701, "Bentley Gel Lubricante Íntimo Ice 60 ml", "Lubricantes"),
        (702, "Systane Lubricante Ocular Ultra 10 ml", "Gotas, lubricantes y lágrimas"),
    ]
    for pid, name, category in products:
        add_product(db, pid, name, 11, category)
        add_price(db, 11, pid, 4990)
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    embed_search_documents(db, agent.embedder)
    return agent, db


def test_sensitive_concepts_are_found_when_asked_by_their_plain_name(pharmacy_bigotes):
    """«medicamentos» y «lubricante» no asignan productos, pero en la consulta nombran el concepto: sin él, los
    sensibles quedaban ocultos («necesito medicamentos» iba al súper y «lubricante» no encontraba nada)."""
    agent, db = pharmacy_bigotes
    medicines = agent.reply(db, "necesito medicamentos", Context())
    assert medicines["vertical"] == "farmacia"
    assert "700" in [p["entity_id"] for p in medicines["products"]]
    assert {p["concept"] for p in medicines["products"]} == {"medicamentos"}

    lube = agent.reply(db, "lubricante", Context(vertical="farmacia"))
    assert [p["entity_id"] for p in lube["products"]] == ["701"] and lube["age_notice"]
    eyes = agent.reply(db, "lubricante ocular", Context(vertical="farmacia"))
    assert eyes["products"][0]["entity_id"] == "702"
    assert "701" not in [p["entity_id"] for p in eyes["products"]]


def test_hunger_includes_roast_and_fried_chicken(bigotes):
    """Los conceptos de la ocasión son el foco de la búsqueda: desde que el pollo asado o frito es `pollo-preparado`
    (y no `pollo`), «tengo hambre» lo descartaba."""
    agent, db = bigotes
    add_dish(db, 520, "Pollo Asado Entero", 3, "Pollos")
    db.execute("INSERT INTO menu_price_snapshots (run_id, item_id, price) VALUES (999, 520, 9990)")
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    embed_search_documents(db, agent.embedder)
    r = agent.reply(db, "tengo hambre", Context())
    assert r["vertical"] == "restaurantes"
    assert "520" in [p["entity_id"] for p in r["products"]]


def test_concept_without_assortment_goes_to_its_group_vertical(bigotes):
    agent, db = bigotes
    r = agent.reply(db, "quiero sushi", Context())  # no hay sushi en ningún vertical
    assert r["vertical"] == "restaurantes" and r["unmet"]


@pytest.fixture
def volume_bigotes(bigotes):
    """Como en la base real: restaurantes tiene muchos más ítems de casi todo que las tiendas (cada local lista sus
    papas fritas y su schop), aunque en su catálogo esos conceptos pesen poco."""
    agent, db = bigotes
    add_store(db, 4, "restaurantes", "Sanguchería")
    dishes = [
        (501, "Papas fritas medianas"),
        (502, "Papas fritas grandes"),
        (503, "Papas fritas con queso"),
        (504, "Schop cerveza Escudo"),
        (505, "Cerveza Kunstmann lager"),
        (506, "Cerveza Austral calafate"),
        (507, "Hamburguesa clásica"),
        (508, "Hamburguesa doble queso"),
        (509, "Hamburguesa italiana"),
        (510, "Hamburguesa vegana"),
        (511, "Hamburguesa BBQ"),
        (512, "Hamburguesa con palta"),
        (513, "Hamburguesa con huevo"),
        (514, "Hamburguesa de pollo"),
        (515, "Hamburguesa de queso"),
        (516, "Hamburguesa americana"),
        (517, "Hamburguesa chilena"),
        (518, "Hamburguesa mexicana"),
        (519, "Hamburguesa ranchera"),
        (520, "Hamburguesa XL"),
    ]
    for item_id, name in dishes:
        add_dish(db, item_id, name, 4, "Carta", ["Hamburguesas"])
        db.execute("INSERT INTO menu_price_snapshots (run_id, item_id, price) VALUES (999, %s, 4990)", (item_id,))
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    embed_search_documents(db, agent.embedder)
    return agent, db


def test_cross_suggestion_goes_where_the_concept_is_typical_not_where_there_are_more_items(volume_bigotes):
    """Restaurantes tiene 3 papas fritas y el súper 1, pero en el súper los snacks son su catálogo y en el
    restaurante un acompañamiento: la sugerencia para la cerveza viene del súper."""
    agent, db = volume_bigotes
    r = agent.reply(db, "cerveza", Context(vertical="licores"))
    assert r["suggestion"]["concept"] == "snacks-salados"
    assert r["suggestion"]["vertical"] == "supermercado"


def test_store_products_asked_from_home_go_to_a_store_without_asking(volume_bigotes):
    """Hay más cervezas en restaurantes (3) que en Licores (2): antes preguntaba "¿restaurante o Licores?"."""
    agent, db = volume_bigotes
    r = agent.reply(db, "quiero cerveza", Context())
    assert r["intent"]["kind"] == "buscar"
    assert r["vertical"] == "licores"


def test_prepared_food_still_goes_to_restaurants(volume_bigotes):
    agent, db = volume_bigotes
    r = agent.reply(db, "una hamburguesa", Context())
    assert r["vertical"] == "restaurantes"
    assert {p["concept"] for p in r["products"]} == {"hamburguesa"}


def test_answer_shows_other_verticals_with_offer_and_real_stores(volume_bigotes, monkeypatch):
    """Multiverticalidad visible: la cerveza también está en el súper (y no se ofrece el restaurante, donde es
    un acompañamiento). Cada vertical trae sus tiendas: nombre y logo si el scraper lo guardó."""
    agent, db = volume_bigotes
    monkeypatch.setattr(verticals, "MIN_ITEMS_ELSEWHERE", 1)  # el catálogo de prueba es chico
    add_product(db, 300, "Cerveza Cristal Lata 470 cc", 1, "Cervezas")
    add_price(db, 1, 300, 990)
    db.commit()
    build_search_documents(db)
    build_concepts(db)

    r = agent.reply(db, "cerveza", Context(vertical="licores"))
    also = r["also_in"]
    assert also["concept"] == "cerveza"
    assert [v["vertical"] for v in also["verticals"]] == ["supermercado"]
    [super_] = also["verticals"]
    assert super_["prototype_vertical"] == "grocery" and super_["items"] == 1
    assert super_["stores"] == [{"name": "Súper", "logo": None}]


def test_other_verticals_also_when_the_current_one_has_nothing(bigotes, monkeypatch):
    """«También en» tomaba el concepto de los productos mostrados: justo cuando la vertical actual no tiene lo pedido
    («vodka» en farmacia) no decía dónde sí está."""
    agent, db = bigotes
    monkeypatch.setattr(verticals, "MIN_ITEMS_ELSEWHERE", 1)  # el catálogo de prueba es chico
    add_store(db, 11, "farmacia", "Farmacia")
    for pid, name, store, category in [
        (230, "Vodka Absolut Blue 750 ml", 2, "Vodka"),
        (720, "Sal de Fruta Eno Limón 5 g", 11, "Antiácidos"),
    ]:
        add_product(db, pid, name, store, category)
        add_price(db, store, pid, 9990)
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    embed_search_documents(db, agent.embedder)

    r = agent.reply(db, "vodka", Context(vertical="farmacia"))

    assert r["products"] == [] and r["intent"]["concepts"] == ["vodka"]
    assert r["also_in"]["concept"] == "vodka"
    assert [v["vertical"] for v in r["also_in"]["verticals"]] == ["licores"]


def test_no_other_verticals_for_sensitive_or_in_rappi_hoy(volume_bigotes):
    agent, db = volume_bigotes
    assert "also_in" not in agent.reply(db, "cigarrillos marlboro", Context(vertical="licores"))
    assert "also_in" not in agent.reply(db, "una hamburguesa", Context(mode="actual"))


def test_other_verticals_do_not_repeat_a_chain(volume_bigotes, monkeypatch):
    agent, db = volume_bigotes
    monkeypatch.setattr(verticals, "MIN_ITEMS_ELSEWHERE", 1)
    add_store(db, 5, "conveniencia", "Súper")  # la misma cadena también en Express
    add_store(db, 6, "conveniencia", "Minimarket")
    add_store(db, 7, "supermercado", "Almacén")
    for pid, store in [(300, 1), (301, 5), (302, 5), (303, 6), (304, 7)]:
        add_product(db, pid, f"Cerveza Cristal Lata {pid}", store, "Cervezas")
        add_price(db, store, pid, 990)
    db.commit()
    build_search_documents(db)
    build_concepts(db)

    also = {
        v["vertical"]: [s["name"] for s in v["stores"]]
        for v in agent.reply(db, "cerveza", Context(vertical="licores"))["also_in"]["verticals"]
    }
    assert also["conveniencia"] == ["Súper", "Minimarket"]
    assert also["supermercado"] == ["Almacén"]  # "Súper" ya salió en Express


def test_other_verticals_are_ordered_by_how_much_offer_they_have(volume_bigotes, monkeypatch):
    """Para "¿dónde más lo encuentro?" pesa la cantidad: una chocolatería con 1 cerveza (el 100% de su catálogo
    chico) no va antes que un súper con 2."""
    agent, db = volume_bigotes
    monkeypatch.setattr(verticals, "MIN_ITEMS_ELSEWHERE", 1)
    add_store(db, 8, "chocolateria", "Chocolatería")
    for pid, store in [(300, 1), (301, 1), (305, 8)]:
        add_product(db, pid, f"Cerveza Cristal Lata {pid}", store, "Cervezas")
        add_price(db, store, pid, 990)
    db.commit()
    build_search_documents(db)
    build_concepts(db)

    r = agent.reply(db, "cerveza", Context(vertical="licores"))
    assert [v["vertical"] for v in r["also_in"]["verticals"]] == ["supermercado", "chocolateria"]


def test_no_other_verticals_when_talking_about_symptoms(volume_bigotes, monkeypatch):
    """«malestar» y «cuidarme» son de la ocasión «Me siento mal» pero no de SYMPTOMS: sacaban Licores de la vertical,
    y aun así mostraban «También en» (con Licores) y no el aviso de farmacia."""
    agent, db = volume_bigotes
    monkeypatch.setattr(verticals, "MIN_ITEMS_ELSEWHERE", 1)
    add_store(db, 9, "conveniencia", "Express")
    for pid, store in [(400, 1), (401, 9)]:
        add_product(db, pid, f"Jugo Watts Naranja {pid}", store, "Jugos")
        add_price(db, store, pid, 1290)
    db.commit()
    build_search_documents(db)
    build_concepts(db)

    assert "also_in" in agent.reply(db, "jugo de naranja", Context(vertical="supermercado"))
    for text in ["tengo fiebre, quiero jugo", "malestar", "algo para cuidarme"]:
        sick = agent.reply(db, text, Context(vertical="supermercado"))
        assert sick["products"] and "also_in" not in sick, text
        assert "químico farmacéutico" in sick["text"], text


# Ítems con concepto por vertical en la base real (03-10): restaurantes es unas 5 veces el súper.
REAL_TOTALS = {
    "chocolateria": 1145,
    "turbo": 2562,
    "licores": 5734,
    "farmacia": 6141,
    "conveniencia": 9220,
    "supermercado": 32441,
    "mall": 35398,
    "restaurantes": 168668,
}


def _assortment(db, rows, totals=REAL_TOTALS):
    """Cambia el surtido materializado por cifras dadas (las de la base real no caben en un fixture). El resto de
    cada vertical va a un concepto de relleno, que cuenta en el total pero no existe en la taxonomía."""
    db.execute("DROP MATERIALIZED VIEW concept_assortment")
    db.execute("CREATE TABLE concept_assortment (concept_id text, vertical text, items integer)")
    used = {v: sum(n for _, vertical, n in rows if vertical == v) for v in totals}
    with db.cursor() as cur:
        cur.executemany(
            "INSERT INTO concept_assortment VALUES (%s, %s, %s)",
            [*rows, *(("relleno", v, totals[v] - used[v]) for v in totals)],
        )


def test_a_small_vertical_needs_enough_offer_to_be_chosen(bigotes):
    """Por participación, una vertical chica ganaba con un puñado de productos: «pan» iba a chocolaterías (46 de sus
    1.145 ítems) con 431 en el súper, y «quiero pastas» mostraba lasañas de una pastelería."""
    agent, db = bigotes
    _assortment(
        db,
        [("panaderia", "chocolateria", 10), ("panaderia", "supermercado", 150)],
        {"chocolateria": 200, "supermercado": 10_000},
    )
    assert ranked_verticals(db, ["panaderia"]) == ["supermercado", "chocolateria"]

    db.rollback()
    _assortment(
        db,
        [
            ("panaderia", "chocolateria", 46),
            ("panaderia", "conveniencia", 180),
            ("panaderia", "turbo", 36),
            ("panaderia", "supermercado", 431),
        ],
    )
    assert agent.reply(db, "pan", Context())["vertical"] == "conveniencia"
    assert verticals.typical_verticals(db)["panaderia"] == "conveniencia"
    # La lista sigue completa (la sugerencia y «También en» buscan también en las demás).
    assert set(ranked_verticals(db, ["panaderia"])) == {"chocolateria", "conveniencia", "turbo", "supermercado"}


def test_a_sick_person_is_never_sent_to_a_liquor_store(bigotes):
    """En Licores el jugo pesa más que en el súper (es para mezclar): «tengo fiebre, quiero jugo» iba a una
    botillería."""
    agent, db = bigotes
    _assortment(
        db,
        [
            ("jugos", "licores", 182),
            ("jugos", "turbo", 69),
            ("jugos", "conveniencia", 187),
            ("jugos", "supermercado", 421),
            ("jugos", "farmacia", 28),
        ],
    )
    intent = agent.understander.understand(db, "tengo fiebre, quiero jugo")
    assert intent.symptom and intent.concepts == ["jugos"]
    assert intent.vertical != "licores"


def test_a_gift_is_not_sent_to_a_liquor_store(bigotes):
    """En una ocasión se suman conceptos muy distintos y el piso de masa lo fija la tienda con más oferta de
    cualquiera: en «regalo», los juguetes y joyas del Mall dejaban fuera a las chocolaterías (419 chocolates) y un
    regalo pedido desde el inicio iba a Licores, con vinos y espumantes y el aviso +18."""
    agent, db = bigotes
    _assortment(
        db,
        [
            ("chocolates", "chocolateria", 419),
            ("vino", "licores", 801),
            ("espumante", "licores", 178),
            ("chocolates", "licores", 147),
            ("juguetes-infantiles", "mall", 1822),
            ("joyeria", "mall", 1423),
            ("fragancias", "mall", 514),
            ("chocolates", "mall", 153),
            ("flores-regalos", "mall", 153),
            ("chocolates", "supermercado", 936),
            ("juguetes-infantiles", "supermercado", 330),
            ("fragancias", "supermercado", 303),
            ("vino", "supermercado", 267),
        ],
    )
    intent = agent.understander.understand(db, "regalo para mi polola")
    assert intent.occasion == "regalo"
    assert intent.vertical == "chocolateria"


def test_ambiguity_is_measured_with_the_same_share_that_ranks(bigotes):
    """La vertical se elige por participación, pero la ambigüedad se medía con conteos: con restaurantes 5 veces más
    grande, ningún concepto llegaba al umbral (0 de 112) y «aclarar» no salía nunca. Cifras de la base real."""
    agent, db = bigotes
    _assortment(
        db,
        [
            ("platos-listos", "restaurantes", 3024),
            ("platos-listos", "supermercado", 463),
            ("platos-listos", "conveniencia", 89),
            ("platos-listos", "turbo", 23),
            ("platos-listos", "chocolateria", 14),
            ("pizza", "restaurantes", 11361),
            ("pizza", "supermercado", 167),
            ("pizza", "conveniencia", 35),
            ("pizza", "chocolateria", 10),
            ("latina", "restaurantes", 900),
            ("latina", "chocolateria", 10),
        ],
    )
    ready = agent.understander.understand(db, "platos listos")
    assert ready.concepts == ["platos-listos"]
    assert ready.kind == "aclarar" and set(ready.options) == {"restaurantes", "supermercado"}
    assert agent.understander.understand(db, "quiero pizza").vertical == "restaurantes"  # 6,7 % frente a 0,5 %
    # 10 platos latinos en chocolaterías pesan casi lo mismo que en restaurantes, pero no compiten: no se pregunta.
    assert agent.understander.understand(db, "comida latina").kind == "buscar"


def test_packaged_sweets_are_not_offered_from_restaurants(bigotes):
    agent, db = bigotes
    add_store(db, 10, "chocolateria", "Chocolatería")
    for pid, store in [(600, 10), (601, 10)]:
        add_product(db, pid, f"Chocolate Sahne-Nuss {pid} g", store, "Chocolates")
        add_price(db, store, pid, 1990)
    for item_id in (610, 611, 612):
        add_dish(db, item_id, f"Chocolate caliente con barra {item_id}", 3, "Postres", ["Café"])
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    assert ranked_verticals(db, ["chocolates"]) == ["chocolateria"]
