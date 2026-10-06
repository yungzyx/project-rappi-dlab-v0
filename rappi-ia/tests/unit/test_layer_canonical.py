from rappi_ia.layers.canonical import name_key

COCA = {"coca", "cola"}


def test_the_same_product_written_two_ways_has_one_key():
    a = name_key("Coca-Cola Original 1.5L", COCA)
    b = name_key("Coca Cola Original 1,5 L", COCA)
    assert a == b == "original"


def test_the_size_and_the_pack_do_not_make_a_different_product():
    assert name_key("Cerveza Cristal Lata 6 x 350 ml", {"cristal"}) == name_key(
        "Cristal Cerveza Lata 350 cc", {"cristal"}
    )


def test_variants_that_change_the_product_stay_apart():
    assert name_key("Coca-Cola Zero 1.5L", COCA) != name_key("Coca-Cola Original 1.5L", COCA)
    assert name_key("Leche Sin Lactosa 1 L", {"colun"}) != name_key("Leche Con Lactosa 1 L", {"colun"})


def test_model_numbers_are_kept():
    assert name_key("Cargador iPhone 20W", {"apple"}) != name_key("Cargador iPhone 35W", {"apple"})


def test_word_order_does_not_matter():
    assert name_key("Original Coca-Cola 1.5 L", COCA) == name_key("Coca-Cola Original 1.5 L", COCA)
