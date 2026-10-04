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

from dataclasses import dataclass, field, replace

from psycopg import Connection

from ..concepts.taxonomy import load_taxonomy
from ..embeddings.base import TextEmbedder
from ..text import normalize
from .compose import AGE_NOTICE, Draft, TemplateComposer, notices
from .tools import (
    VERTICAL_LABELS,
    Suggestion,
    clp,
    products_for_keys,
    search_products,
    search_remedies,
    suggest_complement,
)
from .understand import Intent, Understander
from .verticals import available_elsewhere, ranked_verticals

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
    previous: dict | None = None  # pedido anterior de la conversación: {query, concepts, vertical, product_ids}


CHEAP_POOL = 24  # «barato»: reordenar solo los 6 más relevantes no daba lo más barato
GENERAL_REMEDIES = "analgésico"  # si nada nombra el síntoma: paracetamol, aspirina y similares


class Bigotes:
    def __init__(self, embedder: TextEmbedder | None = None, composer=None):
        self.embedder = embedder
        self.composer = composer or TemplateComposer()
        self.understander = Understander()
        self.taxonomy = load_taxonomy()

    def reply(self, conn: Connection, message: str, ctx: Context | None = None) -> dict:
        ctx = ctx or Context()
        intent = self.understander.understand(conn, message, ctx.vertical, previous=ctx.previous)
        if intent.kind == "recomendar":  # «qué me recomiendas»: lo que le gusta; sin perfil, ejemplos
            interest = self._top_interest(ctx.profile) if ctx.mode == "propuesta" else None
            if interest is None:
                return self._small_talk(replace(intent, kind="ayuda"), ctx)
            concept = self.taxonomy.concepts[interest]
            response = self.reply(conn, concept.name, ctx)
            response["text"] = f"Como te gusta {concept.label.lower()} 😉 " + response["text"]
            return response
        if intent.kind in ("saludo", "gracias", "vacio", "ayuda", "envio", "ofertas", "fuera"):
            return self._small_talk(intent, ctx)
        if intent.kind == "aclarar":
            return self._clarify(intent)
        if intent.kind == "servicio":
            return self._service(conn, intent, ctx)
        vertical = intent.vertical or ctx.vertical or "supermercado"
        outcome = None
        generic_remedies = False
        # Un síntoma sin producto ni vertical nombrados: remedios de farmacia (sin receta) para eso, o los analgésicos
        # si nada nombra el síntoma («me siento mal»). Sin farmacia, lo de siempre para cuidarse (sopas, jugos, té).
        if intent.symptom and not intent.explicit_concepts and not intent.explicit_vertical:
            for query in (intent.query or intent.text, GENERAL_REMEDIES):
                remedies = search_remedies(conn, query, self.embedder, intent.price_max)
                if remedies.products:
                    outcome, vertical = remedies, "farmacia"
                    intent = replace(
                        intent, vertical="farmacia", concepts=["medicamentos"], kind="buscar", occasion=None
                    )
                    generic_remedies = query == GENERAL_REMEDIES
                    break
        if outcome is None:
            outcome = search_products(
                conn,
                vertical,
                self._search_query(intent),
                intent.concepts,
                self.embedder,
                intent.price_max,
                k=CHEAP_POOL if intent.cheapest or intent.exclude_previous else 6,
                symptom=intent.symptom,
            )
        products = outcome.products
        # «algo más sano» se entiende como ensaladas, pero esas palabras no están en los productos: si nada de lo
        # encontrado es del concepto nombrado, se busca por el nombre del concepto.
        if intent.explicit_concepts and not intent.symptom and not any(p.concept in intent.concepts for p in products):
            concept = self.taxonomy.concepts.get(intent.concepts[0])
            retry = (
                search_products(conn, vertical, concept.name, intent.concepts, self.embedder, intent.price_max, k=6)
                if concept
                else None
            )
            if retry and any(p.concept in intent.concepts for p in retry.products):
                outcome, products = retry, retry.products
        if intent.exclude_previous and ctx.previous:  # «de otra marca»: sin lo que ya se mostró
            seen = set(ctx.previous.get("product_ids") or [])
            products = [p for p in products if p.entity_id not in seen][:6]
        if intent.cheapest:  # «barato»: lo más barato de un grupo más amplio (sin precio, al final)
            products = sorted(products, key=lambda p: (p.price_value is None, p.price_value or 0))[:6]

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

        # Con tope de precio también es demanda no satisfecha si no existe a ningún precio. Por síntomas no: lo que
        # se muestra para cuidarse no es lo que se pidió.
        unmet = not intent.symptom and not products and outcome.result.unmet and outcome.cheapest_without_filter is None
        draft = self._draft(intent, vertical, products, outcome, suggestion, unmet)
        also_in = None if intent.symptom else self._also_in(conn, ctx, intent, products, vertical)
        text = self.composer.compose(draft)
        if generic_remedies:  # la muestra del catálogo no tiene algo para ese síntoma: no aparentar que sí
            text = "No encontré algo específico para eso en Farmacia. Estos son los analgésicos que hay."
            text += "".join(f" {n}" for n in notices(draft))
        response = self._response(
            intent, vertical, text, products, suggestion, unmet, outcome.result.unmet_reason, draft
        )
        if also_in:
            response["also_in"] = also_in
        if intent.occasion == "regalo" and ctx.mode == "propuesta":  # un regalo también se puede mandar
            favor = self.taxonomy.services["rappifavor"]
            response["actions"].append(
                {"label": f"Mandarlo con {favor.name}", "route": [favor.route], "service": favor.id}
            )
            response["service"] = favor.id
        if unmet and ctx.mode == "propuesta":  # lo que no está en el catálogo, un Rappitendero lo compra donde esté
            favor = self.taxonomy.services["rappifavor"]
            response["text"] += f" Si lo venden en otra tienda, {favor.label} te lo compra y te lo lleva."
            response["actions"].append(
                {"label": f"Pedirlo con {favor.name}", "route": [favor.route], "service": favor.id}
            )
            response["service"] = favor.id
        return response

    def _service(self, conn: Connection, intent: Intent, ctx: Context) -> dict:
        """Servicio sin catálogo: su pantalla y, en «Propuesta», UN gancho del catálogo que lo acompaña (el primero
        con productos que no se haya mostrado en la sesión)."""
        service = self.taxonomy.services[intent.service]
        response = _base(intent, f"Para eso está {service.label}: {service.pitch}.")
        action = {"label": f"Abrir {service.name}", "route": [service.route], "service": service.id}
        response.update(service=service.id, actions=[action])
        if ctx.mode != "propuesta":
            return response
        said = f" {normalize(intent.text)} "
        # Primero los ganchos del contexto que se nombró («playa», «nieve»); los demás solo si no tienen contexto.
        in_context = [h for h in service.hooks if any(f" {normalize(w)} " in said for w in h.when)]
        for hook in in_context + [h for h in service.hooks if not h.when]:
            if hook.concept in ctx.shown_topics:
                continue
            for vertical in ranked_verticals(conn, [hook.concept])[:2]:
                outcome = search_products(conn, vertical, hook.query, [hook.concept], self.embedder, k=4)
                products = [p for p in outcome.products if p.concept == hook.concept][:3]
                if products:
                    suggestion = Suggestion(hook.concept, service.id, vertical, service.reason, products)
                    response["suggestion"] = self._suggestion(suggestion, question=hook.question)
                    response["reason"] = suggestion.reason
                    return response
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
        response = _base(intent, text)
        if intent.kind == "ayuda":  # ejemplos que se pueden tocar: nadie empieza frente a un campo vacío
            response["actions"] = [
                {"label": "🎉 Arma un carrete", "query": "algo para el carrete"},
                {"label": "🍽️ ¿Qué almuerzo hoy?", "query": "tengo hambre"},
                {"label": "🤒 Tengo fiebre", "query": "tengo fiebre"},
            ]
        return response

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
            response["suggestion"] = self._suggestion(suggestion)
            response["reason"] = suggestion.reason  # el prototipo muestra `reason` en el primer nivel
        return response

    def _suggestion(self, suggestion: Suggestion, question: str | None = None) -> dict:
        label = self.taxonomy.concepts[suggestion.concept].label.lower()
        return {
            "reason": suggestion.reason,
            "question": question or f"¿Te tinca sumar {label}?",
            "vertical": suggestion.vertical,
            "prototype_vertical": PROTOTYPE_VERTICALS.get(suggestion.vertical),
            "concept": suggestion.concept,
            "products": [p.to_dict() for p in suggestion.products],
        }

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
            "query": intent.query,
            "follow_up": intent.follow_up,
        },
        "unmet": False,
        "age_notice": False,
    }


def _label(occasion, concept) -> str | None:
    if occasion and occasion.id != "enfermo":  # «opciones de me siento mal 🤒» no nombra lo que se muestra
        return f"{occasion.name.lower()} {occasion.emoji}"
    return concept.label if concept else None
