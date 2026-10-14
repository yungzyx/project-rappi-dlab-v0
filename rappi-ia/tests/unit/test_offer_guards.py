"""Las guardias de ofertas: lo que Mochi nunca propone por su cuenta (rappi_ia/offers/guards.py)."""

import pytest

from rappi_ia.catalog.stores import NOT_PUSHED_SUBVERTICALS
from rappi_ia.concepts.taxonomy import load_taxonomy
from rappi_ia.demo.seed import DEMO_VERTICALS
from rappi_ia.offers.guards import (
    ALCOHOL_NAME_WORDS,
    MENU_ALCOHOL_NAME_WORDS,
    NOT_PLANNABLE_OCCASIONS,
    OFFER_BLOCKED_VERTICALS,
    alcohol_in_name,
    alcohol_section,
    baby_in_name,
    is_offerable,
    is_plannable,
    offerable_vertical,
    plannable_occasion,
    plannable_vertical,
    unofferable_subverticals,
)


def concept(concept_id: str):
    return load_taxonomy().concepts[concept_id]


def test_alcohol_baby_health_and_sensitive_concepts_are_not_offerable():
    # alcohol, bebé, farmacia (sensible) y bienestar sexual (sensible y +18)
    for concept_id in ("cerveza", "vino", "panales", "medicamentos", "bienestar-sexual"):
        assert not is_offerable(concept(concept_id)), concept_id


def test_every_concept_of_the_blocked_groups_is_blocked():
    """Un concepto nuevo de alcohol, bebé, salud, tabaco o bienestar sexual queda bloqueado sin tocar las guardias."""
    blocked_groups = {"alcohol", "bebe", "salud", "tabaco", "adultos"}
    members = [c for c in load_taxonomy().concepts.values() if c.parent in blocked_groups]
    assert {c.parent for c in members} == blocked_groups
    assert [c.id for c in members if is_offerable(c)] == []


def test_the_whole_health_group_is_blocked_even_when_the_concept_itself_is_harmless():
    # «Farmacia y cuidado personal»: vitaminas, higiene y dermocosmética no son sensibles, pero son salud.
    for concept_id in ("vitaminas", "dermocosmetica", "higiene-personal", "cuidado-oral", "alimentacion-bebe"):
        assert not concept(concept_id).sensitive and not concept(concept_id).age_restricted
        assert not is_offerable(concept(concept_id)), concept_id


def test_flags_block_a_concept_whatever_its_group():
    taxonomy = load_taxonomy()
    for flagged in (c for c in taxonomy.concepts.values() if c.sensitive or c.age_restricted):
        assert not is_offerable(flagged), flagged.id


def test_everyday_concepts_are_offerable():
    for concept_id in ("pizza", "snacks-salados", "gaseosas", "chocolates", "hielo", "ropa", "golosinas"):
        assert is_offerable(concept(concept_id)), concept_id


def test_pharmacy_and_licores_are_the_only_blocked_verticals():
    assert OFFER_BLOCKED_VERTICALS == ("farmacia", "licores")
    assert {v for v in DEMO_VERTICALS if not offerable_vertical(v)} == {"farmacia", "licores"}


def test_stores_labelled_pharmacy_sex_shop_or_smoking_shop_are_the_ones_stage_2_does_not_push():
    # Se reutiliza la lista de catalog/stores.py: no hay otra copia que se pueda desalinear.
    assert unofferable_subverticals() == list(NOT_PUSHED_SUBVERTICALS)
    assert {"Farmacia", "Sex shop", "Smoking shop"} <= set(unofferable_subverticals())


def test_a_chosen_occasions_kit_may_have_alcohol_but_never_sensitive_baby_or_health():
    for concept_id in ("cerveza", "vino", "pisco", "pizza", "hielo"):
        assert is_plannable(concept(concept_id)), concept_id
    for concept_id in ("panales", "medicamentos", "vitaminas", "bienestar-sexual", "alimentacion-bebe"):
        assert not is_plannable(concept(concept_id)), concept_id
    taxonomy = load_taxonomy()
    assert all(is_plannable(c) for c in taxonomy.concepts.values() if c.age_restricted and not c.sensitive)


def test_baby_and_sick_occasions_are_not_planned():
    taxonomy = load_taxonomy()
    assert NOT_PLANNABLE_OCCASIONS == ("guagua", "enfermo")
    assert {o.id for o in taxonomy.occasions.values() if not plannable_occasion(o)} == {"guagua", "enfermo"}


