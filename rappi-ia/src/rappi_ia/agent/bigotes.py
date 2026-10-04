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

import re
from dataclasses import dataclass, field, replace

from psycopg import Connection

from ..concepts.taxonomy import load_taxonomy
from ..embeddings.base import TextEmbedder
from ..text import normalize, tokens
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
from .verticals import MIN_ITEMS_ELSEWHERE, available_elsewhere, ranked_verticals

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
MIN_SHOWN = 3  # menos productos se completan con la búsqueda por el nombre del concepto
MIN_ELSEWHERE = 2  # productos con el detalle pedido para cambiar de vertical: con uno solo suele ser casualidad
MIN_HOME_ITEMS = MIN_ITEMS_ELSEWHERE  # con menos productos del concepto, la pantalla actual no es donde buscarlo
GENERAL_REMEDIES = "analgésico"  # si nada nombra el síntoma: paracetamol, aspirina y similares
REMEDY_WORDS = {"remedio", "remedios", "medicamento", "medicamentos", "pastilla", "pastillas", "algo", "para"}
# Palabras de un pedido que no son un detalle que deba decir el nombre del producto («lúcuma» en «helado de lúcuma» sí).
NOT_DETAIL = {
    *("para", "algo", "unos", "unas", "como", "pero", "bien", "solo", "menos", "otra", "otro", "marca", "tipo"),
    *("sabor", "talla", "grande", "grandes", "chico", "chica", "mediano", "mediana", "familiar", "unidades"),
    *("litro", "litros", "kilo", "kilos", "helada", "heladas", "frias", "fria", "frio", "rico", "rica", "ricos"),
    *("buena", "bueno", "buenos", "quiero", "tienen", "venden", "preparado", "preparada", "barato", "barata"),
    *("baratos", "baratas", "caro", "cara", "caros", "caras", "premium", "mejor", "opcion", "segunda", "primera"),
    *("pastilla", "pastillas", "capsulas", "comprimidos", "tabletas", "remedio", "remedios", "producto", "productos"),
    # para quién y medidas: los nombres lo dicen de otras formas («Men», «Kids», «FPS 50»)
    *("hombre", "hombres", "mujer", "mujeres", "adulto", "adultos", "nino", "ninos", "nina", "ninas", "factor"),
    *("persona", "personas", "porcion", "porciones", "docena", "docenas"),
}
# Detalles que el nombre del producto dice de otra forma: «para celíacos» es «sin gluten».
DETAIL_ALIASES = {
    **dict.fromkeys(("celiaco", "celiaca", "celiacos", "celiacas"), ("gluten", "sin gluten", True)),
    **dict.fromkeys(("diabetico", "diabetica", "diabeticos", "diabeticas"), ("azucar", "sin azúcar", True)),
}


