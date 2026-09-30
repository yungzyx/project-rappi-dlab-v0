"""Muestra de pares (consulta, producto) para juzgar a mano: el juez independiente que le falta a la evaluación.

La relevancia automática usa el mismo concepto con que el híbrido refuerza sus resultados, así que no puede decir si
el refuerzo mejora. La muestra prioriza los ítems que aparecen en el top 10 del híbrido con refuerzo o sin él, pero no
en ambos (responden esa pregunta), y completa con pares al azar de todos los modos (miden el error del juez
automático). Semilla fija y archivo versionado: el catálogo cambia cada semana, la muestra no.
"""

import json
import random
from pathlib import Path

from .search_eval import ABLATION, QueryRun

SAMPLE_FILE = Path(__file__).resolve().parent / "judgments-sample.json"
# Juicios a mano: {"juicios": {id de par: "relevante" | "no" | "nose"}}, copiados de la página de juicio.
JUDGMENTS_FILE = Path(__file__).resolve().parent / "judgments.json"
DIFF_PAIRS = 120
RANDOM_PAIRS = 80


def build_sample(
    runs: list[QueryRun], n_diff: int = DIFF_PAIRS, n_random: int = RANDOM_PAIRS, seed: int = 7
) -> list[dict]:
    pairs: dict[tuple, dict] = {}
    for run in runs:
        if run.tipo == "negativa":
            continue
        for item, relevant in zip(run.items, run.relevance, strict=True):
            key = (run.vertical, run.query, item["entity_type"], item["entity_id"])
            pair = pairs.setdefault(
                key,
                {
                    "id": "|".join(key),
                    "vertical": run.vertical,
                    "consulta": run.query,
                    "tipo": run.tipo,
                    "entity_type": item["entity_type"],
                    "entity_id": item["entity_id"],
                    "texto": item["texto"],
                    "concepto_auto": item["concepto"],
                    "relevante_auto": bool(relevant),
                    "modos": [],
                },
            )
            pair["modos"].append(run.mode)

    def only_one_hybrid(pair: dict) -> bool:
        return ("hibrido" in pair["modos"]) != (ABLATION in pair["modos"])

    rng = random.Random(seed)
    keys = sorted(pairs)
    diff_keys = [k for k in keys if only_one_hybrid(pairs[k])]
    chosen = rng.sample(diff_keys, min(n_diff, len(diff_keys)))
    rest = [k for k in keys if k not in set(chosen)]
    extra = rng.sample(rest, min(n_random, len(rest)))
    sample = [{**pairs[k], "origen": "diferencia"} for k in chosen] + [{**pairs[k], "origen": "al_azar"} for k in extra]
    return sorted(sample, key=lambda p: (p["vertical"], p["consulta"], p["id"]))


def human_report(sample: list[dict], judgments: dict[str, str]) -> dict:
    """Con los juicios a mano (`relevante`, `no`, `nose` por id de par): cuánto acierta el juez automático y si los
    ítems que solo trae el refuerzo por concepto son relevantes más o menos seguido que los que solo trae sin él."""
    judged = [(p, judgments[p["id"]] == "relevante") for p in sample if judgments.get(p["id"]) in ("relevante", "no")]
    tp = sum(p["relevante_auto"] and human for p, human in judged)
    fp = sum(p["relevante_auto"] and not human for p, human in judged)
    fn = sum(not p["relevante_auto"] and human for p, human in judged)
    tn = sum(not p["relevante_auto"] and not human for p, human in judged)

    def share(rows: list[bool]) -> dict:
        return {"n": len(rows), "relevantes": round(sum(rows) / len(rows), 3) if rows else None}

    with_bonus = [human for p, human in judged if "hibrido" in p["modos"] and ABLATION not in p["modos"]]
    without_bonus = [human for p, human in judged if ABLATION in p["modos"] and "hibrido" not in p["modos"]]
    return {
        "juzgados": len(judged),
        "no_se": sum(judgments.get(p["id"]) == "nose" for p in sample),
        "juez_auto": {
            "precision": round(tp / (tp + fp), 3) if tp + fp else None,
            "recall": round(tp / (tp + fn), 3) if tp + fn else None,
            "acuerdo": round((tp + tn) / len(judged), 3) if judged else None,
        },
        "refuerzo": {"solo_con_refuerzo": share(with_bonus), "solo_sin_refuerzo": share(without_bonus)},
    }


def save_sample(sample: list[dict], path: Path = SAMPLE_FILE) -> None:
    data = {
        "nota": "Pares (consulta, producto) para juzgar a mano; ver src/rappi_ia/eval/judgments.py.",
        "pares": sample,
    }
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