def test_a_kit_never_comes_from_pharmacy_and_only_alcohol_comes_from_licores():
    for concept_id in ("cerveza", "pizza"):
        assert not plannable_vertical("farmacia", concept(concept_id))
    assert plannable_vertical("licores", concept("cerveza")) and plannable_vertical("licores", concept("vino"))
    assert not plannable_vertical("licores", concept("gaseosas"))
    for vertical in ("supermercado", "conveniencia", "turbo", "mall", "chocolateria", "restaurantes"):
        assert plannable_vertical(vertical, concept("cerveza")) and plannable_vertical(vertical, concept("pizza"))


@pytest.mark.parametrize(
    "name",
    [
        "Soju Uva Verde 13.0",  # en la base real: categoría «Frutas», sin marca de alcohol ni +18
        "Patagonia Cerveza Red Lager Austral",  # en «frutas»
        "3R Pisco 35 + Coca-Cola Gaseosa + Hielo Líquidos",  # en «gaseosas»
        "Viejo de Caldas Ron",  # en «decoracion»
        "Toreto Vino Tinto Cabernet Sauvignon Gran Reserva",  # en «utiles»
        "Gin Santos + 2 Red Bull Yellow + Sprite Zero 1.5lts + Hielo 2kg",
        "Makgeolli Original 750 ml",
        "Umeshu Choya 500 ml",
        "Sake Gekkeikan 750 ml",
        "Pack Cervezas Kunstmann",  # el plural también
        "Licores Mistral Surtidos",
    ],
)
def test_a_catalog_name_that_says_alcohol_is_never_offered(name):
    """Las marcas de la tienda (`is_alcoholic`, `age_restricted`) y la categoría pueden estar mal; el nombre lo dice."""
    assert alcohol_in_name("catalog_item", name)


@pytest.mark.parametrize(
    ("entity_type", "name"),
    [
        ("catalog_item", "Ronda de quesos"),  # «ron» es palabra entera: ni «ronda» ni «roncito»
        ("catalog_item", "Roncito Chocolate"),
        ("catalog_item", "Ginger Ale 350 ml"),  # «gin» tampoco está en «ginger»
        ("menu_item", "Sake Roll"),  # en un menú «sake» es salmón: la lista de los platos no lo tiene
        ("menu_item", "Sake Nigiri 2 piezas"),
        ("menu_item", "Margarita pizza"),  # la margarita de una pizza no es el cóctel
        ("menu_item", "Pizza Margarita Familiar"),
        ("menu_item", "Pizzas margarita x 2"),
        ("menu_item", "Ginger roll"),
        ("menu_item", "Ronda de empanadas"),
        ("store", "Cervecería del Centro"),  # solo productos y platos
        # Nombres reales que dicen una palabra de trago sin serlo.
        ("menu_item", "Sour Cream"),
        ("menu_item", "Papas fritas sour cream"),
        ("menu_item", "Sweet And Sour Roll"),
        ("menu_item", "Papas Sour"),
        ("menu_item", "Sopa Hot Sour"),
        ("menu_item", "Hamburguesa la Corona"),
        ("menu_item", "La corona de Juana"),
        ("menu_item", "Corona Sacra"),  # quesadillas
        ("menu_item", "Pizza stella mediana"),
        ("menu_item", "Merluza Austral"),  # «austral» no es la cerveza: 47 platos de merluza
        ("menu_item", "Iced Latte Cristal"),
        ("menu_item", "Negroni / Salame Milano Laminado 100 G"),
        # Una piña colada sin alcohol: jugo, batido, té de burbujas o helado (en la base real, 10 de 27).
        ("menu_item", "Jugo Piña Colada 500 ml"),
        ("menu_item", "Piña colada sin alcohol"),
        ("menu_item", "Piña Colada Virgin"),
        ("menu_item", "Milkshake Piña Colada"),
        ("menu_item", "Shakes de Piña Colada"),
        ("menu_item", "Piña Colada Tea"),
        ("menu_item", "Helado Piña Colada"),
        # «mimosa» no está en la lista: en la base real solo hay dos y son sin alcohol (un jugo y «Sin Alcohol»).
        ("menu_item", "Mimosa"),
        ("menu_item", "Mimosa Sabores"),
    ],
)
def test_words_that_only_look_like_alcohol_are_not_blocked(entity_type, name):
    assert not alcohol_in_name(entity_type, name)


