"""Entender el mensaje: intención, vertical, conceptos, ocasión, filtros y consulta limpia (reglas; sin LLM).

Corrige los errores del cerebro por reglas del prototipo:
- un saludo al inicio ya no tapa el pedido ("hola, quiero sushi" → buscar sushi), y "hola buenas" u
  "ok gracias" son saludo/agradecimiento, no una búsqueda;
- palabras completas, no substrings ("bebestibles" no es bebé);
- a la búsqueda va la consulta limpia (sin saludo, sin "quiero/tienen", sin el tope de precio);
- el vertical sale del contexto (pantalla actual), de una mención inequívoca ("en el súper", no "super 8") o del
  surtido del concepto (de todos los de la ocasión, si es una ocasión); si un concepto nombrado vive en
  restaurantes y en tiendas con surtido parecido, pregunta; sin surtido en ningún lado, el vertical de su grupo;
- los síntomas ("tengo fiebre") no llevan a medicamentos: activan el aviso de farmacia (regla 6d).
"""

import re
import unicodedata
from dataclasses import dataclass, field

from psycopg import Connection

from ..concepts.assign import concept_matcher
from ..concepts.matcher import KeywordMatcher, Match
from ..concepts.taxonomy import load_taxonomy
from ..text import ASSISTANT_WORDS, GREETING_WORDS, REQUEST_WORDS, THANKS_WORDS, normalize
from .verticals import contending_verticals, ranked_verticals

# Menciones inequívocas de un vertical. Palabras sueltas como "mall", "super" o "express" son también marcas
# ("Pall Mall", "Super 8", "Express Lider"): no cuentan.
VERTICAL_MENTIONS = {
    "supermercado": ["supermercado", "en el super", "del super", "al super", "lider", "unimarc", "jumbo", "tottus"],
    "licores": ["botilleria", "licoreria", "en licores"],
    "farmacia": ["farmacia", "cruz verde", "salcobrand", "farmacias ahumada"],
    "restaurantes": [
        "restaurante",
        "restaurant",
        "para pedir ya",
        "delivery de comida",
        # Cadenas: «mcdonalds» se buscaba en el súper y quedaba sin resultado.
        "mcdonalds",
        "mc donalds",
        "mcdonald",
        "burger king",
        "papa johns",
        "dominos",
        "domino s",
        "pizza hut",
        "juan maestro",
        "doggis",
        "telepizza",
        "subway",
        "little caesars",
        "tarragona",
        "wendys",
        "starbucks",
    ],
    "mall": ["rappi mall", "en el mall", "tienda de ropa"],
    "conveniencia": ["oxxo", "minimarket", "almacen de barrio"],
    "chocolateria": ["chocolateria"],
}
# Muletillas al dictar por voz («eh quiero este una coca po»): solo se quitan en los bordes del mensaje.
VOICE_FILLERS = {"eh", "em", "mm", "mmm", "este", "ya", "mira", "oye", "po", "pues"}
# Preguntas sobre la app, no búsquedas (se buscaba la frase literal: «quien eres» traía ajos). Normalizadas.
APP_QUESTIONS = {
    "ayuda": [
        "ayuda",
        "ayudame",
        "quien eres",
        "que eres",
        "que puedes hacer",
        "que haces",
        "como funciona",
        "como te uso",
    ],
    "envio": [
        "hacen delivery",
        "hay delivery",
        "hacen despacho",
        "cuanto se demora",
        "cuanto demora",
        "cuanto tarda",
        "cuanto cuesta el envio",
        "costo de envio",
        "cuando llega",
        # horario y lugar: lo resuelve la app con la ubicación del usuario, no una búsqueda
        "de turno",
        "abierto ahora",
        "abierta ahora",
        "cerca de mi",
        "cerca de aqui",
        "horario",
        "a que hora cierra",
    ],
    "ofertas": ["ofertas", "tienen ofertas", "hay ofertas", "descuentos", "promociones", "promos"],
    # Remedios de enfermedades crónicas: son con receta, no se buscan. «La presión» sí: hay tensiómetros.
    "receta": ["hipertension", "diabetes", "colesterol", "tiroides"],
    # Un pedido en curso (estado, cancelar, reclamo): se resuelve en «Mis pedidos», no es demanda no atendida.
    "pedido": [
        "mi pedido",
        "el pedido",
        "cancelar",
        "reclamo",
        "reclamar",
        "devolucion",
        "reembolso",
        "donde viene",
        "no llega",
        "no ha llegado",
        "llego mal",
    ],
    # Fuera de tema: se contesta con humor y se vuelve a lo que Bigotes sabe hacer; no es demanda no atendida.
    "fuera": [
        "clima",
        "chiste",
        "capital de",
        "te quiero",
        "te amo",
        "eres tonto",
        "tonto",
        "idiota",
        "como estas",
        "quien gano",
        "noticias",
    ],
    "recomendar": [
        "me recomiendas",
        "que me recomiendas",
        "recomiendame",
        "que me sugieres",
        "sugiereme",
        "sorprendeme",
    ],
}
PACKAGED_WORDS = {
    "grano",
    "molido",
    "capsulas",
    "instantaneo",
    "nescafe",
    "kilo",
    "kilos",
    "kg",
    "paquete",
    "sobres",
    "congelada",
    "congelado",
    "congeladas",
    "congelados",
}
# Un mensaje corto que empieza así refina el anterior aunque nombre algo («con papas» tras «hamburguesa»).
REFINE_START = {
    "con",
    "sin",
    "talla",
    "mas",
    "menos",
    "de",
    "del",
    "tamano",
    "sabor",
    "marca",
    "light",
    "grande",
    "chico",
}
OTHER_WORDS = {"otra", "otro", "otras", "otros", "distinta", "distinto", "diferente", "diferentes"}
FOLLOW_UP_FILLER = {
    "y",
    "en",
    "el",
    "la",
    "los",
    "las",
    "mejor",
    "entonces",
    "ahora",
    "tambien",
    "pero",
    "no",
    "algo",
    "uno",
    "una",
}
CHEAP_WORDS = {"barato", "barata", "baratos", "baratas", "economico", "economica", "economicos", "economicas"}
PRICEY_WORDS = {"caro", "cara", "caros", "caras", "premium"}
# «no quiero pizza», «menos sushi»: el concepto que sigue se descarta y se saca de la consulta. «sin» también se
# descarta, pero queda en la consulta («yogurt sin azúcar» busca eso).
REFUSALS = [("no", "quiero"), ("no", "sea"), ("nada", "de"), ("menos",), ("excepto",), ("salvo",)]
# «para mi papá», «de mi mamá»: una persona no se busca (traía papas y mamaderas).
PEOPLE = re.compile(
    r"\b(?:(?:de|para|a|al)\s+)?(?:mi|mis|tu|su)\s+(?:mama|papa|esposo|esposa|marido|senora|hijo|hija|hijos|"
    r"polola|pololo|novia|novio|abuela|abuelo|amigo|amiga|amigos|jefe|jefa|hermano|hermana)\b"
)

