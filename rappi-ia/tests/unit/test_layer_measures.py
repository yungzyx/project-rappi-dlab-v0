import pytest

from rappi_ia.layers.measures import parse_dish_size, parse_measure


@pytest.mark.parametrize(
    ("name", "quantity", "unit", "pack_size", "presentation", "expected"),
    [
        ("Morcilla Carupanera 400gr", 400, "gr", None, "1 X 400 g", (400, "g", 1, 400, "rappi")),
        ("Coco Laminado 1kg", 1, "kg", None, "1 Kg", (1000, "g", 1, 1000, "rappi")),
        ("Coca-Cola 3 L", 1, "und", None, "1Und", (3000, "ml", 1, 3000, "regla")),
        ("Cerveza Lata 1,5 L", None, None, None, None, (1500, "ml", 1, 1500, "regla")),
        ("Cerveza Cristal 6 x 350 ml", 350, "ml", None, "6 X 350 mL", (350, "ml", 6, 2100, "rappi")),
        ("Royal Guard 6 Pack Lata 470 Cc", 470, "ml", "x6", "6 X 470 mL", (470, "ml", 6, 2820, "rappi")),
        ("Pack 4 Yogurt", 1, "und", "x4", "1Und", (1, "und", 4, 4, "rappi")),
        ("Soap Gurugu", 1, "und", None, "1 Und", (1, "und", 1, 1, "rappi")),
        ("Jugo 500 cc", 500, "cc", None, None, (500, "ml", 1, 500, "rappi")),
        ("Aceite 1.500 ml", None, None, None, None, (1500, "ml", 1, 1500, "regla")),
        ("Shampoo Redken 1l", 4, "und", None, "4Und", (1000, "ml", 4, 4000, "regla")),
        ("Cable 2 mt", 2, "mt", None, None, (200, "cm", 1, 200, "rappi")),
        ("Vitamina 500 mg", 60, "und", None, "60Und", (60, "und", 1, 60, "rappi")),
        ("Six pack Cristal 470cc", None, None, None, None, (470, "ml", 6, 2820, "regla")),
        ("Manta Polar 120 x 150 cm", 1, "und", None, "1Und", (1, "und", 1, 1, "rappi")),
        ("Linterna LED Recargable 500 Lúmenes", 1, "und", None, "1Und", (1, "und", 1, 1, "rappi")),
        ("Estuche 12 Lápices de Color", 12, "und", None, "12Und", (12, "und", 1, 12, "rappi")),
        ("Aletas Buceo 2103 L/xl", 1, "und", None, "1Und", (1, "und", 1, 1, "rappi")),
        ("Tetera Para Café 600 L Casaideas", 1, "und", None, "1 x 1 Und", (1, "und", 1, 1, "rappi")),
        ("Actron 600 X 10 Cápsulas Blandas", 10, "und", None, "10Und", (10, "und", 1, 10, "rappi")),
        ("Palos de Helado Pack 50", 50, "und", None, "50Und", (50, "und", 1, 50, "rappi")),
        ("Sobre Carta 12x15cm Pastel", 5, "und", None, "5Und", (5, "und", 1, 5, "rappi")),
        ("Parlante Portátil", 0, "und", None, "0Und", (None, None, 1, None, "rappi")),
    ],
)
def test_parse_measure(name, quantity, unit, pack_size, presentation, expected):
    m = parse_measure(name, quantity, unit, pack_size, presentation)
    assert (m.quantity, m.unit, m.pack, m.total, m.source) == expected


def test_a_measure_from_the_name_says_where_it_came_from():
    m = parse_measure("Coca-Cola 3 L", 1, "und", None, "1Und")
    assert m.evidence == "3 L"


def test_a_product_without_any_measure_has_no_total():
    m = parse_measure("Cargador", None, None, None, None)
    assert m.total is None and m.unit is None and m.pack == 1


@pytest.mark.parametrize(
    ("name", "label"),
    [
        ("Pizza Familiar Pepperoni", "familiar"),
        ("Promo para 2 personas", "para 2"),
        ("Completo XL", "xl"),
        ("Hamburguesa Individual", "individual"),
        ("Pizza grande de pollo", "grande"),
        ("Ensalada César", None),
        ("Combo 4 personas", "para 4"),
    ],
)
def test_parse_dish_size(name, label):
    assert parse_dish_size(name) == label


@pytest.mark.parametrize(
    ("name", "quantity", "unit", "suspect"),
    [
        ("Almendra Tostada", 1, "mg", "un miligramo o menos"),
        ("Mix Frutas", 44682, "kg", "más de 100.000 g"),
        ("Bolsa de regalo", 5000, "und", "más de 1.000 und"),
        ("Vitamina C", 500, "mg", None),
        ("Harina 1 kg", 1, "kg", None),
    ],
)
def test_measures_that_look_like_a_rappi_load_error_are_flagged(name, quantity, unit, suspect):
    assert parse_measure(name, quantity, unit, None, None).suspect == suspect
