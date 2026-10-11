"""Dependencias que comparten la app y sus routers (la conexión, los servicios, el vertical del backend y la limpieza
de las entradas): viven aparte para que `app.py` incluya los routers (`catalog.py`, `agent.py`) sin que ellos tengan
que importar `app`."""

import threading
import time
from collections.abc import AsyncIterator, Callable, Iterator
from contextlib import AbstractContextManager, contextmanager

import anyio
import anyio.from_thread
import anyio.to_thread
from fastapi import Depends
from psycopg import Connection
from psycopg_pool import ConnectionPool, PoolTimeout
from pydantic import BaseModel, model_validator
from rappi_scraper.storage.search import VERTICALS

from .. import config
from ..agent.rappi_agent import PROTOTYPE_VERTICALS
from ..db import database_url
from .limits import ConcurrencyCap
from .services import Services, services

FROM_PROTOTYPE = {v: k for k, v in PROTOTYPE_VERTICALS.items() if k != "turbo"}

APPLICATION_NAME = "rappi-ia-api"  # así se ven sus conexiones en pg_stat_activity
BACKGROUND_TIMEOUT_MS = 20_000  # las tareas después de responder (recalcular segmentos) y el beacon


def gate_for(pool) -> ConcurrencyCap:
    """El turno para sacar una conexión: tantos como caben en el pool, con la misma espera. Los demás esperan en el
    event loop, en orden de llegada, no en un hilo: si los 40 hilos del threadpool quedaran esperando una conexión,
    los requests que ya tienen una no tendrían hilo para correr su endpoint ni devolverla (todo se trababa hasta el
    timeout del pool). Todo lo que saca una conexión pasa por aquí: requests, tareas en segundo plano y el beacon."""
    return ConcurrencyCap("conexiones", pool.max_size, wait_s=pool.timeout)


_pool: ConnectionPool | None = None
_gate = ConcurrencyCap("conexiones", config.API_POOL_MAX, wait_s=config.API_POOL_TIMEOUT_S)  # open_pool lo rehace
_in_use = 0  # conexiones del pool que tiene algún request o tarea: sin ninguna, un PoolTimeout es Postgres caído
_in_use_lock = threading.Lock()


def _configure(conn: Connection) -> None:
    """Cada conexión nueva del pool: una transacción olvidada abierta (un request que esperaba a otro servicio) se corta
    a los 10 s, para que no frene el VACUUM ni guarde bloqueos."""
    conn.execute("SELECT set_config('idle_in_transaction_session_timeout', '10s', false)")
    conn.commit()


def make_pool(conninfo: str) -> ConnectionPool:
    """El pool de la API, sin abrir. `connect_timeout`: Postgres caído no deja a un request esperando minutos. `check`:
    una conexión que Postgres cortó (reinicio, idle timeout) se cambia antes de entregarla."""
    return ConnectionPool(
        conninfo,
        min_size=config.API_POOL_MIN,
        max_size=config.API_POOL_MAX,
        timeout=config.API_POOL_TIMEOUT_S,
        kwargs={"application_name": APPLICATION_NAME, "connect_timeout": 3},
        configure=_configure,
        check=ConnectionPool.check_connection,
        open=False,
        name=APPLICATION_NAME,
    )


def open_pool() -> None:
    """Lo llama el `lifespan` de la API. No espera las conexiones: sin Postgres la API arranca igual y responde 503."""
    global _pool, _gate
    _pool = make_pool(database_url())
    _gate = gate_for(_pool)
    _pool.open()


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def connections_in_use() -> int:
    return _in_use


def _count(delta: int) -> None:
    global _in_use
    with _in_use_lock:
        _in_use += delta


@contextmanager
def _checkout(timeout_ms: int, wait_s: float | None = None) -> Iterator[Connection]:
    """Una conexión del pool con su statement_timeout, esperando a lo más `wait_s` (por defecto, el del pool). Al salir
    confirma (o deshace, si hubo un error) y vuelve al pool. Sin una libre a tiempo, PoolTimeout (503)."""
    if _pool is None:
        raise RuntimeError("El pool de conexiones de la API no está abierto (lo abre el lifespan de la app)")
    with _pool.connection(timeout=wait_s) as conn:
        _count(1)
        try:
            _statement_timeout(conn, timeout_ms)
            yield conn
        finally:
            _count(-1)


def _no_turn(gate: ConcurrencyCap) -> PoolTimeout:
    return PoolTimeout(f"sin turno para una conexión en {gate.wait_s:g} s")