class Bigotes:
    def __init__(self, embedder: TextEmbedder | None = None, composer=None):
        self.embedder = embedder
        self.composer = composer or TemplateComposer()
        self.understander = Understander()
        self.taxonomy = load_taxonomy()
        # Las palabras con que se nombra cada concepto: no son un detalle del producto («helado» en «helado de…»).
        self._concept_words = {
            c.id: {w for kw in (c.name, *c.keywords, *c.query_keywords) for w in tokens(kw)}
            for c in self.taxonomy.concepts.values()
        }
        # «sin carne» es una forma de nombrar lo vegano: ese «sin» no excluye nada
        self._concept_phrases = {
            c.id: {normalize(kw) for kw in (*c.keywords, *c.query_keywords)} for c in self.taxonomy.concepts.values()
        }

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
        if intent.kind in (
            "saludo",
            "gracias",
            "vacio",
            "ayuda",
            "envio",
            "ofertas",
            "fuera",
            "pedido",
            "receta",
            "memoria",
        ):
            return self._small_talk(intent, ctx)
        if intent.kind == "aclarar":
            return self._clarify(intent)
        if intent.kind == "servicio":
            return self._service(conn, intent, ctx)
        vertical = intent.vertical or ctx.vertical or "supermercado"
        # «vino» desde Farmacia: si la pantalla actual casi no tiene el concepto, se busca donde está y se dice.
        missing = None  # (vertical donde no está, qué, cuántos hay allí) para decirlo
        home = self._home_for(conn, intent, vertical) if vertical == ctx.vertical else None
        if home:
            missing = (vertical, self.taxonomy.concepts[intent.concepts[0]].name.lower(), home[1])
            vertical = home[0]
        avoided = self._avoided(intent)
        outcome = None
        generic_remedies = False
        # Un síntoma sin producto ni vertical nombrados: remedios de farmacia (sin receta) para eso, o los analgésicos
        # si nada nombra el síntoma («me siento mal»). Sin farmacia, lo de siempre para cuidarse (sopas, jugos, té).
        # «remedio para la tos» nombra medicamentos, pero lo que importa es el síntoma.
        remedy_only = intent.concepts == ["medicamentos"]
        if intent.symptom and (not intent.explicit_concepts or remedy_only) and not intent.explicit_vertical:
            # Se busca el síntoma, no «remedio»: esa palabra traía remedios para el estómago («remedio para la tos»).
            said = " ".join(w for w in tokens(intent.query or intent.text) if w not in REMEDY_WORDS)
            for query in (said or intent.query or intent.text, GENERAL_REMEDIES):
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
                k=CHEAP_POOL if intent.cheapest or intent.priciest or intent.exclude_previous or avoided else 6,
                symptom=intent.symptom,
            )
        products = outcome.products
        # «algo más sano» se entiende como ensaladas, pero esas palabras no están en los productos: si nada de lo
        # encontrado es del concepto nombrado, se busca por el nombre del concepto.
        # Con menos de MIN_SHOWN («unos puchos» traía uno) se completa con esa búsqueda, salvo en un seguimiento
        # («talla xg») o si se nombró una cadena o vertical («tienen kfc»): lo demás no es lo pedido.
        on_topic = any(p.concept in intent.concepts for p in products)
        few = len(products) < MIN_SHOWN and not intent.follow_up and not intent.explicit_vertical
        if intent.explicit_concepts and not intent.symptom and (few or not on_topic):
            concept = self.taxonomy.concepts.get(intent.concepts[0])
            retry = (
                search_products(conn, vertical, concept.name, intent.concepts, self.embedder, intent.price_max, k=6)
                if concept
                else None
            )
            extra = [p for p in retry.products if p.concept in intent.concepts] if retry else []
            if extra and not on_topic:
                outcome, products = retry, retry.products
            elif extra:
                ids = {p.id for p in products}
                products = (products + [p for p in extra if p.id not in ids])[:6]
        # «helado de lúcuma»: si nada de lo mostrado dice «lúcuma», se busca entre más candidatos y, si aquí no hay,
        # en la vertical que lo tenga (salvo que se haya nombrado una).
        # Con menos de MIN_SHOWN que lo digan se buscan más entre 24 candidatos; si aquí no hay ninguno, en la
        # vertical que los tenga. Lo que lo dice va primero y, con «sin», solo eso (un vino común no es «sin alcohol»).
        detail = self._detail(intent) if intent.explicit_concepts and not intent.symptom and products else None
        if detail:
            says = [p for p in products if _names(p.name, detail[0], detail[2])]
            found = self._with_detail(conn, intent, vertical, detail) if len(says[:6]) < MIN_SHOWN else None
            if found and found[0] != vertical and not says:
                missing = missing or (vertical, detail[1], 0)
                vertical, outcome, says = found
                products = says
            elif found and found[0] == vertical and len(found[2]) > len(says):
                outcome, says = found[1], found[2]
            if says:
                products = says if detail[2] else says + [p for p in products if p not in says]
        if avoided:  # «sushi sin palta»: fuera lo que nombra la palta (salvo «sin palta»); nunca se muestra igual
            products = [
                p for p in products if not any(_names(p.name, w) and not _names(p.name, w, True) for w in avoided)
            ]
        if intent.exclude_previous and ctx.previous:  # «de otra marca»: sin lo que ya se mostró
            seen = set(ctx.previous.get("product_ids") or [])
            products = [p for p in products if p.entity_id not in seen]
        if intent.cheapest:  # «barato»: lo más barato de un grupo más amplio (sin precio, al final)
            products = sorted(products, key=lambda p: (p.price_value is None, p.price_value or 0))
        elif intent.priciest:  # «uno más caro»: lo más caro primero
            products = sorted(products, key=lambda p: (p.price_value is None, -(p.price_value or 0)))
        products = products[:6]

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
        if missing and products:
            text = _moved(missing[0], vertical, missing[1], missing[2]) + text
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
        text = self.composer.compose(Draft(kind=intent.kind, interest_label=label, learns=ctx.mode == "propuesta"))
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

    def _home_for(self, conn: Connection, intent: Intent, vertical: str) -> tuple[str, int] | None:
        """(vertical, productos del concepto en `vertical`) donde buscar un concepto nombrado que `vertical` casi no
        tiene (menos de MIN_HOME_ITEMS), si otra tiene al menos eso. Nunca si se nombró la vertical o en síntomas."""
        if not intent.explicit_concepts or intent.explicit_vertical or intent.symptom or intent.follow_up:
            return None
        concept = intent.concepts[0]
        items = dict(
            conn.execute("SELECT vertical, items FROM concept_assortment WHERE concept_id = %s", (concept,)).fetchall()
        )
        if items.get(vertical, 0) >= MIN_HOME_ITEMS:
            return None
        home = next((v for v in ranked_verticals(conn, [concept]) if items.get(v, 0) >= MIN_HOME_ITEMS), None)
        return (home, items.get(vertical, 0)) if home else None

    def _avoided(self, intent: Intent) -> list[str]:
        """Lo que se pide «sin»: «palta» en «sushi sin palta». No cuenta si es parte del concepto («algo sin carne»
        es vegano y su «carne vegetal» sirve)."""
        if not intent.explicit_concepts or intent.symptom:
            return []
        phrases = {p for c in intent.concepts for p in self._concept_phrases.get(c, ())}
        words = _query_words(intent.query)
        return [
            _stem(b)
            for a, b in zip(words, words[1:], strict=False)
            if a == "sin" and len(b) >= 3 and f"sin {b}" not in phrases
        ]

    def _detail(self, intent: Intent) -> tuple[str, str, bool] | None:
        """(raíz, cómo decirlo, si se pide «sin») de la primera palabra del pedido que no es el concepto ni relleno:
        «lúcuma» en «helado de lúcuma», «sin gluten» en «galletas para celíacos»."""
        concept_words = {w for c in intent.concepts for w in self._concept_words.get(c, ())}
        phrases = {p for c in intent.concepts for p in self._concept_phrases.get(c, ())}
        said = {normalize(w): w.lower() for w in intent.text.split()}
        words = _query_words(intent.query)
        for i, word in enumerate(words):
            stem = _stem(word)
            if word in DETAIL_ALIASES:
                return DETAIL_ALIASES[word]
            # tras «sin» cuenta aunque sea palabra del concepto («sandwich sin palta»), salvo «sin carne» en vegano
            free_from = i > 0 and words[i - 1] == "sin" and f"sin {word}" not in phrases
            known = set() if free_from else concept_words
            if len(word) >= 4 and word.isalpha() and not {word, stem} & (NOT_DETAIL | known):
                label = said.get(word, word).strip("¿?¡!.,")
                return stem, f"sin {label}" if free_from else label, free_from
        return None

    def _with_detail(self, conn: Connection, intent: Intent, vertical: str, detail: tuple[str, str, bool]):
        """(vertical, resultado, productos) del concepto que dicen el detalle en el nombre: entre más candidatos de
        esta vertical y, si no se nombró una, en las que más productos del concepto lo dicen. None si no hay."""
        stem, _, free_from = detail
        candidates = [vertical]
        if not intent.explicit_vertical:
            candidates += [
                v
                for (v,) in conn.execute(
                    """SELECT sv.vertical FROM catalog_items ci
                       JOIN item_concepts ic ON ic.entity_type = 'catalog_item'
                        AND ic.entity_id = ci.master_product_id::text
                       JOIN store_products sp USING (master_product_id) JOIN store_verticals sv USING (store_id)
                       WHERE ic.concept_id = %s AND unaccent(lower(ci.name)) ~ %s AND sv.vertical <> %s
                       GROUP BY 1 ORDER BY count(DISTINCT ci.master_product_id) DESC LIMIT 2""",
                    (intent.concepts[0], _name_pattern(stem, free_from, sql=True), vertical),
                )
            ]
        for candidate in candidates:
            outcome = search_products(
                conn,
                candidate,
                self._search_query(intent),
                intent.concepts,
                self.embedder,
                intent.price_max,
                CHEAP_POOL,
            )
            products = [p for p in outcome.products if p.concept in intent.concepts and _names(p.name, stem, free_from)]
            products = products[:6]
            if len(products) >= (1 if candidate == vertical else MIN_ELSEWHERE):
                return candidate, outcome, products
        return None

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


