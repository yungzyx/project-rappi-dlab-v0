"""Evaluación de la búsqueda por vertical: léxico vs vectorial vs híbrido, y calibración de τ ("sin resultado").

Relevancia: un resultado es relevante si su concepto (item_concepts) está entre los esperados de la consulta.
Es una etiqueta automática y ruidosa (depende de la precisión de la capa 2), pero es la misma para los tres
modos, así que la comparación es justa. Métricas: P@10, MRR y nDCG@10 (ganancia binaria).
"""

import json
import math
import random
from dataclasses import dataclass, field
from pathlib import Path

from psycopg import Connection

from ..embeddings.base import TextEmbedder
from ..retrieval.hybrid import DEFAULT_TAU, MODES, THRESHOLDS_FILE, retrieve

QUERIES_FILE = Path(__file__).resolve().parent / "queries.json"
K = 10
MIN_UNMET_PRECISION = 0.9  # "sin resultado" debe acertar al menos 9 de cada 10 veces (docs/diseno-ia.md §1)
STALE_STRICT_MATCHES = 3  # una negativa con tantos productos que calzan todas sus palabras quizás ya no lo es
# Híbrido sin el refuerzo por concepto: el refuerzo reordena con la misma etiqueta (item_concepts) con que se juzga la
# relevancia, así que infla al híbrido. Esta fila mide cuánto aporta la fusión léxico + vector por sí sola.
ABLATION = "hibrido_sin_refuerzo"
EVAL_MODES = (*MODES, ABLATION)
COMPARISONS = [("hibrido", "vector"), ("hibrido", "lexico"), (ABLATION, "vector"), ("hibrido", ABLATION)]
BOOTSTRAP_RESAMPLES = 2000


@dataclass
class QueryRun:
    vertical: str
    query: str
    tipo: str
    mode: str
    relevance: list[int]
    strict_lexical: int
    max_cosine: float | None
    concept_in_vertical: bool
    names_concept: bool = False
    items: list[dict] = field(default_factory=list)  # los resultados (tipo, id, texto, concepto): muestra de juicio


def load_queries(path: Path = QUERIES_FILE) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["queries"]


def run_queries(conn: Connection, embedder: TextEmbedder | None, queries: list[dict]) -> list[QueryRun]:
    runs = []
    for q in queries:
        for mode in EVAL_MODES:
            if mode != "lexico" and embedder is None:
                continue
            if mode == ABLATION:
                result = retrieve(conn, q["vertical"], q["query"], embedder, k=K, mode="hibrido", concepts=[])
            else:
                result = retrieve(conn, q["vertical"], q["query"], embedder, k=K, mode=mode)
            expected = set(q["concepts"])
            relevance = [1 if h.concept_id in expected else 0 for h in result.hits]
            runs.append(
                QueryRun(
                    q["vertical"],
                    q["query"],
                    q["tipo"],
                    mode,
                    relevance,
                    result.strict_lexical_matches,
                    result.max_cosine,
                    result.concept_in_vertical,
                    bool(result.query_concepts),
                    [
                        {
                            "entity_type": h.entity_type,
                            "entity_id": h.entity_id,
                            "texto": h.content,
                            "concepto": h.concept_id,
                        }
                        for h in result.hits
                    ],
                )
            )
    return runs


def precision_at_k(relevance: list[int], k: int = K) -> float:
    return sum(relevance[:k]) / k


def reciprocal_rank(relevance: list[int]) -> float:
    return next((1 / (i + 1) for i, rel in enumerate(relevance) if rel), 0.0)


def ndcg_at_k(relevance: list[int], k: int = K, available: int = K) -> float:
    """`available`: relevantes que existen en el vertical (por defecto se asume que hay al menos k)."""
    dcg = sum(rel / math.log2(i + 2) for i, rel in enumerate(relevance[:k]))
    ideal = sum(1 / math.log2(i + 2) for i in range(min(k, available)))
    return dcg / ideal if ideal else 0.0