async def get_conn() -> AsyncIterator[Connection]:
    """Falla rápido si Postgres no responde (503, la app muestra «Sin conexión») o una consulta se atasca (504). Espera
    su turno en el event loop y recién entonces toma un hilo para sacar la conexión del pool; la espera total (turno
    más pool) no pasa de API_POOL_TIMEOUT_S. Sin turno a tiempo, PoolTimeout (503, como un pool sin conexiones libres).
    Un request cancelado (el cliente se fue) devuelve igual su conexión y su turno."""
    gate = _gate
    deadline = time.monotonic() + gate.wait_s
    if not await gate.acquire():
        raise _no_turn(gate)
    try:
        checkout = _checkout(config.API_TIMEOUT_INTERACTIVE_MS, max(deadline - time.monotonic(), 0.0))
        with anyio.CancelScope(shield=True):  # una conexión ya sacada del pool no se pierde por una cancelación
            conn = await anyio.to_thread.run_sync(checkout.__enter__)
        try:
            yield conn
        except BaseException as exc:
            with anyio.CancelScope(shield=True):
                await anyio.to_thread.run_sync(
                    checkout.__exit__, type(exc), exc, exc.__traceback__, limiter=anyio.CapacityLimiter(1)
                )
            raise
        with anyio.CancelScope(shield=True):  # devolverla no espera un hilo libre del threadpool
            await anyio.to_thread.run_sync(checkout.__exit__, None, None, None, limiter=anyio.CapacityLimiter(1))
    finally:
        gate.release()


def get_analytics_conn(conn: Connection = Depends(get_conn)) -> Connection:
    """La del panel: sus métricas recorren todos los eventos y tienen más tiempo. Depende de `get_conn`, así un test que
    la reemplaza también reemplaza esta."""
    _statement_timeout(conn, config.API_TIMEOUT_ANALYTICS_MS)
    return conn


def _statement_timeout(conn: Connection, ms: int) -> None:
    """De sesión y confirmado, no `SET LOCAL`: un endpoint que confirma o deshace a mitad (registrar la consulta)
    seguiría sin tope en la transacción siguiente. Se fija en cada request: la conexión pudo venir del panel."""
    conn.execute("SELECT set_config('statement_timeout', %s, false)", (f"{ms}ms",))
    conn.commit()


@contextmanager
def pooled_connection() -> Iterator[Connection]:
    """Una conexión del pool para lo que corre en un hilo del threadpool fuera de `get_conn` (las tareas en segundo
    plano y el beacon): pasa por el mismo turno, pedido al event loop."""
    gate = _gate
    deadline = time.monotonic() + gate.wait_s
    if not anyio.from_thread.run(gate.acquire):
        raise _no_turn(gate)
    try:
        with _checkout(BACKGROUND_TIMEOUT_MS, max(deadline - time.monotonic(), 0.0)) as conn:
            yield conn
    finally:
        anyio.from_thread.run_sync(gate.release)


def _own_connection() -> AbstractContextManager[Connection]:
    return pooled_connection()


def get_connector() -> Callable[[], AbstractContextManager[Connection]]:
    """Abre conexiones del pool (con turno) fuera de `get_conn`: el recálculo de segmentos corre en segundo plano
    después de la respuesta, cuando `/orders` ya devolvió la suya (su `get_conn` es de alcance `function`), y el beacon
    la pide solo después de validar. Los tests lo reemplazan para usar la conexión del test."""
    return _own_connection


def backend_vertical(vertical: str | None) -> str | None:
    """Acepta el código del backend ('licores') o el id del prototipo ('liquor'). Otro valor ('pet', que no es un
    vertical del catálogo) se trata como "sin vertical": el agente lo deduce del mensaje."""
    if vertical is None:
        return None
    code = FROM_PROTOTYPE.get(vertical, vertical)
    return code if code in VERTICALS else None


def get_services() -> Services:
    return services()


def _no_nul(value):
    """Postgres no acepta \x00 en texto ni en JSON, ni UTF-8 inválido (un surrogate suelto): se limpia en vez de
    devolver un 500."""
    if isinstance(value, str):
        return value.replace("\x00", "").encode("utf-8", "replace").decode("utf-8")
    if isinstance(value, dict):
        return {_no_nul(k): _no_nul(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_no_nul(v) for v in value]
    return value


class Clean(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def strip_nul(cls, data):
        try:
            return _no_nul(data)
        except RecursionError as exc:  # JSON anidado miles de niveles
            raise ValueError("JSON demasiado anidado") from exc