SYMPTOMS = [
    "fiebre",
    "resfrio",
    "resfriado",
    "tos",
    "gripe",
    "dolor",
    "migrana",
    "me duele",
    "guata",
    "nauseas",
    "diarrea",
    "alergia",
    "enfermo",
    "enferma",
    "me siento mal",
    "remedio",
    "acidez",
    "garganta",
]

# Un concepto en restaurantes y en otra tienda es ambiguo si, entre las dos verticales que compiten, la de menor
# participación tiene al menos esta fracción de la otra: la misma medida que elige la vertical (agent/verticals.py).
# Con la base del 03-10 preguntan «café», «empanadas» y «platos listos».
AMBIGUITY_RATIO = 0.5
# Quien habla de síntomas no va a una botillería, aunque ahí el jugo pese más que en el súper (es para mezclar).
NOT_WHEN_SICK = {"licores"}
# Vertical natural de un grupo, para conceptos sin surtido en ningún vertical (los demás grupos van al súper).
GROUP_VERTICALS = {
    "comida": "restaurantes",
    "alcohol": "licores",
    "salud": "farmacia",
    "moda": "mall",
    "tecnologia": "mall",
    "deportes": "mall",
    "juguetes": "mall",
    "libreria": "mall",
}
# «u» suelta es «unidades», salvo que sea la «o» antes de otra o («5 lucas u otro trago»).
_UNITS = r"(?:kg|kilos?|gr?|gramos?|l|litros?|ml|cc|grados?|unidades|u(?!\s+o)|personas?|porciones|cm|mts?|metros?)"
_DECIMAL = r"\d+[.,]\d{1,2}(?=\s*(?:mil|lucas|k)\b)"  # «1,5 lucas»: decimales solo con mil/lucas/k
PRICE = re.compile(
    # «de 2 lucas» también es un tope, pero solo con $ o mil/lucas/k («pack de 6» no lo es)
    r"(?:bajo|menos de|hasta|maximo|max|no mas de|por menos de|que cueste menos de"
    r"|de(?=\s*(?:\$|\d[\d.,]*\s*(?:mil|lucas|k)\b)))\s*"
    r"(\$)?\s*(" + _DECIMAL + r"|\d{1,3}(?:[.,\s]\d{3})+|\d+)(?![.,]\d)\s*(mil|lucas|k)?\b"
    r"(?:\s*(?:pesos|clp)\b)?(?!\s*" + _UNITS + r"\b)"
)