def summarize(runs: list[QueryRun]) -> dict:
    """Promedios por modo (total, por tipo y por vertical) sobre consultas positivas."""
    summary: dict = {}
    for mode in EVAL_MODES:
        positives = [r for r in runs if r.mode == mode and r.tipo != "negativa"]
        if not positives:
            continue
        summary[mode] = {
            "total": _means(positives),
            "por_tipo": {t: _means([r for r in positives if r.tipo == t]) for t in sorted({r.tipo for r in positives})},
            "por_vertical": {
                v: _means([r for r in positives if r.vertical == v]) for v in sorted({r.vertical for r in positives})
            },
        }
    return summary


def paired_comparison(runs: list[QueryRun], a: str, b: str, seed: int = 7) -> dict:
    """nDCG@10 de `a` contra `b` consulta por consulta (positivas): victorias, empates, derrotas y la diferencia
    media con su intervalo de confianza del 95 % por bootstrap (semilla fija: el reporte es reproducible)."""
    by_mode = {
        mode: {(r.vertical, r.query): ndcg_at_k(r.relevance) for r in runs if r.mode == mode and r.tipo != "negativa"}
        for mode in (a, b)
    }
    keys = sorted(by_mode[a].keys() & by_mode[b].keys())
    diffs = [by_mode[a][key] - by_mode[b][key] for key in keys]
    rng = random.Random(seed)
    means = (
        sorted(sum(rng.choices(diffs, k=len(diffs))) / len(diffs) for _ in range(BOOTSTRAP_RESAMPLES)) if diffs else []
    )
    return {
        "a": a,
        "b": b,
        "n": len(diffs),
        "gana": sum(d > 1e-9 for d in diffs),
        "empata": sum(abs(d) <= 1e-9 for d in diffs),
        "pierde": sum(d < -1e-9 for d in diffs),
        "diferencia": round(sum(diffs) / len(diffs), 3) if diffs else None,
        "ic95": (round(means[int(0.025 * len(means))], 3), round(means[int(0.975 * len(means)) - 1], 3))
        if means
        else None,
    }


def compare_modes(runs: list[QueryRun]) -> list[dict]:
    present = {r.mode for r in runs}
    return [paired_comparison(runs, a, b) for a, b in COMPARISONS if a in present and b in present]


def calibrate_tau(runs: list[QueryRun], candidates=None) -> dict[str, float]:
    """τ por vertical: el que maximiza el recall de 'sin resultado' con precisión ≥ 0,9 (modo híbrido).

    Solo cuentan las negativas que dependen de τ (sin coincidencia léxica estricta ni concepto nombrado): las demás
    dan el mismo recall con cualquier τ. Un vertical sin esas negativas, o donde ningún τ detecta alguna, no recibe
    propuesta. Ante un empate gana el τ más bajo: el más prudente con las consultas que no están en el set.
    """
    candidates = candidates or [round(0.70 + 0.01 * i, 2) for i in range(26)]
    hybrid = [r for r in runs if r.mode == "hibrido"]
    taus = {}
    for vertical in sorted({r.vertical for r in hybrid}):
        rows = [r for r in hybrid if r.vertical == vertical and r.strict_lexical == 0 and not r.names_concept]
        actual = [r.tipo == "negativa" for r in rows]
        if not any(actual):
            continue
        best = (None, 0.0)
        for tau in candidates:
            predicted = [_is_unmet(r, tau) for r in rows]
            tp = sum(p and a for p, a in zip(predicted, actual, strict=True))
            fp = sum(p and not a for p, a in zip(predicted, actual, strict=True))
            precision = tp / (tp + fp) if tp + fp else 1.0
            recall = tp / sum(actual)
            if precision >= MIN_UNMET_PRECISION and recall > best[1]:
                best = (tau, recall)
        if best[0] is not None:
            taus[vertical] = best[0]
    return taus


