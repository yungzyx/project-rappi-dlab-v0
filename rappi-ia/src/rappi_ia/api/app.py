"""API de rappi-ia: Bigotes (texto, voz, foto), búsqueda, perfil, eventos del prototipo y métricas del panel.

make serve   →   http://localhost:8000/docs
"""

import io
import logging
from collections.abc import Iterator
from typing import Literal

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from psycopg import Connection
from pydantic import BaseModel, Field

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

app = FastAPI(title="rappi-ia", version="0.1.0", description="Bigotes, búsqueda por vertical y panel empresa")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.API_CORS_ORIGINS,
    # El prototipo también se abre desde el iPhone en la red local (http://192.168.x.x:5174).
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+):51\d\d",
    allow_methods=["*"],
    allow_headers=["*"],
)

FROM_PROTOTYPE = {v: k for k, v in PROTOTYPE_VERTICALS.items() if k != "turbo"}
MAX_UPLOAD_BYTES = 8_000_000


def get_conn() -> Iterator[Connection]:
    with connect() as conn:
        yield conn


def get_services() -> Services:
    return services()


def backend_vertical(vertical: str | None) -> str | None:
    """Acepta el código del backend ('licores') o el id del prototipo ('liquor')."""
    if vertical is None:
        return None
    return FROM_PROTOTYPE.get(vertical, vertical)


# ── Modelos ──────────────────────────────────────────────────────────────────
class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    vertical: str | None = None
    user_id: str | None = Field(default=None, max_length=64)
    session_id: str | None = Field(default=None, max_length=64)
    profile: dict[str, float] | None = None
    shown_topics: list[str] = Field(default_factory=list, max_length=50)
    mode: Literal["propuesta", "actual"] = "propuesta"


class EventIn(BaseModel):
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


class EventsIn(BaseModel):
    user_id: str = Field(max_length=64)
    events: list[EventIn] = Field(max_length=200)


class OrderLineIn(BaseModel):
    entity_type: Literal["catalog_item", "menu_item"]
    entity_id: str = Field(max_length=64)
    concept_id: str | None = None
    qty: int = Field(default=1, ge=1, le=99)
    unit_price: float | None = None
    from_suggestion: bool = False


class OrderIn(BaseModel):
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
    response = svc.bigotes.reply(conn, body.message, ctx)
    _log_chat(conn, body.user_id, body.session_id, body.message, response, "texto", body.mode)
    return response


@app.post("/chat/voice")
async def chat_voice(
    audio: UploadFile = File(...),
    vertical: str | None = Form(None),
    user_id: str | None = Form(None),
    session_id: str | None = Form(None),
    mode: str = Form("propuesta"),
    conn: Connection = Depends(get_conn),
    svc: Services = Depends(get_services),
) -> dict:
    if svc.transcriber is None:
        raise HTTPException(503, "Voz no disponible en este servidor (falta el extra audio)")
    data = await _read_upload(audio)
    transcript = svc.transcriber.transcribe(io.BytesIO(data))  # el audio no se guarda
    ctx = _context(conn, vertical, user_id, None, [], mode)
    response = svc.bigotes.reply_voice(conn, transcript, ctx)
    if not transcript.discarded:
        _log_chat(conn, user_id, session_id, transcript.text, response, "voz", mode)
    return response


@app.post("/chat/photo")
async def chat_photo(
    image: UploadFile = File(...),
    vertical: str | None = Form(None),
    user_id: str | None = Form(None),
    session_id: str | None = Form(None),
    mode: str = Form("propuesta"),
    conn: Connection = Depends(get_conn),
    svc: Services = Depends(get_services),
) -> dict:
    if svc.photo_reader is None:
        raise HTTPException(503, "Fotos no disponibles en este servidor (falta el extra ml)")
    from PIL import Image, UnidentifiedImageError

    from ..agent.photo import similar_items

    try:
        picture = Image.open(io.BytesIO(await _read_upload(image))).convert("RGB")  # la foto no se guarda
    except UnidentifiedImageError as exc:
        raise HTTPException(400, "El archivo no es una imagen") from exc
    picture.thumbnail((336, 336))
    ctx = _context(conn, vertical, user_id, None, [], mode)
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
        outcome = search_products(conn, code, q, [], svc.embedder if mode != "lexico" else None, price_max, k=limit)
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
    shown: set[str] = set()
    rows = []
    for concept in interests[:4]:
        suggestion = suggest_complement(conn, [concept], backend_vertical(vertical), svc.embedder, shown)
        if suggestion:
            shown.add(suggestion.concept)
            rows.append(
                {
                    "reason": suggestion.reason,
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
    return {"guardados": n}


@app.post("/orders")
def post_order(body: OrderIn, conn: Connection = Depends(get_conn)) -> dict:
    order_id = events.record_order(
        conn,
        body.user_id,
        body.session_id,
        body.cart_id,
        backend_vertical(body.vertical),
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
def _context(conn, vertical, user_id, profile, shown_topics, mode) -> Context:
    if profile is None and user_id and mode == "propuesta":
        profile = events.profile(conn, user_id)
    return Context(backend_vertical(vertical), profile or {}, list(shown_topics), mode)


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


async def _read_upload(upload: UploadFile) -> bytes:
    data = await upload.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Archivo demasiado grande (máx. 8 MB)")
    return data