@dataclass
class Intent:
    # saludo | gracias | ayuda | envio | ofertas | fuera | pedido | receta | buscar | ocasion | aclarar | servicio
    # | vacio
    kind: str
    text: str
    vertical: str | None = None
    concepts: list[str] = field(default_factory=list)
    occasion: str | None = None
    price_max: float | None = None
    confidence: float = 0.0
    options: list[str] = field(default_factory=list)  # verticales candidatos cuando hay que aclarar
    explicit_vertical: bool = False
    explicit_concepts: bool = False  # los conceptos se nombraron (no vienen solo de la ocasión)
    query: str = ""  # consulta limpia para buscar y para repetirle al usuario
    symptom: bool = False  # habló de síntomas: remedios de farmacia sin receta, sin venta cruzada
    service: str | None = None  # servicio sin catálogo (RappiTravel, RappiFavor)
    cheapest: bool = False  # «barato»: lo más barato primero
    priciest: bool = False  # «más caro»: lo más caro primero
    follow_up: bool = False  # refina el mensaje anterior («talla g» tras «pañales»)
    exclude_previous: bool = False  # «de otra marca», «otras opciones»: sin lo que ya se mostró


class Understander:
    def __init__(self):
        taxonomy = load_taxonomy()
        self.taxonomy = taxonomy
        self.concepts = concept_matcher(taxonomy, for_queries=True)
        self.occasions = KeywordMatcher((o.id, kw) for o in taxonomy.occasions.values() for kw in o.keywords)
        self.verticals = KeywordMatcher((v, kw) for v, kws in VERTICAL_MENTIONS.items() for kw in kws)
        self.symptoms = KeywordMatcher(("sintoma", kw) for kw in SYMPTOMS)
        self.services = KeywordMatcher((s.id, kw) for s in taxonomy.services.values() for kw in s.keywords)
        self.app_questions = KeywordMatcher((kind, kw) for kind, kws in APP_QUESTIONS.items() for kw in kws)
        # «🍕» o «quiero un 🍔»: el emoji de un concepto se lee como su nombre (gana el primero que lo usa).
        self.emojis: dict[str, str] = {}
        for concept in taxonomy.concepts.values():
            if concept.emoji:
                self.emojis.setdefault(concept.emoji.replace("\ufe0f", ""), concept.name)

    def understand(
        self, conn: Connection, text: str, current_vertical: str | None = None, previous: dict | None = None
    ) -> Intent:
        """`previous`: el pedido anterior de la conversación ({query, concepts, vertical}), para los seguimientos."""
        original, text = text, self._emoji_names(text)
        normalized = normalize(text)
        words = set(normalized.split())
        if not normalized:
            return Intent("vacio", original)
        if words <= GREETING_WORDS | ASSISTANT_WORDS:
            return Intent("saludo", text, current_vertical, confidence=1.0)
        if words <= THANKS_WORDS | GREETING_WORDS | ASSISTANT_WORDS and words & THANKS_WORDS:
            return Intent("gracias", text, current_vertical, confidence=1.0)

        price_max, without_price = _price(text)
        # Habla chilena: «pa» y «pal» son «para» y «para el» («algo pa comer», «juguete pal gato»).
        said = re.sub(r"\bpal\b", "para el", re.sub(r"\bpa\b", "para", normalize(without_price)))
        body = " ".join(PEOPLE.sub(" ", _clean(said)).split())
        # Ocasiones y síntomas, sobre el texto sin limpiar: «me siento mal» y «me duele» empiezan con «me».
        occasion = self.occasions.best(said)
        # «sin azúcar» no pide azúcar ni «no quiero pizza» pizza: se descarta el concepto nombrado después.
        body_words = body.split()
        concept_matches, refused = [], []
        for m in self.concepts.matches(body):
            before = tuple(body_words[max(0, m.position - 2) : m.position])
            refusal = next((r for r in REFUSALS if before[-len(r) :] == r), None)
            if refusal:
                refused.append(m)
                body_words[m.position - len(refusal) : m.position + m.words] = [""] * (len(refusal) + m.words)
            elif before[-1:] == ("sin",):
                continue
            else:
                concept_matches.append(m)
        if refused:  # lo rechazado tampoco se busca
            body = " ".join(w for w in body_words if w)
            body_words = body.split()
        concepts = [m.target for m in concept_matches]
        refused_ids = {m.target for m in refused}
        if refused and not concepts and not occasion:  # «cualquier cosa menos sushi»: el resto de su ocasión
            occasion = next(
                (Match(o.id, "", 0, 0) for o in self.taxonomy.occasions.values() if refused_ids & set(o.concepts)),
                None,
            )
        mention = self._mention(body, concept_matches)
        # La ocasión «Me siento mal» cuenta como síntoma («malestar», «cuidarme»): sin Licores, sin «También en» ni
        # venta cruzada, y con el aviso de farmacia. Aunque otra ocasión vaya antes («un tecito para el malestar»).
        symptom = self.symptoms.best(said) is not None or any(
            m.target == "enfermo" for m in self.occasions.matches(said)
        )

        explicit = bool(concepts)
        # Sobre lo dicho si la limpieza se comió la pregunta: «oye bigotes me recomiendas…» queda «recomiendas…».
        question = None if explicit or occasion else self.app_questions.best(body) or self.app_questions.best(said)
        if question:  # «hacen delivery?», «quien eres»: se contesta, no se busca
            return Intent(question.target, text, current_vertical, confidence=1.0)
        # Un servicio sin catálogo, si no se nombra un producto («paquete de pañales» no es un envío) ni un síntoma.
        service = None if explicit or symptom else self.services.best(said)
        if service:
            return Intent("servicio", text, None, [], confidence=0.8, query=body or normalized, service=service.target)
        follow_up = self._follow_up(text, said, body_words, concepts, occasion, symptom, mention, previous, price_max)
        if follow_up:
            return follow_up
        if occasion and not concepts:
            concepts = [c for c in self.taxonomy.occasions[occasion.target].concepts if c not in refused_ids]
        kind = "ocasion" if occasion else "buscar"
        confidence = 0.9 if concept_matches else (0.7 if occasion else 0.3)
        common = dict(
            occasion=_id(occasion),
            price_max=price_max,
            confidence=confidence,
            explicit_concepts=explicit,
            query=body or normalized,
            symptom=symptom,
            cheapest=bool(set(said.split()) & CHEAP_WORDS),
            priciest=bool(set(said.split()) & PRICEY_WORDS),
        )

        if mention:
            return Intent(kind, text, mention, concepts, explicit_vertical=True, **common)
        if current_vertical:
            return Intent(kind, text, current_vertical, concepts, **common)
        if not concepts:
            return Intent(kind, text, None, [], **common)

        if not explicit:  # ocasión: su vertical fijo o el de más surtido para el conjunto de sus conceptos
            fixed = self.taxonomy.occasions[occasion.target].vertical
            if fixed:
                return Intent(kind, text, fixed, concepts, **common)
            options = _ranked(conn, concepts, symptom)
            return Intent(kind, text, options[0] if options else self._home(concepts[0]), concepts, **common)
        options = _ranked(conn, concepts[:1], symptom)
        if words & PACKAGED_WORDS:  # «café en grano», «2 kilos de»: se compra en tienda, no se pide hecho
            options = [v for v in options if v != "restaurantes"]
        pair = [v for v in options[:2] if v in contending_verticals(conn, concepts[:1])]
        if len(pair) == 2 and "restaurantes" in pair and _comparable(conn, concepts[0], pair):
            return Intent("aclarar", text, None, concepts, options=pair, **common)
        return Intent(kind, text, options[0] if options else self._home(concepts[0]), concepts, **common)

    def _follow_up(self, text, said, body_words, concepts, occasion, symptom, mention, previous, price_max):
        """Un mensaje corto que no nombra nada nuevo (o que empieza con «con», «sin», «talla», «más»…) sigue el pedido
        anterior: «talla g» tras «pañales» busca «pañales talla g»; «y en el súper?» busca lo mismo allá."""
        if not previous or occasion or symptom or len([w for w in body_words if w not in FOLLOW_UP_FILLER]) > 4:
            return None
        previous_concepts = [c for c in previous.get("concepts") or [] if c in self.taxonomy.concepts]
        if not previous_concepts or (concepts and body_words[:1] and body_words[0] not in REFINE_START):
            return None
        mention_words = {w for kw in VERTICAL_MENTIONS.get(mention, ()) for w in kw.split()}
        rest = [w for w in body_words if w not in FOLLOW_UP_FILLER and w not in mention_words]
        other = bool(set(body_words) & OTHER_WORDS)
        extra = "" if other or (mention and not rest) else " ".join(rest)  # «mejor no, algo más barato» → «mas barato»
        base = previous.get("query") or ""
        if body_words[:1] == ["y"] and extra:  # «y de vainilla?»: otra opción, no se suma a «de chocolate»
            base, extra = normalize(self.taxonomy.concepts[previous_concepts[0]].name), " ".join(body_words[1:])
        return Intent(
            "buscar",
            text,
            mention or previous.get("vertical"),
            previous_concepts,
            price_max=price_max,
            confidence=0.8,
            explicit_vertical=bool(mention),
            explicit_concepts=True,
            query=" ".join(p for p in (base, extra) if p),
            cheapest=bool(set(said.split()) & CHEAP_WORDS),
            priciest=bool(set(said.split()) & PRICEY_WORDS),
            follow_up=True,
            exclude_previous=other,
        )

    def _emoji_names(self, text: str) -> str:
        if text.isascii():
            return text
        text = text.replace("\ufe0f", "")
        for emoji, name in self.emojis.items():
            text = text.replace(emoji, f" {name} ")
        return text

    def _home(self, concept_id: str) -> str | None:
        concept = self.taxonomy.concepts.get(concept_id)
        return GROUP_VERTICALS.get(concept.parent) if concept else None

    def _mention(self, body: str, concept_matches) -> str | None:
        """Mención de vertical que no se solapa con un concepto nombrado (p. ej. "cigarros pall mall")."""
        for match in self.verticals.matches(body):
            span = set(range(match.position, match.position + match.words))
            overlapping = [m for m in concept_matches if span & set(range(m.position, m.position + m.words))]
            # Una mención más larga que el concepto que pisa gana: «burger king» es la cadena, no «burger».
            if all(match.words > m.words for m in overlapping):
                return match.target
        return None


