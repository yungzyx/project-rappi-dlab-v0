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
    rappi-ia multivertical           # mapa multivertical (docs/mapas/)
    rappi-ia seed-demo               # catálogo de prueba inventado, SOLO en la base DATABASE_URL_TEST (_test)
    rappi-ia doctor                  # revisa (solo lectura) que DATABASE_URL tenga catálogo; sale 1 si no
    rappi-ia check-migrations        # se niega a migrar la base real desde una rama sin fusionar (MIGRATE=1 lo fuerza)
"""

import argparse
import logging
import os
import sys

from . import config
from .concepts.pipeline import build_concepts
from .concepts.report import coverage_report, render_text, write_category_proposals
from .db import connect, database_url, migrate
from .demo.doctor import check_database, check_pending_migrations
from .demo.seed import ensure_test_database, reset_test_database, seed_demo
from .layers.attributes import build_attributes
from .layers.brands import build_brands
from .layers.canonical import build_canonical
from .layers.graph import build_relations
from .layers.measures import build_measures
from .layers.report import layer_report
from .layers.segments import build_segments
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


def cmd_attributes(conn, args) -> None:
    print(build_attributes(conn))


def cmd_layer_report(conn, args) -> None:
    out = config.DATA_DIR / "eval" / "capas.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(layer_report(conn, args.muestra), encoding="utf-8")
    print(f"Reporte en {out}")


def cmd_canonical(conn, args) -> None:
    print(build_canonical(conn))


def cmd_relations(conn, args) -> None:
    print(build_relations(conn))


def cmd_layer_sample(conn, args) -> None:
    from .layers import quality

    versioned = quality.sample_file(args.seed)
    if versioned.exists() and not args.force:
        raise SystemExit(f"{versioned} ya existe y tiene juicios asociados; usa --force para reemplazarla.")
    sample = quality.build_quality_sample(conn, args.seed)
    quality.save_sample(sample, versioned, quality.local_sample_file(args.seed))
    kinds = {k: sum(r["kind"] == k for r in sample) for k in ("atributo", "marca", "concepto")}
    print(f"{len(sample)} afirmaciones ({kinds}) en {versioned}")
    print(f"Textos para juzgar (fuera de git): {quality.local_sample_file(args.seed)}")


def cmd_layer_precision(conn, args) -> None:
    import json

    from .layers import quality

    judged = quality.judgments_file(args.seed)
    if not judged.exists():
        raise SystemExit(f"Todavía no hay juicios ({judged} no existe).")
    sample = quality.with_names(conn, json.loads(quality.sample_file(args.seed).read_text(encoding="utf-8"))["filas"])
    given = json.loads(judged.read_text(encoding="utf-8"))
    text = quality.render_precision(quality.precision_report(sample, given["juicios"]), given["juez"])
    after = quality.after_changes(sample, given["juicios"], quality.still_asserted(conn, sample))
    text += "\n" + quality.render_after(after)
    out = config.DATA_DIR / "eval" / f"capas-precision{quality._suffix(args.seed)}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(text.split("## Reglas a revisar")[0])
    print(quality.render_after(after))
    print(f"Reporte en {out}")


def cmd_segments(conn, args) -> None:
    print(build_segments(conn, args.source, args.user))


def cmd_brands(conn, args) -> None:
    print(build_brands(conn))


def cmd_measures(conn, args) -> None:
    print(build_measures(conn))


def cmd_map_categories(conn, args) -> None:
    rows = coverage_report(conn)["categorias_sin_mapear"]
    out = config.DATA_DIR / "concepts" / "categorias-sin-mapear.csv"
    write_category_proposals(rows, out)
    print(f"{len(rows)} categorías sin mapeo revisado en {out}")
    print("Revisar cada fila, cambiar el método a «curado» y copiarla a src/rappi_ia/concepts/category_map.csv.")


def cmd_embed_text(conn, args) -> None:
    from .embeddings.models import text_embedder
    from .embeddings.text_store import ScrapeRunning, embed_search_documents, scrape_running

    if scrape_running(conn):  # antes de cargar el modelo
        log.error("Hay una corrida del scraper en curso: embed-text corre después (make post-refresh)")
        sys.exit(1)
    try:
        print(embed_search_documents(conn, text_embedder(), limit=args.limit))
    except ScrapeRunning as exc:
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


def cmd_seed_demo(conn, args) -> None:
    """Abre su propia conexión (`conn` llega vacío): solo DATABASE_URL_TEST, nunca la base real."""
    try:
        url = database_url("DATABASE_URL_TEST")
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from exc
    ensure_test_database(url)
    with connect(url) as test_conn:
        reset_test_database(test_conn)
        counts = seed_demo(test_conn)
    print(f"Catálogo de prueba listo: {sum(counts.values())} ítems en {len(counts)} verticales")


def cmd_doctor(conn, args) -> None:
    """Abre su propia conexión (`conn` llega vacío): así un Postgres caído da el mensaje, no un traceback."""
    try:
        url = database_url()
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from exc
    ready, message = check_database(url)
    print(message)
    if not ready:
        sys.exit(1)


def cmd_check_migrations(conn, args) -> None:
    """Va antes de `migrate` en `make mvp` y `make serve`. Abre su propia conexión (`conn` llega vacío)."""
    try:
        url = database_url()
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from exc
    allowed, message = check_pending_migrations(url, force=os.environ.get("MIGRATE") == "1")
    if not allowed:
        print(message, file=sys.stderr)
        sys.exit(1)
    if message:
        print(message)


# Comandos que no usan la conexión de DATABASE_URL (la abren ellos o usan otra).
OWN_CONNECTION = {"seed-demo", "doctor", "check-migrations"}

COMMANDS = {
    "check-migrations": cmd_check_migrations,
    "doctor": cmd_doctor,
    "seed-demo": cmd_seed_demo,
    "measures": cmd_measures,
    "brands": cmd_brands,
    "canonical": cmd_canonical,
    "relations": cmd_relations,
    "segments": cmd_segments,
    "layer-sample": cmd_layer_sample,
    "layer-precision": cmd_layer_precision,
    "layer-report": cmd_layer_report,
    "attributes": cmd_attributes,
    "multivertical": cmd_multivertical,
    "synth": cmd_synth,
    "purge": cmd_purge,
    "analytics": cmd_analytics,
    "migrate": cmd_migrate,
    "concepts": cmd_concepts,
    "map-categories": cmd_map_categories,
    "embed-text": cmd_embed_text,
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
    sub.add_parser("attributes", help="capa de perfiles: atributos de cada ítem (sin gluten, vegano, familiar…)")
    lr = sub.add_parser("layer-report", help="reporte de calidad de las capas de perfiles (data/eval/capas.md)")
    lr.add_argument("--muestra", type=int, default=20, help="ítems de muestra por atributo")
    sub.add_parser("brands", help="capa de perfiles: marca canónica de cada ítem (declarada o deducida del nombre)")
    sub.add_parser(
        "canonical", help="capa de perfiles: el mismo producto (marca + nombre + tamaño) entre ids y verticales"
    )
    sub.add_parser(
        "relations", help="capa de perfiles: grafo de conocimiento (sustituye, conflicto, tiene_atributo, co-búsqueda…)"
    )
    ls = sub.add_parser("layer-sample", help="capa de datos: muestra fija de afirmaciones (atributo, marca, concepto)")
    ls.add_argument("--seed", type=int, default=7, help="semilla (7 = la muestra original)")
    ls.add_argument("--force", action="store_true", help="reemplaza una muestra que ya existe")
    lp = sub.add_parser("layer-precision", help="capa de datos: precisión por regla según los juicios de la muestra")
    lp.add_argument("--seed", type=int, default=7, help="semilla de la muestra juzgada")
    sg = sub.add_parser("segments", help="capa de perfiles: segmentos de usuario por comportamiento (con historia)")
    sg.add_argument("--source", choices=["synthetic", "prototype"], default="synthetic")
    sg.add_argument("--user", help="recalcula solo a esta persona")
    sub.add_parser("measures", help="capa de perfiles: tamaño, unidad y pack normalizados de cada ítem")
    sub.add_parser(
        "map-categories", help="exporta las categorías sin mapeo revisado, con concepto sugerido, a un CSV para revisar"
    )
    embed = sub.add_parser("embed-text", help="embeddings de texto de search_documents (incremental)")
    embed.add_argument("--limit", type=int, help="máximo de textos nuevos (para probar)")
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
    mv.add_argument("--salida", help="archivo HTML (por defecto docs/mapas/)")
    analytics = sub.add_parser("analytics", help="resumen de métricas del panel")
    analytics.add_argument("--fuente", choices=("synthetic", "prototype"), default="synthetic")
    sub.add_parser(
        "seed-demo", help="reconstruye DATABASE_URL_TEST (debe terminar en _test) con un catálogo de prueba inventado"
    )
    sub.add_parser("doctor", help="revisa que la base (DATABASE_URL) tenga catálogo; no escribe nada")
    sub.add_parser(
        "check-migrations",
        help="se niega si la base rappi tiene migraciones pendientes y el código no está en origin/main (MIGRATE=1)",
    )
    return parser


def configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )
    # Las peticiones a huggingface.co al cargar un modelo (~20 por carga) tapaban los errores del log semanal.
    logging.getLogger("httpx").setLevel(logging.DEBUG if verbose else logging.WARNING)


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    configure_logging(args.verbose)
    try:
        if args.command in OWN_CONNECTION:
            COMMANDS[args.command](None, args)
        else:
            with connect() as conn:
                COMMANDS[args.command](conn, args)
    except KeyboardInterrupt:
        log.warning("Interrumpido.")
        sys.exit(130)
