from rappi_ia.layers.attributes import detect_attributes, load_attribute_rules

VERSION, RULES = load_attribute_rules()


def _ids(found):
    return {d.attribute_id: d for d in found}


def _detect(entity_type="catalog_item", name="", category=None, description=None, rappi=None, group=None):
    return _ids(detect_attributes(entity_type, name, category, description, rappi, RULES, group))


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
    assert "perro" in _detect(name="Alimento para perro adulto", group="mascotas")
    assert "perro" not in _detect(name="Perro caliente congelado", group="mascotas")


def test_pet_words_only_count_inside_the_pets_group():
    """«Gato Vino Cabernet» es un vino y «Audífonos Cat» no son para gatos; el campo de Rappi sí vale siempre."""
    assert "gato" not in _detect(name="Gato Vino Cabernet Sauvignon 1 L", group="alcohol")
    assert "gato" not in _detect(name="Audífonos Bluetooth Cat P47m", group="tecnologia")
    assert "gato" in _detect(name="Collar", rappi={"type_of_pet": "Gato"}, group="tecnologia")


def test_a_dish_description_lists_ingredients_so_only_diet_uses_it():
    found = _detect(
        "menu_item", name="Hamburguesa clásica", description="Con papas fritas y salsa picante. Sin gluten."
    )
    assert "frito" not in found and "picante" not in found and "con-acompanamiento" not in found
    assert "sin-gluten" in found
    assert "frito" in _detect("menu_item", name="Pollo frito")


def test_two_attributes_can_share_the_same_words():
    assert {"sin-azucar", "light"} <= set(_detect(name="Bebida Light sin azúcar"))


def test_plural_and_singular_are_the_same_word():
    assert "ninos" in _detect(name="Juguete para niños") and "ninos" in _detect(name="Juguete para niño")


def test_every_attribute_has_family_and_unique_id():
    families = {"dieta", "alergenos", "publico", "formato", "precio", "origen", "sustentable", "ocasion", "platos"}
    ids = [r.attribute_id for r in RULES]
    assert len(ids) == len(set(ids)) and {r.family for r in RULES} <= families
    assert all(r.phrases or r.rappi or r.derived for r in RULES)


def test_only_declared_properties_are_read_from_a_product_description():
    """«Olla… apta para vidrio y microondas, hecha en Chile» no es un envase de vidrio ni un producto chileno."""
    description = "Apta para vidrio y microondas. Producto chileno. Sin gluten certificado."
    found = _detect(name="Olla de cocción 7 L", description=description)
    assert "vidrio" not in found and "chileno" not in found
    assert "sin-gluten" in found  # dieta sí se lee de la descripción


def test_baby_back_ribs_and_globe_bulbs_are_not_baby_or_birthday_items():
    assert "bebe" not in _detect("menu_item", name="Costillas Baby Back Ribs")
    assert "cumpleanos" not in _detect(name="Ampolleta Led Vintage Globo", category="Ampolletas")
    assert "cumpleanos" in _detect(name="Globos de cumpleaños x 20")
