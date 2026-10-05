import pytest

from rappi_ia.concepts.assign import MappedName, assign_catalog_item, assign_menu_item, concept_matcher
from rappi_ia.concepts.store import read_category_map_csv
from rappi_ia.concepts.taxonomy import load_taxonomy


@pytest.fixture(scope="module")
def matcher():
    return concept_matcher(load_taxonomy())


CATEGORIES = {
    "gaseosas": MappedName("gaseosas", "llm", 0.95, "v1"),
    "otros": MappedName("platos-listos", "llm", 0.4, "v1"),
}


def test_catalog_item_prefers_confident_category(matcher):
    a = assign_catalog_item("1", "Fanta Naranja 1,5 L", "Gaseosas", CATEGORIES, matcher)
    assert (a.concept_id, a.method, a.source) == ("gaseosas", "llm", "categoria:Gaseosas")


def test_catalog_item_falls_back_to_rules_when_category_is_doubtful(matcher):
    a = assign_catalog_item("2", "Cerveza Kunstmann Torobayo 470 cc", "Otros", CATEGORIES, matcher)
    assert (a.concept_id, a.method) == ("cerveza", "regla")


def test_catalog_item_keeps_doubtful_category_if_no_rule_matches(matcher):
    a = assign_catalog_item("3", "Producto XYZ", "Otros", CATEGORIES, matcher)
    assert (a.concept_id, a.confidence) == ("platos-listos", 0.4)


def test_catalog_item_without_anything_is_unassigned(matcher):
    assert assign_catalog_item("4", "Producto XYZ", None, CATEGORIES, matcher) is None


SECTIONS = {"bebidas": MappedName("gaseosas", "llm", 0.9), "promos": MappedName("pizza", "llm", 0.3)}
CUISINES = {"italiana": MappedName("pizza", "llm", 0.8)}


def test_menu_item_name_wins_over_section(matcher):
    a = assign_menu_item("10", "Pizza napolitana", "Bebidas", [], SECTIONS, CUISINES, matcher)
    assert (a.concept_id, a.method) == ("pizza", "regla")


def test_menu_item_uses_section_then_cuisine(matcher):
    by_section = assign_menu_item("11", "Limonada menta jengibre", "Bebidas", ["Italiana"], SECTIONS, CUISINES, matcher)
    assert by_section.concept_id == "jugos"  # "limonada" es regla de nombre
    by_section = assign_menu_item("12", "Maracuyá sour sin alcohol", "Bebidas", [], SECTIONS, CUISINES, matcher)
    assert (by_section.concept_id, by_section.source) == ("gaseosas", "seccion:Bebidas")
    by_cuisine = assign_menu_item("13", "Especial de la casa", "Promos", ["Italiana"], SECTIONS, CUISINES, matcher)
    assert (by_cuisine.concept_id, by_cuisine.confidence) == ("pizza", 0.64)  # 0.8 × 0.8: la cocina es pista débil


DISH_SECTIONS = {
    "perros calientes": MappedName("sandwiches", "llm", 0.9),
    "bebidas": MappedName("gaseosas", "llm", 0.9),
}
DISH_CUISINES = {"pescados y mariscos": MappedName("pescados-mariscos", "llm", 0.8)}


def test_menu_item_section_wins_over_a_non_food_name_rule(matcher):
    """En un menú, «Perro», «Aros» o «Proteína» sueltos no son comida de perro, joyas ni suplementos."""
    by_section = assign_menu_item("20", "Perro Italiano XL", "Perros Calientes", [], DISH_SECTIONS, {}, matcher)
    assert (by_section.concept_id, by_section.source) == ("sandwiches", "seccion:Perros Calientes")
    seafood = ["Pescados y Mariscos"]
    by_cuisine = assign_menu_item("21", "Aros de Calamar", "Piqueos", seafood, {}, DISH_CUISINES, matcher)
    assert (by_cuisine.concept_id, by_cuisine.source) == ("pescados-mariscos", "cocina:Pescados y Mariscos")


