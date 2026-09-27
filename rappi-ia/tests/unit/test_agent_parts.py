"""Piezas del agente sin base de datos: voz, foto, verificador del texto del LLM y entendimiento de precios."""

from types import SimpleNamespace

import numpy as np

from rappi_ia.agent.audio import assess
from rappi_ia.agent.compose import ClaudeComposer, Draft, TemplateComposer, verify_llm_text
from rappi_ia.agent.photo import classify
from rappi_ia.agent.understand import _price, _strip_greeting


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


def test_price_and_greeting_parsing():
    assert _price("cerveza bajo 2 mil") == 2000
    assert _price("vino hasta $12.990") == 12990
    assert _price("algo rico") is None
    assert _strip_greeting("hola quiero sushi") == "quiero sushi"
    assert _strip_greeting("buenas tardes una pizza") == "una pizza"
