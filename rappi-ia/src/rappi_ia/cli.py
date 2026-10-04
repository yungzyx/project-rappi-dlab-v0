"""CLI de rappi-ia.

Flujo típico (después de cada `rappi refresh` del scraper):
    rappi-ia migrate
    rappi-ia concepts                # capa 2: taxonomía, complementos, mapeos y conceptos por ítem
    rappi-ia concepts --solo-reporte # cobertura sin recalcular
    rappi-ia map-categories          # categorías sin mapeo revisado, con concepto sugerido, a un CSV para revisar
    rappi-ia embed-text              # embeddings e5 de search_documents (incremental) + HNSW por vertical
    rappi-ia search "algo para el carrete" --vertical licores
    rappi-ia eval-search             # léxico vs vectorial vs híbrido + calibración de τ ("sin resultado")
    rappi-ia synth                   # usuarios y eventos SIMULADOS para el panel (reemplaza los anteriores)
    rappi-ia analytics               # resumen de métricas del panel (frecuencia, abandono, oportunidades…)
    rappi-ia multivertical           # mapa multivertical para la presentación (dashboard-empresa/public/presentacion/)
"""

import argparse
import logging
import sys

from . import config
from .concepts.pipeline import build_concepts
from .concepts.report import coverage_report, render_text, write_category_proposals
from .db import connect, migrate
from .retrieval.hybrid import MODES, Filters, retrieve

log = logging.getLogger("rappi_ia")


def cmd_migrate(conn, args) -> None:
    applied = migrate(conn)
    print("Migraciones aplicadas: " + (", ".join(applied) if applied else "ninguna (al día)"))


def cmd_concepts(conn, args) -> None:
    if not args.solo_reporte:
        embedder = None
        if not args.sin_knn:
            try:
                from .embeddings.models import text_embedder

                embedder = text_embedder()
            except ImportError:
                log.warning("Sin el extra `ml` (sentence-transformers): conceptos solo por categoría y reglas")
        build_concepts(conn, embedder)
    print(render_text(coverage_report(conn)))


def cmd_map_categories(conn, args) -> None:
    rows = coverage_report(conn)["categorias_sin_mapear"]
    out = config.DATA_DIR / "concepts" / "categorias-sin-mapear.csv"
    write_category_proposals(rows, out)
    print(f"{len(rows)} categorías sin mapeo revisado en {out}")
    print("Revisar cada fila, cambiar el método a «curado» y copiarla a src/rappi_ia/concepts/category_map.csv.")


def cmd_embed_text(conn, args) -> None:
    from .embeddings.images import ScrapeRunning, scrape_running
    from .embeddings.models import text_embedder
    from .embeddings.text_store import embed_search_documents

    if scrape_running(conn):  # antes de cargar el modelo
        log.error("Hay una corrida del scraper en curso: embed-text corre después (make post-refresh)")
        sys.exit(1)
    try:
        print(embed_search_documents(conn, text_embedder(), limit=args.limit))
    except ScrapeRunning as exc:
        log.error("%s", exc)
        sys.exit(1)


def cmd_embed_images(conn, args) -> None:
    from contextlib import nullcontext

    from rappi_scraper.lock import DownloadInProgress, download_lock

    from .embeddings.images import ScrapeRunning, embed_images, scrape_running
    from .embeddings.models import clip_embedder

    # El mismo candado que el scraper: nunca dos descargas a la vez (--forzar: una tanda chica, a sabiendas).
    try:
        with nullcontext() if args.forzar else download_lock():
            if scrape_running(conn) and not args.forzar:  # antes de cargar modelos
                log.error("Hay una corrida del scraper en curso: espera a que termine (o --forzar con --limit chico)")
                sys.exit(1)
            print(embed_images(conn, clip_embedder(), limit=args.limit, vertical=args.vertical, force=args.forzar))
    except (DownloadInProgress, ScrapeRunning) as exc:
        log.error("%s", exc)
        sys.exit(1)