@pytest.mark.parametrize(
    ("name", "concept"),
    [
        ("Margarita Familiar", "pizza"),
        ("Tako Sour", "sushi"),  # un roll
        ("Ceviche Sour", "pescados-mariscos"),
        ("Sour", "salsas"),
        ("Piña colada", "jugos"),  # en «Smoothies»
    ],
)
def test_a_drink_word_is_food_when_the_dish_concept_says_so(name, concept):
    assert not alcohol_in_name("menu_item", name, concept)
    assert alcohol_in_name("menu_item", name)


@pytest.mark.parametrize(
    "section",
    [
        "Cervezas",
        "Bebidas y Cervezas",  # mezclada: tampoco se ofrecen sus bebidas
        "Cervezas Japonesas y Sake",
        "Bebidas Alcohólicas",
        "Alcohol +18",
        "Licores",
        "Vinos y Piscos",
        "Espumantes",
        "Pisco Sour",
        "Tragos de Autor",
        "Cócteles",
        "CÓCTELES 1 LITRO",
        "Coctelería",
        "Cocktails",
    ],
)
def test_a_dish_from_a_drinks_section_is_never_offered(section):
    assert alcohol_section(section)


@pytest.mark.parametrize(
    "section",
    [
        None,
        "",
        "Bebidas",
        "Bebidas sin Alcohol",
        "Bebestibles Sin Alcohol",
        "Bebidas No Alcoholicas",
        "Mocktails, Not Alcohol",
        "Cocktail",  # en Chile, un cóctel es también comida para picar: tablas, empanaditas
        "Empanadas de Cóctel",
        "Cocktail De Aperitivo",
        "Chop Suey",
        "Rolls",
        "Salsas",
    ],
)
def test_other_sections_are_not_blocked(section):
    assert not alcohol_section(section)


@pytest.mark.parametrize(
    "name",
    [
        "Soju Durazno",  # en la base real: 5 platos «Soju …» con concepto `asiatica`
        "Sangría de la casa",  # y dos «Sangría» en `gaseosas`
        "Michelada clásica",
        "Schop Kunstmann 500 cc",
        "Shop artesanal",
        "Promo pizza familiar + cerveza",  # «pizza» solo libra a la margarita, no a la cerveza
        "Chelas x 2",
        "Copa de vino tinto",
        "Pisco sour",
        "Piscola doble",
        "Vodka tonic",
        "Whisky con hielo",
        "Tequila shot",
        "Ron con cola",
        "Gin tonic",
        "Mojito de maracuyá",
        "Margarita frozen",
        "Terremoto",
        "Aperol Spritz",
        # Lo que se escapaba en la base real (revisión de P2), con concepto ofrecible y precio.
        "Chelada",
        "Negroni",
        "Mango Sour 480ml",
        "Amareto Sour",
        "Sake sour",  # sin concepto: el «sour» de un trago
        "Sour Peruano 1 l",
        "Makgeoli 750ml",
        "Caipiriña",
        "Daiquiri Mango",
        "Escudo 350 ml",
        "Lata Guinness - Draught nitro",
        "Cono sur bicicleta",
        "Corona 620c.c",
        "Corona Sin Alcohol",  # una cerveza igual: una oferta no la propone
        "Novas carmenere",
        "Novas chardonnay",
        "Whiskey con red bull",
        "Kunstmann Torobayo 330 cc",
        "Heineken lata",
        "Stella Artois 330 cc",
        "Budweiser 355 cc",
        "Champaña Brut",
        "Espumante Rosé",
        "Licor de café",
        "Sidra de manzana",
        "Umeshu",
        # Lo que se escapaba en la base real (revisión final).
        "Borgoña (1000ml)",
        "Botella de Borgoña 1/2 Lt",
        "CUSQUEÑA NEGRA",
        "Cusqueña Dorada 330 ml",
        "Piña Colada 1 Litro",
        "PIÑA COLADA",
    ],
)
def test_a_dish_name_that_says_alcohol_is_never_offered(name):
    """Los platos no traen marca de alcohol ni +18: el nombre lo dice, con la lista de los menús."""
    assert alcohol_in_name("menu_item", name)


def test_a_margarita_that_is_a_pizza_by_its_concept_is_not_blocked():
    """En la base real, 24 pizzas se llaman «Margarita Familiar», «Margarita Mediana»… sin decir pizza."""
    assert not alcohol_in_name("menu_item", "Margarita Familiar", "pizza")
    assert alcohol_in_name("menu_item", "Margarita Familiar", "cocteles")
    assert alcohol_in_name("menu_item", "Margarita Familiar")
    assert alcohol_in_name("menu_item", "Margarita familiar + cerveza", "pizza")  # la cerveza sí


