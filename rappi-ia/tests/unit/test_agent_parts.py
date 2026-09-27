"""Piezas del agente sin base de datos: voz, foto, verificador del texto del LLM y entendimiento de precios."""

from types import SimpleNamespace

import numpy as np

from rappi_ia.agent.audio import assess
from rappi_ia.agent.bigotes import Bigotes
from rappi_ia.agent.compose import AGE_NOTICE, ClaudeComposer, Draft, TemplateComposer, facts, verify_llm_text
from rappi_ia.agent.photo import classify
from rappi_ia.agent.understand import Intent, Understander, _clean, _price


def _segment(avg_logprob=-0.1, no_speech_prob=0.05, compression_ratio=1.2):
    return SimpleNamespace(avg_logprob=avg_logprob, no_speech_prob=no_speech_prob, compression_ratio=compression_ratio)


def test_voice_clear_speech_is_accepted():
    t = assess([_segment()], " quiero una pizza ")
    assert (t.text, t.discarded, t.needs_confirmation) == ("quiero una pizza", False, False)
    assert 0.9 < t.confidence <= 1


def test_voice_low_confidence_asks_for_confirmation():
    assert assess([_segment(avg_logprob=-1.2)], "kiero unas chelas").needs_confirmation
    assert assess([_segment(compression_ratio=3.0)], "pizza pizza pizza pizza").needs_confirmation


def test_voice_silence_and_known_hallucinations_are_discarded():
    assert assess([], "").discarded
    assert assess([_segment(no_speech_prob=0.9)], "hola").discarded
    assert assess([_segment()], "Subtítulos realizados por la comunidad de Amara.org").discarded


def _unit(i: int, dim: int = 8) -> np.ndarray:
    v = np.zeros(dim, dtype=np.float32)
    v[i] = 1.0
    return v


def test_photo_needs_probability_and_margin():
    prompts = np.stack([_unit(0), _unit(1), _unit(2)])
    labels = ["pizza", "cerveza", "otro"]
    clear = classify(_unit(0), prompts, labels, set())
    assert clear.concept == "pizza" and clear.probability > 0.9

    ambiguous = (_unit(0) + _unit(1)) / np.sqrt(2)
    assert classify(ambiguous, prompts, labels, set()).concept is None  # margen < 0,2


def test_photo_never_reports_other_or_sensitive_concepts():
    prompts = np.stack([_unit(0), _unit(1)])
    assert classify(_unit(1), prompts, ["pizza", "otro"], set()).concept is None
    assert classify(_unit(0), prompts, ["cigarrillos", "otro"], {"cigarrillos"}).concept is None


def test_llm_text_verifier():
    refs = {"p1": "Cerveza Escudo 470 cc"}
    assert verify_llm_text("¡Te recomiendo {p1}!", refs) == "¡Te recomiendo Cerveza Escudo 470 cc!"
    assert verify_llm_text("{p1} a solo $990", refs) is None  # cifras propias
    assert verify_llm_text("Prueba {p2}", refs) is None  # marcador desconocido


def test_claude_composer_falls_back_to_template_on_any_failure():
    composer = ClaudeComposer.__new__(ClaudeComposer)  # sin red ni clave
    composer.model = "test"
    composer._fallback = TemplateComposer()

    def boom(**_):
        raise ConnectionError("sin red")

    composer._client = SimpleNamespace(messages=SimpleNamespace(create=boom))
    draft = Draft(kind="resultados", concept_label="🍺 Cerveza", vertical_label="Licores", age_notice=True)
    assert composer.compose(draft) == TemplateComposer().compose(draft)

    def invents_prices(**_):
        return SimpleNamespace(content=[SimpleNamespace(text='{"text": "Todo a $100"}')])

    composer._client = SimpleNamespace(messages=SimpleNamespace(create=invents_prices))
    assert "$100" not in composer.compose(draft)


