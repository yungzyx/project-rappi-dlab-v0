"""Procesa una lista de jobs de la cola: progreso, aislamiento de errores y una pasada de reintento."""

import logging
from collections.abc import Callable

from psycopg import Connection

from .. import config
from ..scraping.client import RestaurantGone, StoreUnavailable
from ..storage import repository
from .progress import Progress

log = logging.getLogger(__name__)

JobResult = tuple[str, dict | None, str | None]  # (status, result, error)


class PossibleBlock(RuntimeError):
    """Demasiados jobs seguidos fallaron sin que rappi.cl respondiera: podría estar bloqueando la descarga."""


# Fallos en los que rappi.cl sí respondió (no hay sucursal, no hay menú): no son señal de bloqueo.
NO_BRANCH_AVAILABLE = "ninguna sucursal disponible"
NO_BRANCH_WITH_MENU = "ninguna sucursal con menú"
GONE_MID_CRAWL = "sucursal no disponible a mitad del recorrido"
SITE_ANSWERED = {NO_BRANCH_AVAILABLE, NO_BRANCH_WITH_MENU, GONE_MID_CRAWL}


def _process(
    conn: Connection,
    run_id: int,
    jobs: list[dict],
    handler: Callable[[dict], JobResult],
    describe: Callable[[dict], str],
    log_every: int,
) -> None:
    progress = Progress(len(jobs))
    streak: list[str] = []  # jobs seguidos que fallaron sin respuesta útil de rappi.cl
    for i, job in enumerate(jobs):
        if i % log_every == 0 or i == len(jobs) - 1:
            log.info("%s %s", progress.label(i), describe(job))
        try:
            status, result, error = handler(job)
            site_answered = status != "failed" or error in SITE_ANSWERED
        except Exception as exc:  # un dato inesperado no debe detener una corrida de horas
            conn.rollback()  # deja la conexión usable si el error vino de la base
            log.exception("  job %s falló", job["job_key"])
            status, result, error = "failed", None, f"{type(exc).__name__}: {exc}"
            site_answered = isinstance(exc, StoreUnavailable | RestaurantGone)
        repository.mark_job(conn, run_id, job["job_key"], status, result, error)
        streak = [] if site_answered else [*streak, job["job_key"]]
        if len(streak) >= config.MAX_CONSECUTIVE_FAILURES:
            # Esos fallos los causó el bloqueo, no el job: vuelven a la cola para la próxima actualización, sin
            # tope de intentos (un job de la pasada de reintento, o de un bloqueo anterior, ya llegó al tope).
            repository.requeue_failed(conn, run_id, None, streak)
            raise PossibleBlock(f"posible bloqueo: {len(streak)} fallos consecutivos (último: {error})")


def process_with_retry(
    conn: Connection,
    run_id: int,
    jobs: list[dict],
    handler: Callable[[dict], JobResult],
    describe: Callable[[dict], str] = lambda job: job["job_key"],
    log_every: int = 1,
) -> None:
    """Procesa los jobs y, al final, reintenta una vez los que fallaron (errores transitorios de Rappi).

    Lanza `PossibleBlock` si demasiados jobs seguidos fallan sin respuesta útil: los que quedan siguen pendientes.
    """
    _process(conn, run_id, jobs, handler, describe, log_every)
    retry_keys = set(repository.requeue_failed(conn, run_id, config.MAX_JOB_ATTEMPTS, [j["job_key"] for j in jobs]))
    if not retry_keys:
        return
    log.info("Reintentando %d jobs fallidos", len(retry_keys))
    _process(conn, run_id, [j for j in jobs if j["job_key"] in retry_keys], handler, describe, log_every)
