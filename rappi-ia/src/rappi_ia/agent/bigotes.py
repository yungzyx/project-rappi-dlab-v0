"""Bigotes: un turno de conversación = entender → herramientas → componer → verificar → registrar.

Reglas de conducta (docs/diseno-ia.md §4) que se aplican aquí, en código:
1. Solo productos recuperados de la base, con precio vigente.        → tools.search_products
2. La respuesta sale del vertical actual; lo cruzado va aparte.       → `suggestion`
3. Máximo 1 sugerencia cruzada por respuesta y 1 por tema por sesión. → `shown_topics`
4. Si no encuentra, lo dice y lo marca como demanda no satisfecha.    → `unmet`
5. Si es ambiguo entre verticales, pregunta.                          → intent "aclarar"
6. Sensibles: nunca por iniciativa propia; +18 y farmacia con aviso.  → tools + avisos
7. En modo "Rappi hoy" no hay sugerencias cruzadas ni aprendizaje.
"""

from dataclasses import dataclass, field

from psycopg import Connection

from ..concepts.taxonomy import load_taxonomy
from ..embeddings.base import TextEmbedder
from .compose import AGE_NOTICE, PHARMACY_NOTICE, Draft, TemplateComposer
from .tools import VERTICAL_LABELS, Suggestion, clp, products_for_keys, search_products, suggest_complement
from .understand import Intent, Understander
from .verticals import available_elsewhere

PROTOTYPE_VERTICALS = {  # ids del prototipo (prototipo-app/src/screens/vertical/data.js)
    "supermercado": "grocery",
    "licores": "liquor",
    "farmacia": "pharmacy",
    "mall": "retail",
    "conveniencia": "express",
    "turbo": "express",
    "chocolateria": "chocolates",
    "restaurantes": "restaurants",
}


@dataclass
class Context:
    vertical: str | None = None  # vertical de la pantalla actual (código del backend)
    profile: dict[str, float] = field(default_factory=dict)  # interés por concepto
    shown_topics: list[str] = field(default_factory=list)  # conceptos ya sugeridos en la sesión
    mode: str = "propuesta"  # propuesta | actual ("Rappi hoy")


