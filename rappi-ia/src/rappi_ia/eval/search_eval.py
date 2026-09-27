"""Evaluación de la búsqueda por vertical: léxico vs vectorial vs híbrido, y calibración de τ ("sin resultado").

Relevancia: un resultado es relevante si su concepto (item_concepts) está entre los esperados de la consulta.
Es una etiqueta automática y ruidosa (depende de la precisión de la capa 2), pero es la misma para los tres
modos, así que la comparación es justa. Métricas: P@10, MRR y nDCG@10 (ganancia binaria).
"""

import json
import math
from dataclasses import dataclass
from pathlib import Path

from psycopg import Connection

from ..embeddings.base import TextEmbedder
from ..retrieval.hybrid import DEFAULT_TAU, MODES, THRESHOLDS_FILE, retrieve

QUERIES_FILE = Path(__file__).resolve().parent / "queries.json"
K = 10
MIN_UNMET_PRECISION = 0.9  # "sin resultado" debe acertar al menos 9 de cada 10 veces (docs/diseno-ia.md §1)


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


def load_queries(path: Path = QUERIES_FILE) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))["queries"]


def run_queries(conn: Connection, embedder: TextEmbedder | None, queries: list[dict]) -> list[QueryRun]:
    runs = []
    for q in queries:
        for mode in MODES:
            if mode != "lexico" and embedder is None:
                continue
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
    for mode in MODES:
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


def calibrate_tau(runs: list[QueryRun], candidates=None) -> dict[str, float]:
    """τ por vertical: el mayor umbral cuya regla 'sin resultado' tenga precisión ≥ 0,9, maximizando recall.

    Usa los datos del modo híbrido. Si un vertical no tiene negativas, conserva el τ por defecto.
    """
    candidates = candidates or [round(0.70 + 0.01 * i, 2) for i in range(26)]
    hybrid = [r for r in runs if r.mode == "hibrido"]
    taus = {}
    for vertical in sorted({r.vertical for r in hybrid}):
        rows = [r for r in hybrid if r.vertical == vertical]
        if not any(r.tipo == "negativa" for r in rows):
            continue
        best = (DEFAULT_TAU, -1.0)
        for tau in candidates:
            predicted = [_is_unmet(r, tau) for r in rows]
            actual = [r.tipo == "negativa" for r in rows]
            tp = sum(p and a for p, a in zip(predicted, actual, strict=True))
            fp = sum(p and not a for p, a in zip(predicted, actual, strict=True))
            precision = tp / (tp + fp) if tp + fp else 1.0
            recall = tp / sum(actual)
            if precision >= MIN_UNMET_PRECISION and recall > best[1]:
                best = (tau, recall)
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
    }


def save_thresholds(taus: dict[str, float], path: Path = THRESHOLDS_FILE) -> None:
    path.write_text(json.dumps(taus, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def render_markdown(summary: dict, unmet: dict, taus: dict[str, float], model: str | None) -> str:
    lines = [
        f"# Evaluación de búsqueda ({model or 'solo léxico'})",
        "",
        "| Modo | P@10 | MRR | nDCG@10 | n |",
        "|---|---|---|---|---|",
    ]
    for mode, data in summary.items():
        t = data["total"]
        lines.append(f"| {mode} | {t['p@10']} | {t['mrr']} | {t['ndcg@10']} | {t['n']} |")
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
        f"τ calibrado por vertical: {json.dumps(taus, ensure_ascii=False)}",
        "",
        f"Negativas: {unmet['negativas']} · detectadas: {unmet['detectadas']}"
        f" · falsas alarmas: {unmet['falsas_alarmas']} · precisión: {unmet['precision']} · recall: {unmet['recall']}",
    ]
    if unmet["no_detectadas_detalle"]:
        lines.append(f"- No detectadas: {', '.join(unmet['no_detectadas_detalle'])}")
    if unmet["falsas_alarmas_detalle"]:
        lines.append(f"- Falsas alarmas: {', '.join(unmet['falsas_alarmas_detalle'])}")
    return "\n".join(lines) + "\n"


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