def cmd_search(conn, args) -> None:
    embedder = None
    if args.modo != "lexico":
        from .embeddings.models import text_embedder

        embedder = text_embedder()
    result = retrieve(
        conn, args.vertical, args.query, embedder, k=args.limit, filters=Filters(args.precio_max), mode=args.modo
    )
    for i, hit in enumerate(result.hits, start=1):
        price = hit.metadata.get("precio_min", hit.metadata.get("precio"))
        cosine = f"{hit.cosine:.3f}" if hit.cosine is not None else "  -  "
        print(f"{i:>2}. [{hit.concept_id or '?':<16}] cos {cosine} ${price}  {hit.content[:90]}")
    print(f"Conceptos de la consulta: {result.query_concepts or '-'}")
    if result.unmet:
        print(f"⚠ Sin resultado (demanda no satisfecha): {result.unmet_reason}")


def cmd_eval_search(conn, args) -> None:
    from .eval import search_eval
    from .retrieval.hybrid import thresholds

    embedder = None
    if not args.solo_lexico:
        from .embeddings.models import text_embedder

        embedder = text_embedder()
    runs = search_eval.run_queries(conn, embedder, search_eval.load_queries())
    summary = search_eval.summarize(runs)
    current = thresholds()
    proposed = search_eval.calibrate_tau(runs) if embedder else {}
    saved = bool(args.guardar_tau and proposed)
    in_use = search_eval.thresholds_after_saving(current, proposed) if saved else current
    if saved:
        search_eval.save_thresholds(in_use)
    unmet = search_eval.unmet_quality(runs, in_use, run_taus=current)
    model = embedder.model_name if embedder else None
    comparisons = search_eval.compare_modes(runs)
    report = search_eval.render_markdown(summary, unmet, current, proposed, saved, model, comparisons)
    out = config.DATA_DIR / "eval" / "busqueda.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report, encoding="utf-8")
    print(report)
    print(f"Reporte en {out}")


def cmd_eval_sample(conn, args) -> None:
    from .embeddings.models import text_embedder
    from .eval import judgments, search_eval

    runs = search_eval.run_queries(conn, text_embedder(), search_eval.load_queries())
    sample = judgments.build_sample(runs)
    judgments.save_sample(sample)
    diff = sum(p["origen"] == "diferencia" for p in sample)
    print(f"{len(sample)} pares ({diff} donde el refuerzo cambia el top 10) en {judgments.SAMPLE_FILE}")


def cmd_eval_human(conn, args) -> None:
    import json

    from .eval import judgments

    if not judgments.JUDGMENTS_FILE.exists():
        raise SystemExit(f"Todavía no hay juicios a mano ({judgments.JUDGMENTS_FILE} no existe).")
    sample = json.loads(judgments.SAMPLE_FILE.read_text(encoding="utf-8"))["pares"]
    given = json.loads(judgments.JUDGMENTS_FILE.read_text(encoding="utf-8"))["juicios"]
    report = judgments.human_report(sample, given)
    auto, bonus = report["juez_auto"], report["refuerzo"]
    print(f"Pares juzgados: {report['juzgados']} de {len(sample)} (más {report['no_se']} «no sé»)")
    print(
        f"Juez automático vs juicio a mano: precisión {auto['precision']} · recall {auto['recall']}"
        f" · acuerdo {auto['acuerdo']}"
    )
    for side, label in (("solo_con_refuerzo", "solo con refuerzo"), ("solo_sin_refuerzo", "solo sin refuerzo")):
        print(f"Ítems que aparecen {label}: {bonus[side]['n']}, relevantes {bonus[side]['relevantes']}")


def cmd_purge(conn, args) -> None:
    from .events.store import QUERY_RETENTION_DAYS, purge_old_queries

    n = purge_old_queries(conn, args.dias or QUERY_RETENTION_DAYS)
    conn.commit()
    print(f"Consultas de más de {args.dias or QUERY_RETENTION_DAYS} días borradas: {n}")


def cmd_synth(conn, args) -> None:
    from datetime import date

    from .analytics.queries import learn_edges
    from .events.synth import generate

    until = date.fromisoformat(args.hasta) if args.hasta else None
    print(generate(conn, users=args.usuarios, weeks=args.semanas, seed=args.semilla, until=until))
    print(f"Aristas aprendidas (simuladas, el agente no las usa): {learn_edges(conn, 'synthetic')}")