def _stem(word: str) -> str:
    """Singular aproximado: «champiñones» → «champinon», «tomates» → «tomate», «paltas» → «palta»."""
    if word.endswith("es") and len(word) > 4 and word[-3] in "nrldzj":
        return word[:-2]
    return word[:-1] if word.endswith("s") and len(word) > 3 else word


def _query_words(query: str) -> list[str]:
    """Las palabras del pedido, sin el artículo tras «sin» («pizza sin las aceitunas»)."""
    return tokens(re.sub(r"\bsin (?:el|la|los|las|un|una|unos|unas) ", "sin ", normalize(query)))


def _name_pattern(stem: str, free_from: bool = False, sql: bool = False) -> str:
    """La palabra entera con su plural («sal» no es «salmón»); con `free_from`, dicha como «sin», «libre de» o «0»."""
    start, end = (r"\m", r"\M") if sql else (r"\b", r"\b")
    lead = r"(?:sin|libre de|cero|0)\s+" if free_from else ""
    return rf"{start}{lead}{stem}(?:es|s)?{end}"


def _names(name: str, stem: str, free_from: bool = False) -> bool:
    return re.search(_name_pattern(stem, free_from), normalize(name)) is not None


def _moved(here: str, there: str, what: str, count: int = 0) -> str:
    """«En X no hay…» solo si no hay ninguno; con unos pocos, «casi no hay»."""
    here, there = VERTICAL_LABELS.get(here, here), VERTICAL_LABELS.get(there, there)
    if count:
        return f"En {here} casi no hay «{what}»; en {there} hay más. "
    return f"En {here} no hay «{what}», pero en {there} sí. "
