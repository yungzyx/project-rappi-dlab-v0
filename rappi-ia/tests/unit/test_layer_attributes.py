from rappi_ia.layers.attributes import detect_attributes, load_attribute_rules

VERSION, RULES = load_attribute_rules()


def _ids(found):
    return {d.attribute_id: d for d in found}


def _detect(entity_type="catalog_item", name="", category=None, description=None, rappi=None):
    return _ids(detect_attributes(entity_type, name, category, description, rappi, RULES))


def test_a_rappi_flag_wins_with_its_own_confidence_and_evidence():
    found = _detect(name="Pan de molde", rappi={"gluten_free": True})
    d = found["sin-gluten"]
    assert (d.source, d.confidence, d.evidence) == ("rappi", 0.95, "gluten_free")


def test_a_phrase_in_the_name_is_a_rule_with_its_evidence():
    d = _detect(name="Pan Sin Gluten")["sin-gluten"]
    assert (d.source, d.confidence, d.evidence) == ("regla", 0.8, "sin gluten")


def test_an_explicit_false_from_rappi_blocks_the_phrase():
    assert "sin-gluten" not in _detect(name="Pan Sin Gluten", rappi={"gluten_free": False})


def test_traces_warning_does_not_make_a_product_nut_free_and_contains_cancels():
    found = _detect(name="Galletas sin gluten", description="Puede contener trazas de maní.")
    assert "sin-gluten" in found and "sin-mani" not in found
    assert "sin-gluten" not in _detect(name="Galletas", description="Contiene gluten. Sin gluten no.")


def test_text_after_the_leaflet_warnings_does_not_count():
    found = _detect(name="Jarabe", description="Indicación: tos. Advertencias: producto sin azúcar no apto.")
    assert "sin-azucar" not in found


def test_rappi_values_set_the_attribute():
    assert "mujer" in _detect(name="Shampoo", rappi={"gender": "Femenino"})
    assert "adulto-mayor" in _detect(name="Vitaminas", rappi={"life_stage_human": "Adulto Mayor"})
    assert "perro" in _detect(name="Alimento", rappi={"type_of_pet": "Perro y Gato"})
    assert "gato" in _detect(name="Alimento", rappi={"type_of_pet": "Perro y Gato"})


def test_a_dish_gets_dish_attributes_and_never_product_only_ones():
    found = _detect("menu_item", name="Burger vegana picante para 2")
    assert {"vegano", "picante", "para-compartir"} <= set(found)
    assert "perro" not in _detect("menu_item", name="Perro caliente", rappi=None)  # solo productos
    assert "kosher" not in _detect("menu_item", name="Pizza kosher")


def test_hot_dog_is_not_spicy_and_a_dog_food_is_for_dogs():
    assert "picante" not in _detect("menu_item", name="Hot dog con tomate")
    assert "perro" in _detect(name="Alimento para perro adulto")
    assert "perro" not in _detect(name="Perro caliente congelado")


def test_every_attribute_has_family_and_unique_id():
    families = {"dieta", "alergenos", "publico", "formato", "precio", "origen", "sustentable", "ocasion", "platos"}
    ids = [r.attribute_id for r in RULES]
    assert len(ids) == len(set(ids)) and {r.family for r in RULES} <= families
    assert all(r.phrases or r.rappi or r.derived for r in RULES)