def cmd_analytics(conn, args) -> None:
    import json

    from .analytics import queries

    report = {
        "kpis": queries.kpis(conn, args.fuente),
        "oportunidades": queries.opportunities(conn, args.fuente)[:8],
        "tendencias": queries.trends(conn, args.fuente)[:8],
        "retencion_multi_vertical": queries.multi_vertical_retention(conn, args.fuente),
        "sugerencias": queries.suggestions(conn, args.fuente)[:8],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2, default=str))


def cmd_multivertical(conn, args) -> None:
    from pathlib import Path

    from .analytics import multivertical

    path = Path(args.salida) if args.salida else multivertical.OUTPUT
    data = multivertical.write(conn, path)
    print(f"Mapa multivertical: {len(data['concepts'])} conceptos, {len(data['shared'])} pares de verticales → {path}")


COMMANDS = {
    "multivertical": cmd_multivertical,
    "synth": cmd_synth,
    "purge": cmd_purge,
    "analytics": cmd_analytics,
    "migrate": cmd_migrate,
    "concepts": cmd_concepts,
    "map-categories": cmd_map_categories,
    "embed-text": cmd_embed_text,
    "embed-images": cmd_embed_images,
    "search": cmd_search,
    "eval-search": cmd_eval_search,
    "eval-sample": cmd_eval_sample,
    "eval-human": cmd_eval_human,
}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="rappi-ia", description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="log detallado")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("migrate", help="aplica migraciones pendientes (las de rappi-scraper)")
    concepts = sub.add_parser("concepts", help="capa 2: conceptos, complementos y mapeo de productos y platos")
    concepts.add_argument("--solo-reporte", action="store_true", help="solo muestra la cobertura actual")
    concepts.add_argument("--sin-knn", action="store_true", help="sin refinar con vecinos cercanos (embeddings)")
    sub.add_parser(
        "map-categories", help="exporta las categorías sin mapeo revisado, con concepto sugerido, a un CSV para revisar"
    )
    embed = sub.add_parser("embed-text", help="embeddings de texto de search_documents (incremental)")
    embed.add_argument("--limit", type=int, help="máximo de textos nuevos (para probar)")
    images = sub.add_parser("embed-images", help="embeddings CLIP de fotos de productos y platos")
    images.add_argument("--limit", type=int)
    images.add_argument("--vertical")
    images.add_argument(
        "--forzar", action="store_true", help="correr aunque el scraper esté descargando (solo pruebas)"
    )
    search = sub.add_parser("search", help="búsqueda híbrida dentro de un vertical")
    search.add_argument("query")
    search.add_argument("--vertical", required=True)
    search.add_argument("--modo", choices=MODES, default="hibrido")
    search.add_argument("--precio-max", type=float)
    search.add_argument("--limit", type=int, default=10)
    ev = sub.add_parser("eval-search", help="evalúa la búsqueda con el set de src/rappi_ia/eval/queries.json")
    ev.add_argument("--solo-lexico", action="store_true", help="sin modelo de embeddings")
    ev.add_argument("--guardar-tau", action="store_true", help="guarda los τ calibrados en eval/thresholds.json")
    sub.add_parser("eval-sample", help="muestra de ~200 pares (consulta, producto) para juzgar a mano")
    sub.add_parser("eval-human", help="juez automático y refuerzo por concepto contra los juicios a mano")
    synth = sub.add_parser("synth", help="genera usuarios y eventos SIMULADOS (source = synthetic)")
    synth.add_argument("--usuarios", type=int, default=1500)
    synth.add_argument("--semanas", type=int, default=26)
    synth.add_argument("--semilla", type=int, default=7)
    synth.add_argument("--hasta", help="fecha final AAAA-MM-DD (por defecto hoy)")
    purge = sub.add_parser("purge", help="borra el texto de consultas más antiguas que la retención (90 días)")
    purge.add_argument("--dias", type=int)
    mv = sub.add_parser(
        "multivertical", help="mapa de productos y conceptos compartidos entre verticales (presentación)"
    )
    mv.add_argument("--salida", help="archivo HTML (por defecto dashboard-empresa/public/presentacion/)")
    analytics = sub.add_parser("analytics", help="resumen de métricas del panel")
    analytics.add_argument("--fuente", choices=("synthetic", "prototype"), default="synthetic")
    return parser


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )
    try:
        with connect() as conn:
            COMMANDS[args.command](conn, args)
    except KeyboardInterrupt:
        log.warning("Interrumpido.")
        sys.exit(130)