def test_the_alcohol_words_are_whole_words_in_spanish_and_include_the_asian_ones():
    assert {"soju", "makgeolli", "umeshu", "sake", "ron", "gin", "licor"} <= ALCOHOL_NAME_WORDS


def test_the_menu_alcohol_words_leave_out_sake():
    assert "sake" not in MENU_ALCOHOL_NAME_WORDS
    assert {"soju", "sangria", "michelada", "cerveza", "schop", "shop", "chela", "vino", "pisco", "piscola"} <= (
        MENU_ALCOHOL_NAME_WORDS
    )
    assert {"vodka", "whisky", "tequila", "ron", "gin", "mojito", "margarita", "terremoto", "spritz"} <= (
        MENU_ALCOHOL_NAME_WORDS
    )


def test_vertical_to_try_never_offers_a_deal_whose_name_says_alcohol(monkeypatch):
    """«Vertical por probar» ofrece rebajas de `deals()`, que trae `is_alcoholic OR age_restricted` de la tienda: un
    soju sin esas marcas tampoco se ofrece."""
    from rappi_ia.offers import engine

    found = [
        {"name": "Soju Uva Verde 13.0", "concept": "frutas", "age_restricted": False, "store_id": 1},
        {"name": "Uva Verde 1 kg", "concept": "frutas", "age_restricted": False, "store_id": 1},
    ]

    class NoBlockedStores:
        def execute(self, *args):
            return []

    monkeypatch.setattr(engine, "deals", lambda conn, vertical, limit: found)
    monkeypatch.setattr(engine, "typical_verticals", lambda conn: {})

    offered = engine._offerable_deals(NoBlockedStores(), "supermercado")

    assert [d["name"] for d in offered] == ["Uva Verde 1 kg"]


@pytest.mark.parametrize(
    "name",
    [
        "Fisher-price Juguete Para Bebés Set De Cocina De Madera",  # el primero de «vertical por probar» en Mall
        "Juguete Didáctico Bebé Mapache",
        "Pack Bodie de Bebé Niña Pink/Rosado Talla 3/6M Colloky",
        "Popeye Jabón para Ropa de Bebé",
        "Peluche De Apego Juguete Tuto Amigo Para Bebe Guagua (pato)",
        "Tuto Pañal De Algodón Bambino Para Bebes Guagua Set 3 Tutto (blanco)",
        "Spak Guagua",
    ],
)
def test_a_catalog_name_that_says_baby_is_never_offered(name):
    """Bebé es un grupo que el agente no ofrece, pero en la base real la ropa, los juguetes y el detergente de bebé
    vienen con conceptos corrientes (ropa, juguetes-infantiles, limpieza): el nombre lo dice."""
    assert baby_in_name("catalog_item", name)


@pytest.mark.parametrize(
    ("entity_type", "name"),
    [
        ("catalog_item", "Bebida cola 500 cc"),  # palabra entera: ni «bebida» ni «bebestible»
        ("catalog_item", "Bebestible de almendras 1 L"),
        ("catalog_item", "Casco Infantil Globber Primo Lights Emerald Green"),  # «infantil» es de niños, no de bebé
        ("catalog_item", "Enciclopedia Infantil de Los Dinosaurios"),
        ("menu_item", "Papilla de bebé"),  # solo productos del catálogo
    ],
)
def test_words_that_do_not_say_baby_are_not_blocked(entity_type, name):
    assert not baby_in_name(entity_type, name)


def test_vertical_to_try_never_offers_a_deal_whose_name_says_baby(monkeypatch):
    """En la base real, «vertical por probar» en Mall partía con un juguete para bebés (de juguetes-infantiles)."""
    from rappi_ia.offers import engine

    found = [
        {"name": "Fisher-price Juguete Para Bebés Set De Cocina De Madera", "concept": "juguetes-infantiles",
         "age_restricted": False, "store_id": 1},
        {"name": "Set De Cocina De Madera", "concept": "juguetes-infantiles", "age_restricted": False, "store_id": 1},
    ]  # fmt: skip

    class NoBlockedStores:
        def execute(self, *args):
            return []

    monkeypatch.setattr(engine, "deals", lambda conn, vertical, limit: found)
    monkeypatch.setattr(engine, "typical_verticals", lambda conn: {})

    offered = engine._offerable_deals(NoBlockedStores(), "mall")

    assert [d["name"] for d in offered] == ["Set De Cocina De Madera"]