def test_menu_item_keeps_a_non_food_name_rule_without_a_confident_mapping(matcher):
    a = assign_menu_item("22", "Perro Italiano XL", "Promos", [], DISH_SECTIONS, {}, matcher)
    assert (a.concept_id, a.method) == ("alimento-perro", "regla")


def test_menu_item_sensitive_name_rule_still_wins_over_the_section(matcher):
    """Un local que vende cigarrillos en «Bebidas»: el nombre sensible manda (no se ofrecen como gaseosa)."""
    a = assign_menu_item("23", "Cigarrillos Marlboro Rojo", "Bebidas", [], DISH_SECTIONS, {}, matcher)
    assert (a.concept_id, a.method) == ("cigarrillos", "regla")


@pytest.fixture(scope="module")
def csv_maps():
    """Los mapeos versionados en category_map.csv, con la clave en minúsculas como los carga `rappi-ia concepts`."""
    maps = {"categoria": {}, "seccion_menu": {}, "cocina": {}}
    for row in read_category_map_csv():
        maps[row["tipo"]][row["nombre"].strip().lower()] = MappedName(
            row["concept_id"], row["metodo"], float(row["confianza"])
        )
    return maps


@pytest.mark.parametrize(
    ("name", "section", "cuisines"),
    [
        ("Perro Italiano", "Perros Calientes", ["Hamburguesa"]),
        ("Perro tradicional", "Perros Calientes", []),
        ("Perro Jumbo Gigante", "PERROS CALIENTES", ["Americana"]),
        ("Perro Especial", "Perro Caliente", ["Hamburguesa"]),
        ("Perro chilango", "Perros", []),
        ("Completo", "Completos", ["Americana"]),
        ("Perro Sencillo", "Completos Venezolanos", []),
        ("Perro Venezolano Xl", "Vienesas", []),
        ("Completo Aleman", "Completos y Perros Calientes", ["Americana"]),
        ("As Italiano", "Hot Dogs", ["Pastelería y Postres"]),
        ("Italiano", "Hot Dog", []),
    ],
)
def test_hot_dog_sections_of_the_real_map_make_the_dish_a_sandwich(matcher, csv_maps, name, section, cuisines):
    """Sin la sección mapeada, un perro caliente sin esa frase en el nombre quedaba como alimento para perros o
    tomaba la cocina del local (pizza, hamburguesa, pastelería)."""
    a = assign_menu_item("24", name, section, cuisines, csv_maps["seccion_menu"], csv_maps["cocina"], matcher)
    assert (a.concept_id, a.source) == ("sandwiches", f"seccion:{section}"), a


TOBACCO = {"cigarrillos": MappedName("cigarrillos", "llm", 0.8, "v1")}


@pytest.mark.parametrize(
    ("name", "concept"),
    [
        ("Vookbar 30000 Strawberry Banana", "cigarrillos"),  # sin palabra que lo delate, queda donde la categoría
        ("Fume X Nicky Jam El Ganador 15000 Puff 4.5%", "vapeo"),
        ("E-liquid King Crest Don Juan Tabaco Dulce 120ml 6mg", "vapeo"),
        ("Blunt Wrap Watermelon", "accesorios-fumador"),
        ("Tabaquera De Eco Cuero Con Amarre", "accesorios-fumador"),
        ("Tabaco Ross Maracuya 45g", "cigarrillos"),
        ("Marlboro Cigarrillos Red Box 20 u", "cigarrillos"),
    ],
)
def test_the_tobacconist_category_is_split_by_name(matcher, name, concept):
    """Rappi Mall lista vapers, líquidos y papelillos en la categoría «Cigarrillos»: 738 «cigarrillos» que dejaban a
    Licores fuera de competencia («cigarros» mostraba puritos del Mall)."""
    assert assign_catalog_item("1", name, "Cigarrillos", TOBACCO, matcher).concept_id == concept


def test_tobacconist_words_mean_nothing_outside_that_category(matcher):
    a = assign_catalog_item(
        "1", "Cereal Puffs Plátano Zapallo", "Cereales", {"cereales": MappedName("cereales", "llm", 0.9)}, matcher
    )
    assert a.concept_id == "cereales"
