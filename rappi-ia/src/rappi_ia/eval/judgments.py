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


def save_sample(sample: list[dict], path: Path = SAMPLE_FILE) -> None:
    data = {
        "nota": "Pares (consulta, producto) para juzgar a mano; ver src/rappi_ia/eval/judgments.py.",
        "pares": sample,
    }
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
