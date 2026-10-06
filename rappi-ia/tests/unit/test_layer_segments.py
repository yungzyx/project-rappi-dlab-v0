import pytest

from rappi_ia.concepts.taxonomy import load_taxonomy
from rappi_ia.layers.attributes import load_attribute_rules
from rappi_ia.layers.segments import (
    CONTENT_PIECES,
    CONTEXT_PIECES,
    EVENT_TYPES,
    FAMILIES,
    LEVELS,
    METRICS,
    SENSITIVE_SEGMENTS,
    load_segment_rules,
)

VERSION, RULES = load_segment_rules()
BY_ID = {r.id: r for r in RULES}


def test_ids_are_unique_and_the_twelve_families_are_all_used():
    assert len(BY_ID) == len(RULES) >= 140
    assert {r.family for r in RULES} == set(FAMILIES) and len(FAMILIES) == 12


def test_exactly_the_thirteen_sensitive_segments_are_flagged():
    assert {r.id for r in RULES if r.sensitive} == SENSITIVE_SEGMENTS
    assert len(SENSITIVE_SEGMENTS) == 13 and {"compra-sin-gluten", "embarazo", "tabaco", "vapeo"} <= SENSITIVE_SEGMENTS


def test_sensitive_segments_are_named_by_behaviour_never_by_condition():
    names = " ".join(BY_ID[i].name.lower() + " " + BY_ID[i].id for i in SENSITIVE_SEGMENTS)
    for condition in ("celiaco", "celíaco", "diabet", "hipertens", "alérgic", "alergic", "enferm"):
        assert condition not in names


def test_every_rule_has_a_signal_or_a_metric_but_not_both_and_known_pieces_only():
    for r in RULES:
        assert bool(r.signals) != bool(r.metric), r.id
        assert set(r.signals) <= {*CONTENT_PIECES, *CONTEXT_PIECES}, r.id
        assert set(r.exclude) <= {*CONTENT_PIECES, *CONTEXT_PIECES}, r.id
        assert set(r.events) <= EVENT_TYPES, r.id
        if r.signals:
            assert r.events, r.id
        if r.metric:
            assert r.metric["name"] in METRICS, r.id


def test_levels_are_increasing_and_complete():
    for r in RULES:
        values = [r.levels[level] for level in LEVELS]
        assert list(r.levels) == list(LEVELS) and values == sorted(set(values)) and values[0] > 0, r.id
        assert r.min_signals >= 1 and r.window_days >= 1 and r.half_life_days > 0, r.id


def test_every_named_concept_group_attribute_occasion_and_service_exists():
    taxonomy = load_taxonomy()
    attributes = {a.attribute_id for a in load_attribute_rules()[1]}
    for r in RULES:
        for pieces in (r.signals, r.exclude):
            assert set(pieces.get("concepts", ())) <= set(taxonomy.concepts), r.id
            assert set(pieces.get("groups", ())) <= set(taxonomy.groups), r.id
            assert set(pieces.get("attributes", ())) <= attributes, r.id
            assert set(pieces.get("occasions", ())) <= set(taxonomy.occasions), r.id
            assert set(pieces.get("services", ())) <= set(taxonomy.services), r.id


def test_relationship_segments_use_metrics_and_the_rest_use_signals():
    assert BY_ID["en-riesgo"].metric == {"name": "dias_sin_pedido", "min": 30, "max": 90}
    assert BY_ID["compra-sin-gluten"].signals["attributes"] == ["sin-gluten"]
    assert BY_ID["nocturno"].signals["hours"] == [21, 1]


def _write(tmp_path, body):
    path = tmp_path / "segments.toml"
    path.write_text('version = "t"\n' + body, encoding="utf-8")
    return path


_OK = """
[[segment]]
id = "x"
name = "X"
family = "dieta"
description = "d"
signals = { concepts = ["cerveza"] }
events = { order_line = 3.0 }
window_days = 30
half_life_days = 10
min_signals = 1
levels = { bajo = 1.0, medio = 2.0, alto = 3.0 }
"""


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ('signals = { concepts = ["cerveza"] }', 'signals = { concepts = ["no-existe"] }'),
        ('signals = { concepts = ["cerveza"] }', 'signals = { colores = ["rojo"] }'),
        ("events = { order_line = 3.0 }", "events = { clic = 1.0 }"),
        ("levels = { bajo = 1.0, medio = 2.0, alto = 3.0 }", "levels = { bajo = 3.0, medio = 2.0, alto = 1.0 }"),
        ("min_signals = 1", "min_signals = 0"),
        ('family = "dieta"', 'family = "otra"'),
        ('signals = { concepts = ["cerveza"] }', "signals = { hours = [25, 3] }"),
        ('signals = { concepts = ["cerveza"] }', "signals = { metric_misc = 1 }"),
    ],
)
def test_a_bad_rule_fails_naming_the_segment(tmp_path, change, message):
    path = _write(tmp_path, _OK.replace(change, message))
    with pytest.raises(ValueError, match=r"Segmento x"):
        load_segment_rules(path)


def test_duplicate_ids_fail(tmp_path):
    with pytest.raises(ValueError, match="repetido"):
        load_segment_rules(_write(tmp_path, _OK + _OK))


def test_defaults_fill_what_a_segment_omits(tmp_path):
    body = (
        "[defaults]\nwindow_days = 99\nhalf_life_days = 9\nmin_signals = 2\n"
        "levels = { bajo = 1.0, medio = 2.0, alto = 3.0 }\nevents = { search = 1.0 }\n"
    )
    segment = (
        '[[segment]]\nid = "y"\nname = "Y"\nfamily = "dieta"\ndescription = "d"\nsignals = { concepts = ["cerveza"] }\n'
    )
    rule = load_segment_rules(_write(tmp_path, body + segment))[1][0]
    assert (rule.window_days, rule.min_signals, rule.events) == (99, 2, {"search": 1.0})