def _simplify(text: str) -> str:
    """Minúsculas y sin tildes, pero conservando $ y puntos (normalize los borra y el precio los necesita)."""
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def _price(text: str) -> tuple[float | None, str]:
    """Tope de precio y el texto sin esa frase (con su "pesos" o "clp"). "hasta 5 kilos" o "2 litros" no son
    precios; "bajo 5" tampoco: se exige $, "mil"/"lucas"/"k" o al menos 3 dígitos. "1,5 lucas" son $1.500 y
    "$10,000" (coma de miles) $10.000; "$5,5", sin mil/lucas/k, no es precio."""
    simple = _simplify(text)
    for match in PRICE.finditer(simple):
        currency, digits, thousands = match.groups()
        decimal = re.fullmatch(r"\d+[.,]\d{1,2}", digits)
        if decimal and not thousands:  # «1,5 mil ml»: la regex soltó «mil» porque le sigue una unidad
            continue
        value = float(digits.replace(",", ".")) if decimal else float(re.sub(r"[.,\s]", "", digits))
        if not (currency or thousands or value >= 100):
            continue
        return (value * 1000 if thousands else value), simple[: match.start()] + simple[match.end() :]
    return None, simple


def _clean(body: str) -> str:
    """Quita saludo, nombre del asistente y verbos de pedido al inicio, y la cortesía al final:
    "hola bigotes quiero sushi porfa" → "sushi"."""
    words = body.split()
    while words and words[0] in GREETING_WORDS | ASSISTANT_WORDS | THANKS_WORDS | REQUEST_WORDS | VOICE_FILLERS:
        words = words[1:]
    while words and words[-1] in GREETING_WORDS | ASSISTANT_WORDS | THANKS_WORDS | VOICE_FILLERS | {
        "porfa",
        "por",
        "favor",
    }:
        words = words[:-1]
    return " ".join(words)


def _id(match) -> str | None:
    return match.target if match else None


def _ranked(conn: Connection, concept_ids: list[str], sick: bool) -> list[str]:
    return [v for v in ranked_verticals(conn, concept_ids) if not (sick and v in NOT_WHEN_SICK)]


def _comparable(conn: Connection, concept_id: str, verticals: list[str]) -> bool:
    """Participaciones parecidas (no conteos: restaurantes tiene ~5 veces más ítems y nunca habría empate)."""
    shares = dict(
        conn.execute(
            """WITH total AS (SELECT vertical, sum(items) AS items FROM concept_assortment GROUP BY vertical)
               SELECT a.vertical, a.items::float / t.items FROM concept_assortment a JOIN total t USING (vertical)
               WHERE a.concept_id = %s AND a.vertical = ANY(%s)""",
            (concept_id, verticals),
        ).fetchall()
    )
    values = [shares.get(v, 0) for v in verticals]
    return min(values) >= AMBIGUITY_RATIO * max(values)