def unmet_quality(runs: list[QueryRun], taus: dict[str, float]) -> dict:
    hybrid = [r for r in runs if r.mode == "hibrido"]
    predicted = [_is_unmet(r, taus.get(r.vertical, DEFAULT_TAU)) for r in hybrid]
    actual = [r.tipo == "negativa" for r in hybrid]
    tp = sum(p and a for p, a in zip(predicted, actual, strict=True))
    fp = sum(p and not a for p, a in zip(predicted, actual, strict=True))
    fn = sum(a and not p for p, a in zip(predicted, actual, strict=True))
    return {
        "negativas": sum(actual),
        "detectadas": tp,
        "falsas_alarmas": fp,
        "no_detectadas": fn,
        "precision": round(tp / (tp + fp), 3) if tp + fp else None,
        "recall": round(tp / (tp + fn), 3) if tp + fn else None,
        "no_detectadas_detalle": [
            f"{r.vertical}: {r.query}" for r, p, a in zip(hybrid, predicted, actual, strict=True) if a and not p
        ],
        "falsas_alarmas_detalle": [
            f"{r.vertical}: {r.query}" for r, p, a in zip(hybrid, predicted, actual, strict=True) if p and not a
        ],
        "negativas_detalle": negative_diagnosis(runs, taus),
    }


def thresholds_after_saving(current: dict[str, float], proposed: dict[str, float]) -> dict[str, float]:
    """Los propuestos reemplazan a los vigentes; un vertical sin propuesta no tiene evidencia para cambiar y conserva
    el suyo (pasarlo al τ por defecto metía falsas alarmas, p. ej. «regalo para mi polola» en Mall)."""
    return {**current, **proposed}