class Bigotes:
    def __init__(self, embedder: TextEmbedder | None = None, composer=None):
        self.embedder = embedder
        self.composer = composer or TemplateComposer()
        self.understander = Understander()
        self.taxonomy = load_taxonomy()

    def reply(self, conn: Connection, message: str, ctx: Context | None = None) -> dict:
        ctx = ctx or Context()
        intent = self.understander.understand(conn, message, ctx.vertical)
        if intent.kind in ("saludo", "gracias", "vacio"):
            return self._small_talk(intent, ctx)
        if intent.kind == "aclarar":
            return self._clarify(intent)
        vertical = intent.vertical or ctx.vertical or "supermercado"
        search_query = self._search_query(intent)
        # Por síntomas no se buscan medicamentos (regla 6d): solo lo que el usuario nombró.
        concepts = [c for c in intent.concepts if c != "medicamentos"] if intent.symptom else intent.concepts
        outcome = search_products(
            conn, vertical, search_query, concepts, self.embedder, intent.price_max, symptom=intent.symptom
        )
        products = outcome.products

        suggestion = None
        # «Porque llevas X»: X está en la respuesta (en una ocasión, no cualquiera de sus conceptos). Con síntomas no
        # hay venta cruzada, como tampoco «También en».
        if ctx.mode == "propuesta" and products and not intent.symptom:
            if intent.concepts:
                sources = [c for c in dict.fromkeys(p.concept for p in products) if c in intent.concepts]
            else:
                sources = [p.concept for p in products[:1] if p.concept]
            exclude = set(ctx.shown_topics) | set(intent.concepts)
            suggestion = suggest_complement(conn, sources, vertical, self.embedder, exclude)

        # Con tope de precio también es demanda no satisfecha si no existe a ningún precio. Por síntomas no: los
        # medicamentos se ocultan por la regla 6d, no por falta de surtido.
        unmet = not intent.symptom and not products and outcome.result.unmet and outcome.cheapest_without_filter is None
        draft = self._draft(intent, vertical, products, outcome, suggestion, unmet)
        also_in = None if intent.symptom else self._also_in(conn, ctx, intent, products, vertical)
        text = self.composer.compose(draft)
        response = self._response(
            intent, vertical, text, products, suggestion, unmet, outcome.result.unmet_reason, draft
        )
        if also_in:
            response["also_in"] = also_in
        return response

    def reply_voice(self, conn: Connection, transcript, ctx: Context | None = None) -> dict:
        """`transcript`: resultado de audio.Transcriber. Si es dudoso, confirma antes de buscar."""
        if transcript.discarded:
            response = _base(Intent("vacio", ""), "No te escuché bien 🙉 ¿Me lo repites o lo escribes?")
        elif transcript.needs_confirmation:
            response = _base(Intent("aclarar", transcript.text), f"¿Dijiste «{transcript.text}»?")
            response["actions"] = [{"label": "Sí, buscar", "query": transcript.text}]
        else:
            response = self.reply(conn, transcript.text, ctx)
        response["transcript"] = {
            "text": transcript.text,
            "confidence": transcript.confidence,
            "needs_confirmation": transcript.needs_confirmation,
            "discarded": transcript.discarded,
        }
        return response

    def reply_photo(self, conn: Connection, reading, similar: list[tuple], ctx: Context | None = None) -> dict:
        """`reading`: photo.PhotoReading; `similar`: photo.similar_items (vertical, tipo, id, coseno)."""
        ctx = ctx or Context()
        if reading.concept:
            concept = self.taxonomy.concepts[reading.concept]
            response = self.reply(conn, concept.name, ctx)
            response["text"] = f"Parece {concept.label.lower()} 📸. " + response["text"]
        elif similar:
            vertical = ctx.vertical or similar[0][0]
            rows = [row for row in similar if row[0] == vertical]
            products = products_for_keys(conn, vertical, [(t, i) for _, t, i, _ in rows], [c for *_, c in rows])
            text = "No estoy seguro de qué es, pero encontré cosas parecidas a tu foto." if products else ""
            if products and vertical == "farmacia":  # regla 6: farmacia con aviso, como al buscar por texto
                text += f" {PHARMACY_NOTICE}"
            if any(p.age_restricted for p in products):
                text += f" {AGE_NOTICE}"
            response = _base(
                Intent("buscar", "foto", vertical), text or "No logré reconocer la foto 😿 ¿Me cuentas qué es?"
            )
            response.update(
                vertical=vertical,
                prototype_vertical=PROTOTYPE_VERTICALS.get(vertical),
                products=[p.to_dict() for p in products],
                age_notice=any(p.age_restricted for p in products),
            )
        else:
            response = _base(Intent("vacio", "foto"), "No logré reconocer la foto 😿 ¿Me cuentas qué es?")
        response["photo"] = {"concept": reading.concept, "probability": reading.probability}
        return response

    # ── Partes ────────────────────────────────────────────────────────────────
    def _search_query(self, intent: Intent) -> str:
        """Lo que se pidió explícitamente manda; la ocasión solo completa cuando no se nombró nada."""
        if intent.kind == "ocasion" and intent.occasion and not intent.explicit_concepts:
            occasion = self.taxonomy.occasions[intent.occasion]
            return " ".join(self.taxonomy.concepts[c].name for c in occasion.concepts[:4])
        return intent.query or intent.text

    def _small_talk(self, intent: Intent, ctx: Context) -> dict:
        interest = self._top_interest(ctx.profile) if ctx.mode == "propuesta" else None
        label = self.taxonomy.concepts[interest].label.lower() if interest else None
        text = self.composer.compose(Draft(kind=intent.kind, interest_label=label))
        return _base(intent, text)

    def _clarify(self, intent: Intent) -> dict:
        concept = self.taxonomy.concepts[intent.concepts[0]]
        labels = [VERTICAL_LABELS[v] for v in intent.options]
        text = self.composer.compose(Draft(kind="aclarar", concept_label=concept.label, options=labels))
        response = _base(intent, text)
        response["actions"] = [
            {
                "label": "Pedir de un restaurante" if v == "restaurantes" else f"Comprar en {VERTICAL_LABELS[v]}",
                "query": intent.text,
                "vertical": v,
                "route": PROTOTYPE_VERTICALS.get(v),
            }
            for v in intent.options
        ]
        return response

    def _draft(self, intent, vertical, products, outcome, suggestion: Suggestion | None, unmet: bool) -> Draft:
        concept = self.taxonomy.concepts.get(intent.concepts[0]) if intent.concepts else None
        occasion = self.taxonomy.occasions.get(intent.occasion) if intent.occasion else None
        if products:
            kind = "resultados"
        elif intent.price_max is not None and outcome.cheapest_without_filter is not None:
            kind = "sin_precio"
        else:
            kind = "sin_resultado"  # se dice igual; solo se registra como demanda si `unmet`
        suggestion_concept = self.taxonomy.concepts.get(suggestion.concept) if suggestion else None
        # Si ningún resultado es del concepto pedido (la búsqueda calzó por palabras), no se rotulan con ese concepto.
        off_topic = products and intent.concepts and not any(p.concept in intent.concepts for p in products)
        return Draft(
            kind=kind,
            query=intent.query or intent.text,
            concept_label=None if off_topic else _label(occasion, concept),
            vertical_label=VERTICAL_LABELS.get(vertical, vertical),
            product_names=[p.name for p in products],
            price_max=clp(intent.price_max),
            cheapest=clp(outcome.cheapest_without_filter.price_value) if outcome.cheapest_without_filter else None,
            suggestion_reason=suggestion.reason if suggestion else None,
            suggestion_label=suggestion_concept.label.lower() if suggestion_concept else None,
            # +18 si lo muestra la respuesta o la sugerencia cruzada (ambas tienen botón para agregar).
            age_notice=any(p.age_restricted for p in [*products, *(suggestion.products if suggestion else [])]),
            pharmacy_notice=vertical == "farmacia" or "medicamentos" in intent.concepts or intent.symptom,
            unmet=unmet,
        )

    def _response(self, intent, vertical, text, products, suggestion, unmet, unmet_reason, draft: Draft) -> dict:
        response = _base(intent, text)
        response.update(
            vertical=vertical,
            prototype_vertical=PROTOTYPE_VERTICALS.get(vertical),
            products=[p.to_dict() for p in products],
            unmet=unmet,
            unmet_reason=unmet_reason if unmet else None,
            age_notice=draft.age_notice,
        )
        if suggestion:
            label = self.taxonomy.concepts[suggestion.concept].label.lower()
            response["suggestion"] = {
                "reason": suggestion.reason,
                "question": f"¿Te tinca sumar {label}?",
                "vertical": suggestion.vertical,
                "prototype_vertical": PROTOTYPE_VERTICALS.get(suggestion.vertical),
                "concept": suggestion.concept,
                "products": [p.to_dict() for p in suggestion.products],
            }
            response["reason"] = suggestion.reason  # el prototipo muestra `reason` en el primer nivel
        return response

    def _also_in(self, conn, ctx: Context, intent: Intent, products, vertical) -> dict | None:
        """Multiverticalidad visible: en qué otras verticales también hay lo que pidió (no es una sugerencia:
        no se registra ni cuenta para la regla 3). Nunca para conceptos sensibles, en "Rappi hoy" ni cuando habla de
        síntomas (quien dice que está enfermo no necesita ver dónde más venden jugo). Si aquí no hay nada, el concepto
        es el pedido: justo entonces importa decir dónde sí está ("vodka" en farmacia)."""
        concept_id = next((p.concept for p in products if p.concept), None)
        if not products and intent.concepts:
            concept_id = intent.concepts[0]
        concept = self.taxonomy.concepts.get(concept_id) if concept_id else None
        if ctx.mode != "propuesta" or concept is None or concept.sensitive:
            return None
        verticals = available_elsewhere(conn, concept.id, {vertical})
        if not verticals:
            return None
        for v in verticals:
            v["prototype_vertical"] = PROTOTYPE_VERTICALS.get(v["vertical"])
        return {"concept": concept.id, "label": concept.label, "verticals": verticals}

    def _top_interest(self, profile: dict[str, float]) -> str | None:
        concepts = self.taxonomy.concepts
        allowed = {c: s for c, s in profile.items() if c in concepts and not concepts[c].sensitive}
        return max(allowed, key=allowed.get) if allowed else None


def _base(intent: Intent, text: str) -> dict:
    return {
        "text": text,
        "products": [],
        "stores": [],
        "actions": [],
        "reason": None,
        "tags": intent.concepts,
        "intent": {
            "kind": intent.kind,
            "vertical": intent.vertical,
            "concepts": intent.concepts,
            "occasion": intent.occasion,
            "price_max": intent.price_max,
            "confidence": intent.confidence,
        },
        "unmet": False,
        "age_notice": False,
    }


def _label(occasion, concept) -> str | None:
    if occasion:
        return f"{occasion.name.lower()} {occasion.emoji}"
    return concept.label if concept else None
