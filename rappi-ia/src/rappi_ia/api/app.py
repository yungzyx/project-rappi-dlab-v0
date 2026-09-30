"""API de rappi-ia: Bigotes (texto, voz, foto), búsqueda, perfil, eventos del prototipo y métricas del panel.

make serve   →   http://localhost:8000/docs
"""

import io
import logging
import time
from collections.abc import Iterator
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg import Connection, OperationalError
from pydantic import BaseModel, Field, ValidationError, model_validator
from rappi_scraper.storage.search import VERTICALS

from .. import config
from ..agent.bigotes import PROTOTYPE_VERTICALS, Context
from ..agent.tools import search_products, suggest_complement
from ..analytics import queries
from ..concepts.taxonomy import load_taxonomy
from ..db import connect
from ..events import store as events
from ..retrieval.hybrid import MODES
from .services import Services, services

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Carga los modelos antes de «startup complete»: si no, los paga la primera petición (el /health del prototipo,
    que se rinde a los 1,5 s y deja a Bigotes con su cerebro local)."""
    start = time.perf_counter()
    await run_in_threadpool(services)
    # uvicorn solo muestra sus propios loggers: así la duración queda junto a «Application startup complete»
    logging.getLogger("uvicorn.error").info("Servicios cargados en %.1f s", time.perf_counter() - start)
    yield


app = FastAPI(
    title="rappi-ia", version="0.1.0", description="Bigotes, búsqueda por vertical y panel empresa", lifespan=lifespan
)


def cors_origin_regex(allow_lan: bool) -> str:
    """Solo este Mac por defecto. La red local (iPhone) se abre con API_ALLOW_LAN=1 (`make serve-lan`): la API no
    tiene autenticación, así que solo en una red de confianza. Redes privadas: 192.168/16, 10/8 y 172.16/12 (el
    hotspot del iPhone da 172.20.10.x), más nombres `.local` (Bonjour)."""
    hosts = r"localhost|127\.0\.0\.1"
    if allow_lan:
        hosts += (
            r"|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+"
            r"|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.local"
        )
    return rf"http://({hosts}):51\d\d"


app.add_middleware(
    CORSMiddleware,
    allow_origins=config.API_CORS_ORIGINS,
    allow_origin_regex=cors_origin_regex(config.API_ALLOW_LAN),
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["content-type"],
)


@app.exception_handler(OperationalError)
async def database_unavailable(request: Request, exc: OperationalError) -> JSONResponse:
    """Postgres caído o sin respuesta: un 503 claro y rápido (el prototipo cae a su cerebro local), no un 500."""
    log.error("Base de datos no disponible: %s", exc)
    return JSONResponse(status_code=503, content={"detail": "Base de datos no disponible"})


FROM_PROTOTYPE = {v: k for k, v in PROTOTYPE_VERTICALS.items() if k != "turbo"}
EMPTY_VERTICAL_FALLBACK = {"turbo": "conveniencia"}  # mismo tipo de tienda (minimarket con entrega rápida)
MAX_UPLOAD_BYTES = 8_000_000
MAX_BEACON_BYTES = 512_000  # 200 eventos caben de sobra
MAX_AUDIO_SECONDS = 20  # el prototipo graba hasta 7 s; esto protege a Whisper de audios de horas
MAX_IMAGE_PIXELS = 40_000_000  # evita "bombas" de descompresión (un PNG de 17 KB puede pesar 500 MB en memoria)
IMAGE_FORMATS = ["JPEG", "PNG", "WEBP"]  # nunca EPS/PS (Pillow llamaría a Ghostscript)
AUDIO_TYPES = ("audio/", "video/webm", "video/mp4")
MODES_LITERAL = ("propuesta", "actual")


def get_conn() -> Iterator[Connection]:
    """Falla rápido si Postgres no responde o una consulta se atasca (el prototipo tiene su cerebro local)."""
    with connect(connect_timeout=3, options="-c statement_timeout=20s") as conn:
        yield conn


def get_services() -> Services:
    return services()


def backend_vertical(vertical: str | None) -> str | None:
    """Acepta el código del backend ('licores') o el id del prototipo ('liquor'). Otro valor ('pet', que no es un
    vertical del catálogo) se trata como "sin vertical": Bigotes lo deduce del mensaje."""
    if vertical is None:
        return None
    code = FROM_PROTOTYPE.get(vertical, vertical)
    return code if code in VERTICALS else None


def _no_nul(value):
    """Postgres no acepta \x00 en texto ni en JSON: se quita en vez de devolver un 500."""
    if isinstance(value, str):
        return value.replace("\x00", "")
    if isinstance(value, dict):
        return {_no_nul(k): _no_nul(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_no_nul(v) for v in value]
    return value


class Clean(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def strip_nul(cls, data):
        return _no_nul(data)


# ── Modelos ──────────────────────────────────────────────────────────────────
class ChatIn(Clean):
    message: str = Field(min_length=1, max_length=500)
    vertical: str | None = None
    user_id: str | None = Field(default=None, max_length=64)
    session_id: str | None = Field(default=None, max_length=64)
    profile: dict[str, float] | None = None
    shown_topics: list[str] = Field(default_factory=list, max_length=50)
    mode: Literal["propuesta", "actual"] = "propuesta"


class EventIn(Clean):
    type: str
    session_id: str = Field(max_length=64)
    vertical: str | None = None
    concept_id: str | None = None
    entity_type: Literal["catalog_item", "menu_item", "store"] | None = None
    entity_id: str | None = Field(default=None, max_length=64)
    cart_id: str | None = Field(default=None, max_length=64)
    query: str | None = Field(default=None, max_length=500)
    modality: Literal["texto", "voz", "foto"] | None = None
    results: int | None = None
    unmet: bool | None = None
    value: float | None = None
    payload: dict = Field(default_factory=dict)


class EventsIn(Clean):
    user_id: str = Field(max_length=64)
    events: list[EventIn] = Field(max_length=200)


class OrderLineIn(Clean):
    entity_type: Literal["catalog_item", "menu_item"]
    entity_id: str = Field(max_length=64)
    concept_id: str | None = None
    qty: int = Field(default=1, ge=1, le=99)
    unit_price: float | None = None
    from_suggestion: bool = False


class OrderIn(Clean):
    user_id: str = Field(max_length=64)
    session_id: str = Field(max_length=64)
    cart_id: str = Field(max_length=64)
    vertical: str
    lines: list[OrderLineIn] = Field(min_length=1, max_length=100)


# ── Bigotes ──────────────────────────────────────────────────────────────────
@app.get("/health")
def health(conn: Connection = Depends(get_conn), svc: Services = Depends(get_services)) -> dict:
    documents = conn.execute("SELECT count(*) FROM search_documents").fetchone()[0]
    return {"ok": True, "documentos": documents, "capacidades": svc.capabilities}


@app.post("/chat")
def chat(body: ChatIn, conn: Connection = Depends(get_conn), svc: Services = Depends(get_services)) -> dict:
    ctx = _context(conn, body.vertical, body.user_id, body.profile, body.shown_topics, body.mode)
    try:
        response = svc.bigotes.reply(conn, body.message, ctx)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    _log_chat(conn, body.user_id, body.session_id, body.message, response, "texto", body.mode)
    return response


@app.post("/chat/voice")
def chat_voice(
    audio: UploadFile = File(...),
    vertical: str | None = Form(None, max_length=32),
    user_id: str | None = Form(None, max_length=64),
    session_id: str | None = Form(None, max_length=64),
    mode: str = Form("propuesta"),
    shown_topics: str = Form("", max_length=2000),
    conn: Connection = Depends(get_conn),
    svc: Services = Depends(get_services),
) -> dict:
    # Endpoint sin async: FastAPI lo corre en un hilo y Whisper no bloquea a las demás peticiones.
    if svc.transcriber is None:
        raise HTTPException(503, "Voz no disponible en este servidor (falta el extra audio)")
    _check_mode(mode)
    if not (audio.content_type or "").startswith(AUDIO_TYPES):
        raise HTTPException(415, "El archivo no es audio")
    data = _read_upload(audio)
    _check_audio_length(data)
    transcript = svc.transcriber.transcribe(io.BytesIO(data))  # el audio no se guarda
    ctx = _context(conn, vertical, user_id, None, _topics(shown_topics), mode)
    response = svc.bigotes.reply_voice(conn, transcript, ctx)
    if not transcript.discarded:
        _log_chat(conn, user_id, session_id, transcript.text, response, "voz", mode)
    return response


@app.post("/chat/photo")
def chat_photo(
    image: UploadFile = File(...),
    vertical: str | None = Form(None, max_length=32),
    user_id: str | None = Form(None, max_length=64),
    session_id: str | None = Form(None, max_length=64),
    mode: str = Form("propuesta"),
    shown_topics: str = Form("", max_length=2000),
    conn: Connection = Depends(get_conn),
    svc: Services = Depends(get_services),
) -> dict:
    if svc.photo_reader is None:
        raise HTTPException(503, "Fotos no disponibles en este servidor (falta el extra ml)")
    _check_mode(mode)
    from ..agent.photo import similar_items

    picture = _open_image(_read_upload(image))  # la foto no se guarda
    ctx = _context(conn, vertical, user_id, None, _topics(shown_topics), mode)
    reading = svc.photo_reader.read(picture)
    similar = similar_items(conn, reading.vector, svc.image_model, ctx.vertical)
    response = svc.bigotes.reply_photo(conn, reading, similar, ctx)
    _log_chat(conn, user_id, session_id, None, response, "foto", mode)
    return response


@app.get("/search")
def search(
    q: str = Query(min_length=1, max_length=200),
    vertical: str = Query(...),
    price_max: float | None = None,
    limit: int = Query(10, ge=1, le=50),
    mode: str = Query("hibrido"),
    conn: Connection = Depends(get_conn),
    svc: Services = Depends(get_services),
) -> dict:
    if mode not in MODES:
        raise HTTPException(400, f"mode debe ser uno de {MODES}")
    code = backend_vertical(vertical)
    try:
        outcome = search_products(conn, code, q, None, svc.embedder, price_max, k=limit, mode=mode)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {
        "vertical": code,
        "products": [p.to_dict() for p in outcome.products],
        "unmet": outcome.result.unmet,
        "unmet_reason": outcome.result.unmet_reason,
    }


@app.get("/recommendations")
def recommendations(
    user_id: str,
    vertical: str | None = None,
    limit: int = Query(3, ge=1, le=6),
    conn: Connection = Depends(get_conn),
    svc: Services = Depends(get_services),
) -> dict:
    """ "Para ti, de otras tiendas": intereses del usuario → complementos → productos de otro vertical."""
    interests = list(events.profile(conn, user_id))
    taxonomy = load_taxonomy()
    shown: set[str] = set()
    rows = []
    for concept in interests[:4]:
        suggestion = suggest_complement(conn, [concept], backend_vertical(vertical), svc.embedder, shown)
        if suggestion:
            shown.add(suggestion.concept)
            interest = taxonomy.concepts[concept]
            rows.append(
                {
                    # En el inicio no hay carro: la razón es el interés aprendido, no "porque llevas".
                    "reason": f"Porque te interesa {interest.emoji} {interest.name.lower()}",
                    "concept": suggestion.concept,
                    "vertical": suggestion.vertical,
                    "prototype_vertical": PROTOTYPE_VERTICALS.get(suggestion.vertical),
                    "products": [p.to_dict() for p in suggestion.products],
                }
            )
        if len(rows) >= limit:
            break
    return {"user_id": user_id, "interests": interests[:5], "rows": rows}


# ── Perfil y eventos ─────────────────────────────────────────────────────────
@app.get("/profile/{user_id}")
def get_profile(user_id: str, conn: Connection = Depends(get_conn)) -> dict:
    taxonomy = load_taxonomy()
    scores = events.profile(conn, user_id)
    return {
        "user_id": user_id,
        "interests": [
            {"concept": c, "label": taxonomy.concepts[c].label, "score": s}
            for c, s in scores.items()
            if c in taxonomy.concepts
        ],
    }


@app.delete("/profile/{user_id}")
def forget(user_id: str, concept: str | None = None, conn: Connection = Depends(get_conn)) -> dict:
    deleted = events.forget(conn, user_id, concept)
    conn.commit()
    return {"user_id": user_id, "concept": concept, "eventos_borrados": deleted}


@app.post("/events")
def post_events(body: EventsIn, conn: Connection = Depends(get_conn)) -> dict:
    return {"guardados": _save_events(conn, body)}


@app.post("/events/beacon", status_code=204)
async def post_events_beacon(request: Request, conn: Connection = Depends(get_conn)) -> None:
    """Lo que queda en cola al cerrar la pestaña (navigator.sendBeacon). Llega como text/plain, que no necesita
    preflight de CORS; el contenido es el mismo JSON de /events."""
    raw = await request.body()
    if len(raw) > MAX_BEACON_BYTES:
        raise HTTPException(413, "Demasiados eventos")
    try:
        body = EventsIn.model_validate_json(raw)
    except ValidationError as exc:
        raise HTTPException(422, "Eventos inválidos") from exc
    await run_in_threadpool(_save_events, conn, body)


def _save_events(conn: Connection, body: EventsIn) -> int:
    try:
        n = events.record(
            conn,
            [
                events.Event(user_id=body.user_id, **{**e.model_dump(), "vertical": backend_vertical(e.vertical)})
                for e in body.events
            ],
            source="prototype",
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    conn.commit()
    return n


@app.post("/orders")
def post_order(body: OrderIn, conn: Connection = Depends(get_conn)) -> dict:
    vertical = backend_vertical(body.vertical)
    if vertical is None:  # un pedido es de una tienda: sin vertical del catálogo no se puede guardar
        raise HTTPException(400, f"Vertical desconocido: {body.vertical}")
    order_id = events.record_order(
        conn,
        body.user_id,
        body.session_id,
        body.cart_id,
        vertical,
        [line.model_dump() for line in body.lines],
        source="prototype",
    )
    conn.commit()
    return {"order_id": order_id}


@app.get("/concepts")
def concepts() -> dict:
    taxonomy = load_taxonomy()
    return {
        "version": taxonomy.version,
        "concepts": [
            {"id": c.id, "name": c.name, "emoji": c.emoji, "group": c.parent, "sensitive": c.sensitive}
            for c in taxonomy.concepts.values()
        ],
    }


# ── Panel empresa ────────────────────────────────────────────────────────────
ANALYTICS = {
    "kpis": queries.kpis,
    "weekly": queries.weekly,
    "opportunities": queries.opportunities,
    "trends": queries.trends,
    "funnel": queries.funnel,
    "cohorts": queries.cohorts,
    "rhythm": queries.rhythm_histogram,
    "at-risk": queries.at_risk,
    "suggestions": queries.suggestions,
    "multi-vertical": queries.multi_vertical_retention,
    "affinity": queries.affinity,
    "assortment": queries.assortment_vs_demand,
}


@app.get("/analytics/catalog")
def analytics_catalog(conn: Connection = Depends(get_conn)) -> dict:
    return {"source": "catalogo_real", "data": queries.catalog_health(conn)}


@app.get("/analytics/{name}")
def analytics(
    name: str, source: Literal["synthetic", "prototype"] = "synthetic", conn: Connection = Depends(get_conn)
) -> dict:
    if name not in ANALYTICS:
        raise HTTPException(404, f"Métrica desconocida: {name}")
    return {"source": source, "data": ANALYTICS[name](conn, source)}


# ── Auxiliares ───────────────────────────────────────────────────────────────
def _topics(form_value: str) -> list[str]:
    """`shown_topics` de un formulario (voz, foto): ids separados por coma, como mucho 50 (igual que /chat)."""
    return [topic.strip() for topic in form_value.split(",") if topic.strip()][:50]


def _context(conn, vertical, user_id, profile, shown_topics, mode) -> Context:
    if profile is None and user_id and mode == "propuesta":
        profile = events.profile(conn, user_id)
    return Context(_searchable(conn, backend_vertical(vertical)), profile or {}, list(shown_topics), mode)


def _searchable(conn: Connection, vertical: str | None) -> str | None:
    """Un vertical todavía sin documentos (Turbo, antes de que termine la descarga) haría que todo diera "no está"
    y se anotara como demanda: se usa el más parecido o, si tampoco tiene, Bigotes deduce el vertical del mensaje."""
    for candidate in (vertical, EMPTY_VERTICAL_FALLBACK.get(vertical)):
        if (
            candidate
            and conn.execute(
                "SELECT EXISTS (SELECT 1 FROM search_documents WHERE vertical = %s)", (candidate,)
            ).fetchone()[0]
        ):
            return candidate
    return None


def _log_chat(conn, user_id, session_id, text, response, modality, mode) -> None:
    """Registra la consulta (redactada) para tendencias y demanda no satisfecha. En "Rappi hoy" no se aprende."""
    if not user_id or not session_id:
        return
    concepts = response.get("intent", {}).get("concepts") or []
    event = events.Event(
        user_id=user_id,
        session_id=session_id,
        type="chat",
        vertical=response.get("vertical"),
        concept_id=concepts[0] if concepts and mode == "propuesta" else None,
        query=text,
        modality=modality,
        results=len(response.get("products", [])),
        unmet=bool(response.get("unmet")),
        payload={"mode": mode, "intent": response.get("intent", {}).get("kind")},
    )
    events.record(conn, [event], source="prototype")
    conn.commit()


def _read_upload(upload: UploadFile) -> bytes:
    data = upload.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Archivo demasiado grande (máx. 8 MB)")
    return data


def _check_mode(mode: str) -> None:
    if mode not in MODES_LITERAL:
        raise HTTPException(400, f"mode debe ser uno de {MODES_LITERAL}")


def _open_image(data: bytes):
    from PIL import Image, UnidentifiedImageError

    Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
    try:
        picture = Image.open(io.BytesIO(data), formats=IMAGE_FORMATS)
        picture.draft("RGB", (672, 672))  # JPEG: decodifica ya reducido
        picture = picture.convert("RGB")
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError, ValueError) as exc:
        raise HTTPException(400, "La imagen no es válida (se aceptan JPEG, PNG y WebP)") from exc
    picture.thumbnail((336, 336))
    return picture


def _check_audio_length(data: bytes) -> None:
    """Suma la duración decodificando, hasta pasar el tope: el WebM de MediaRecorder no la trae en la cabecera, y
    la cabecera de otro cliente podría mentir."""
    try:
        import av

        seconds = 0.0
        with av.open(io.BytesIO(data)) as container:
            for frame in container.decode(audio=0):
                seconds += frame.samples / frame.sample_rate
                if seconds > MAX_AUDIO_SECONDS:
                    break
    except Exception as exc:  # formato ilegible
        raise HTTPException(400, "El audio no es válido") from exc
    if seconds > MAX_AUDIO_SECONDS:
        raise HTTPException(413, f"Audio demasiado largo (máx. {MAX_AUDIO_SECONDS} s)")