def test_price_parsing_ignores_units_and_small_numbers():
    assert _price("cerveza bajo 2 mil")[0] == 2000
    assert _price("vino hasta $12.990")[0] == 12990
    assert _price("snacks bajo 5k")[0] == 5000
    assert _price("pisco bajo 8000")[0] == 8000
    for text in [
        "arroz hasta 5 kilos",
        "pañales hasta 12 kg",
        "leche no mas de 2 litros",
        "cerveza bajo 5 grados",
        "pizza para hasta 4 personas",
        "algo bajo 5",
    ]:
        assert _price(text)[0] is None, text
    assert "3 mil" not in _price("cerveza bajo 3 mil")[1]  # la frase de precio sale de la consulta


def test_clean_query_drops_greeting_and_request_words():
    assert _clean("hola bigotes quiero sushi") == "sushi"
    assert _clean("buenas tardes tienen kombucha") == "kombucha"


def test_greeting_and_thanks_combos_are_not_searches():
    u = Understander()
    for text in ["hola buenas", "hola, buenas tardes", "hola bigotes"]:
        assert u.understand(None, text, "licores").kind == "saludo", text
    for text in ["ok gracias", "gracias bigotes", "muchas gracias!"]:
        assert u.understand(None, text, "licores").kind == "gracias", text


def test_brand_words_do_not_switch_vertical():
    u = Understander()
    assert u.understand(None, "cigarros pall mall", "conveniencia").vertical == "conveniencia"
    assert u.understand(None, "chocolate super 8", "conveniencia").vertical == "conveniencia"
    mention = u.understand(None, "leche del super", "conveniencia")
    assert (mention.vertical, mention.explicit_vertical) == ("supermercado", True)


def test_symptoms_flag_pharmacy_notice_and_never_map_to_medicines():
    intent = Understander().understand(None, "tengo fiebre y dolor de cabeza", "supermercado")
    assert intent.symptom and "medicamentos" not in intent.concepts
    assert "medicamentos" not in Understander().understand(None, "me siento enfermo", "supermercado").concepts


def test_llm_verifier_blocks_claims_invented_names_and_spelled_numbers():
    refs = {"p1": "Cerveza Escudo 470 cc"}
    allowed = "Cerveza Escudo 470 cc 🍺 cerveza Licores"
    assert (
        verify_llm_text("Te recomiendo {p1}, bien heladita.", refs, allowed)
        == "Te recomiendo Cerveza Escudo 470 cc, bien heladita."
    )
    for bad in [
        "{p1} es sin alcohol y el más barato",
        "Llévate {p1} y una Kunstmann Torobayo",
        "cuesta mil novecientos pesos {p1}",
        "{p1} con envío gratis",
    ]:
        assert verify_llm_text(bad, refs, allowed) is None, bad


def test_llm_never_sees_the_user_query_and_notices_are_added_in_code():
    draft = Draft(
        kind="sin_resultado",
        query="kebab, mi rut 12.345.678-5 y fono +56 9 1234 5678",
        vertical_label="restaurantes",
        age_notice=True,
    )
    payload = facts(draft, {})
    assert "query" not in payload and "12.345" not in str(payload)

    composer = ClaudeComposer.__new__(ClaudeComposer)
    composer.model, composer._fallback = "test", TemplateComposer()
    composer._client = SimpleNamespace(
        messages=SimpleNamespace(
            create=lambda **_: SimpleNamespace(
                content=[SimpleNamespace(text='{"text": "Uy, eso no lo tengo por ahora."}')]
            )
        )
    )
    text = composer.compose(draft)
    assert text.startswith("Uy, eso no lo tengo") and text.endswith(AGE_NOTICE)


def test_off_topic_results_are_not_labelled_as_the_requested_concept():
    """'un lomo saltado' (peruana) que solo calza por palabras con pastas del súper: se cita la consulta."""
    intent = Intent("buscar", "un lomo saltado", concepts=["peruana"], explicit_concepts=True, query="lomo saltado")
    pasta = SimpleNamespace(name="Vivaldi Chef Pasta Fetuccini", concept="pastas", age_restricted=False)
    no_cheapest = SimpleNamespace(cheapest_without_filter=None)
    draft = Bigotes()._draft(intent, "supermercado", [pasta], no_cheapest, None, False)
    assert draft.concept_label is None
    assert "«lomo saltado»" in TemplateComposer().compose(draft) and "peruana" not in TemplateComposer().compose(draft)