def save_thresholds(taus: dict[str, float], path: Path = THRESHOLDS_FILE) -> None:
    path.write_text(json.dumps(taus, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def render_markdown(
    summary: dict,
    unmet: dict,
    current: dict[str, float],
    proposed: dict[str, float],
    saved: bool,
    model: str | None,
    comparisons: list[dict] = (),
) -> str:
    """`current`: τ vigentes antes de esta evaluación; `unmet` se mide con los propuestos solo si se guardaron."""
    lines = [
        f"# Evaluación de búsqueda ({model or 'solo léxico'})",
        "",
        "| Modo | P@10 | MRR | nDCG@10 | n |",
        "|---|---|---|---|---|",
    ]
    for mode, data in summary.items():
        t = data["total"]
        lines.append(f"| {mode} | {t['p@10']} | {t['mrr']} | {t['ndcg@10']} | {t['n']} |")
    if ABLATION in summary:
        lines += [
            "",
            f"`{ABLATION}`: el híbrido sin el refuerzo por concepto. El refuerzo reordena con la misma etiqueta con"
            " que se juzga la relevancia, así que esta fila es la medida justa de la fusión léxico + vector.",
        ]
    if comparisons:
        lines += [
            "",
            "## Comparación pareada (nDCG@10 consulta por consulta)",
            "",
            "| Comparación | Gana | Empata | Pierde | Diferencia media | IC 95 % (bootstrap) |",
            "|---|---|---|---|---|---|",
        ]
        for c in comparisons:
            low, high = c["ic95"] or ("-", "-")
            counts = f"{c['gana']} | {c['empata']} | {c['pierde']}"
            lines.append(f"| {c['a']} vs {c['b']} | {counts} | {c['diferencia']} | {low} a {high} |")
        lines += ["", "Si el intervalo incluye el 0, la diferencia no es concluyente con este set de consultas."]
    lines += [
        "",
        "## Por tipo de consulta (nDCG@10)",
        "",
        "| Tipo | " + " | ".join(summary) + " |",
        "|---|" + "---|" * len(summary),
    ]
    tipos = sorted({t for data in summary.values() for t in data["por_tipo"]})
    for tipo in tipos:
        cells = [str(summary[m]["por_tipo"].get(tipo, {}).get("ndcg@10", "-")) for m in summary]
        lines.append(f"| {tipo} | " + " | ".join(cells) + " |")
    lines += [
        "",
        "## Por vertical (nDCG@10)",
        "",
        "| Vertical | " + " | ".join(summary) + " |",
        "|---|" + "---|" * len(summary),
    ]
    verticals = sorted({v for data in summary.values() for v in data["por_vertical"]})
    for vertical in verticals:
        cells = [str(summary[m]["por_vertical"].get(vertical, {}).get("ndcg@10", "-")) for m in summary]
        lines.append(f"| {vertical} | " + " | ".join(cells) + " |")
    lines += [
        "",
        "## Sin resultado (demanda no satisfecha)",
        "",
        f"Umbral τ por vertical (sin τ propio rige {DEFAULT_TAU}):",
        "",
        "| Vertical | τ vigente | τ propuesto |",
        "|---|---|---|",
    ]
    for vertical in sorted(current.keys() | proposed.keys()):
        suggestion = proposed.get(vertical, "sin propuesta")
        lines.append(f"| {vertical} | {current.get(vertical, '-')} | {suggestion} |")
    lines += [
        "",
        "Sin propuesta: el vertical no tiene negativas que dependan de τ (todas cortan por coincidencia léxica o por"
        " concepto nombrado), o ningún τ entre 0,70 y 0,95 las detecta con precisión ≥ 0,9. Un vertical sin propuesta,"
        " al guardar, conserva su τ vigente.",
        "",
        "Calidad medida con los τ guardados en eval/thresholds.json (propuestos, y vigentes donde no hay propuesta):"
        if saved
        else "Calidad medida con los τ vigentes (los propuestos no se guardaron):",
        "",
        f"Negativas: {unmet['negativas']} · detectadas: {unmet['detectadas']}"
        f" · falsas alarmas: {unmet['falsas_alarmas']} · precisión: {unmet['precision']} · recall: {unmet['recall']}",
    ]
    if unmet["falsas_alarmas_detalle"]:
        lines.append(f"- Falsas alarmas: {', '.join(unmet['falsas_alarmas_detalle'])}")
    if unmet["negativas_detalle"]:
        lines += [
            "",
            "### Por qué se detecta o no cada negativa",
            "",
            "| Vertical | Consulta | ¿Detectada? | Causa |",
            "|---|---|---|---|",
        ]
        for row in unmet["negativas_detalle"]:
            cause = row["causa"] + (" · ⚠ posiblemente desactualizada" if row["desactualizada"] else "")
            lines.append(f"| {row['vertical']} | {row['consulta']} | {'sí' if row['detectada'] else 'no'} | {cause} |")
        lines += [
            "",
            f"Posiblemente desactualizada: {STALE_STRICT_MATCHES} o más productos calzan todas las palabras; el"
            " catálogo quizás ya lo tiene y la consulta dejó de ser negativa.",
        ]
    return "\n".join(lines) + "\n"


def negative_diagnosis(runs: list[QueryRun], taus: dict[str, float]) -> list[dict]:
    """Por cada negativa (modo híbrido): si «sin resultado» la detecta y qué lo decidió, con la misma regla que
    `_is_unmet`."""
    rows = []
    for r in (r for r in runs if r.mode == "hibrido" and r.tipo == "negativa"):
        tau = taus.get(r.vertical, DEFAULT_TAU)
        if r.strict_lexical > 0:
            n = r.strict_lexical
            cause = f"{n} {'coincidencia léxica estricta' if n == 1 else 'coincidencias léxicas estrictas'}"
        elif r.names_concept:
            cause = f"el concepto nombrado {'está' if r.concept_in_vertical else 'no está'} en el vertical"
        elif r.max_cosine is None:
            cause = "sin coseno (sin embeddings)"
        else:
            cause = f"coseno {r.max_cosine:.3f} {'<' if r.max_cosine < tau else '≥'} τ {tau}"
        rows.append(
            {
                "vertical": r.vertical,
                "consulta": r.query,
                "detectada": _is_unmet(r, tau),
                "causa": cause,
                "desactualizada": r.strict_lexical >= STALE_STRICT_MATCHES,
            }
        )
    return rows


def _is_unmet(run: QueryRun, tau: float) -> bool:
    """Misma regla que retrieval.hybrid._unmet, con τ variable para calibrar."""
    if run.strict_lexical > 0:
        return False
    if run.names_concept:
        return not run.concept_in_vertical
    return run.max_cosine is None or run.max_cosine < tau


def _means(runs: list[QueryRun]) -> dict:
    n = len(runs)
    return {
        "n": n,
        "p@10": round(sum(precision_at_k(r.relevance) for r in runs) / n, 3),
        "mrr": round(sum(reciprocal_rank(r.relevance) for r in runs) / n, 3),
        "ndcg@10": round(sum(ndcg_at_k(r.relevance) for r in runs) / n, 3),
    }
