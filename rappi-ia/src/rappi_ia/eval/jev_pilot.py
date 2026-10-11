"""Piloto de Jev: mide los dos roles contra las planillas juzgadas a mano y propone (o no) adoptarlos.

- Rol A (categorías): Jev etiqueta las categorías de `planilla-categorias.csv` con las instrucciones en español y en
  inglés (mismas opciones). Para cada umbral T de `THRESHOLDS`, con la tabla de decisión de `jev_map.decide`:
  - precisión: de las categorías que Jev mapea (confianza ≥ T), las que coinciden con el concepto de la persona
    (si la persona puso «ninguno», mapear es un error);
  - cobertura: de las categorías del grupo «sin mapear», las que Jev mapea;
  - acuerdo con el control: de las categorías del grupo «acuerdo» que Jev mapea, las que coinciden con el concepto en
    que ya coincidían los dos mapeadores;
  - sensibles: categorías que la persona dio por sensibles o +18 y Jev mapea solo a un concepto que no lo es.
  `T_auto` es el menor T que cumple los cuatro criterios; una variante pasa si tiene `T_auto`.
- Rol B (juez): Jev juzga los pares de `planilla-busqueda.csv` (con caché en `eval_judgments`). κ binario «sirve»
  contra el resto, como el juez por concepto: Jev dice «sirve» con ganancia esperada ≥ ¾ (`jev_level`). Se adopta si
  κ(Jev, personas) ≥ 0,6 y supera a κ(juez por concepto, personas) en los mismos pares. El κ ponderado de tres
  niveles se informa, no decide.

Escribe `data/eval/jev-piloto.md` y `eval/jev-adopcion.propuesta.json`. La propuesta no adopta nada: la persona la
renombra a `jev-adopcion.json` y la sube a git.
"""

import json
from collections import Counter
from datetime import date
from pathlib import Path

from psycopg import Connection

from .. import config
from ..concepts.jev_map import build_questions, decide
from ..concepts.taxonomy import Taxonomy
from ..jev import ADOPTION_FILE, DEFAULT_T_AUTO, VARIANTS
from . import sheets
from .judge import JevJudgment, judge_pairs
from .judgments import sheet_report

THRESHOLDS = tuple(round(0.6 + 0.05 * i, 2) for i in range(8))  # 0,60 … 0,95
MIN_PRECISION = 0.9
MIN_COVERAGE = 0.5
MIN_CONTROL = 0.9
MIN_KAPPA = 0.6
REPORT_NAME = "jev-piloto.md"
PROPOSAL_FILE = ADOPTION_FILE.with_name("jev-adopcion.propuesta.json")
VARIANT_NAMES = {"es": "español", "en": "inglés"}


# --- requisitos y lectura --------------------------------------------------------------------------------------------


def requirements(has_key: bool, sheet_dir: Path | None = None, ids_dir: Path | None = None) -> list[str]:
    """Lo que falta para correr el piloto, en palabras de la persona; vacío si está todo."""
    sheet_dir, ids_dir = sheet_dir or sheets.sheet_dir(), ids_dir or sheets.EVAL_DIR
    missing = [] if has_key else ["la clave de Jev: TYPESAFE_API_KEY en rappi-ia/.env"]
    for sheet, ids_file, read in (
        (sheets.CATEGORY_SHEET, sheets.CATEGORY_IDS_FILE.name, _category_judgments),
        (sheets.SEARCH_SHEET, sheets.SEARCH_IDS_FILE.name, _search_judgments),
    ):
        if not (ids_dir / ids_file).exists() or not (sheet_dir / sheet).exists():
            missing.append(f"{sheet} juzgada: genera las planillas con `rappi-ia jev-planillas` y llénalas")
            continue
        counts: Counter = Counter()
        keys, judged = read(sheet_dir, ids_dir, counts)
        left = [key for key in keys if key not in judged]
        if left:
            missing.append(
                f"{sheet}: faltan {len(left)} de {len(keys)} por juzgar"
                f" ({counts['vacias']} vacías, {counts['invalidas']} inválidas)"
            )
    return missing


def _category_judgments(sheet_dir: Path, ids_dir: Path, counts: Counter) -> tuple[list[str], dict[str, str]]:
    keys = [row["clave"] for row in _ids(ids_dir / sheets.CATEGORY_IDS_FILE.name, "categorias")]
    return keys, sheets.read_category_sheet(sheet_dir / sheets.CATEGORY_SHEET, counts)


def _search_judgments(sheet_dir: Path, ids_dir: Path, counts: Counter) -> tuple[list[str], dict[str, int]]:
    keys = [row["id"] for row in _ids(ids_dir / sheets.SEARCH_IDS_FILE.name, "pares")]
    return keys, sheets.read_search_sheet(sheet_dir / sheets.SEARCH_SHEET, counts)


def _ids(path: Path, key: str) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))[key]


def load_category_rows(sheet_dir: Path, ids_dir: Path) -> list[dict]:
    """Una fila por categoría de la planilla: su grupo, el concepto de control, el de la persona (o None) y el estado
    que ve Jev, armado con lo mismo que vio la persona (vertical, nombre y ejemplos de la planilla)."""
    path = sheet_dir / sheets.CATEGORY_SHEET
    human = sheets.read_category_sheet(path)
    texts = {row.get("categoria", "").strip().lower(): row for row in sheets._read_table(path)}
    rows = []
    for entry in _ids(ids_dir / sheets.CATEGORY_IDS_FILE.name, "categorias"):
        text = texts.get(entry["clave"])
        if text is None:
            continue
        examples = [e.strip() for e in text.get("ejemplos", "").split(" | ") if e.strip()]
        rows.append(
            {
                "clave": entry["clave"],
                "grupo": entry["grupo"],
                "control": entry["concepto_propuesto"] or None,
                "humano": human.get(entry["clave"]),
                "state": {"vertical": text.get("vertical", ""), "categoria": text["categoria"], "ejemplos": examples},
            }
        )
    return rows


def load_search_pairs(sheet_dir: Path, ids_dir: Path) -> tuple[list[dict], dict[str, int]]:
    """Los pares de la planilla con lo que `judge_pairs` necesita (de los ids versionados y del texto de la planilla)
    y el nivel que les dio la persona."""
    path = sheet_dir / sheets.SEARCH_SHEET
    human = sheets.read_search_sheet(path)
    texts = {row.get("id", "").strip(): row for row in sheets._read_table(path)}
    pairs = [
        {
            **entry,
            "nombre": texts.get(entry["id"], {}).get("nombre", ""),
            "tienda": texts.get(entry["id"], {}).get("tienda", ""),
        }
        for entry in _ids(ids_dir / sheets.SEARCH_IDS_FILE.name, "pares")
    ]
    return pairs, human


# --- rol A: categorías -----------------------------------------------------------------------------------------------


def category_metrics(rows: list[dict], answers: list, taxonomy: Taxonomy, t: float) -> dict:
    """Las cuatro cifras del rol A con el umbral `t` (una respuesta None, que Jev no dio, cuenta como no mapeada)."""
    mapped = {}
    for row, answer in zip(rows, answers, strict=True):
        if answer is not None and (decision := decide(answer, taxonomy, t)).kind == "mapear":
            mapped[row["clave"]] = decision.concept_id
    judged = [r for r in rows if r["clave"] in mapped and r["humano"]]
    unmapped = [r for r in rows if r["grupo"] == "sin_mapear"]
    control = [r for r in rows if r["grupo"] == "acuerdo" and r["clave"] in mapped and r["control"]]
    return {
        "t": t,
        "mapeadas": len(mapped),
        "precision": _share([mapped[r["clave"]] == r["humano"] for r in judged]),
        "cobertura": _share([r["clave"] in mapped for r in unmapped]),
        "control": _share([mapped[r["clave"]] == r["control"] for r in control]),
        "control_n": len(control),
        "sensibles": sum(_breach(taxonomy, r["humano"], mapped[r["clave"]]) for r in judged),
    }


def _share(hits: list[bool]) -> float | None:
    return sum(hits) / len(hits) if hits else None


def _breach(taxonomy: Taxonomy, human: str, mapped: str) -> bool:
    """La persona dio la categoría por sensible o +18 y Jev la mapeó a un concepto que no lo es."""
    truth, given = taxonomy.concepts.get(human), taxonomy.concepts[mapped]
    if truth is None:  # «ninguno»: no se sabe qué guardia aplicaría
        return False
    return (truth.sensitive and not given.sensitive) or (truth.age_restricted and not given.age_restricted)


def category_criteria(metrics: dict) -> dict[str, bool]:
    def at_least(value, target):
        return value is not None and value >= target

    return {
        "precision": at_least(metrics["precision"], MIN_PRECISION),
        "cobertura": at_least(metrics["cobertura"], MIN_COVERAGE),
        "control": at_least(metrics["control"], MIN_CONTROL),
        "sensibles": metrics["sensibles"] == 0,
    }


def evaluate_variant(rows: list[dict], answers: list, taxonomy: Taxonomy) -> dict:
    """Las cifras en cada umbral y `t_auto`, el menor que cumple los cuatro criterios (None si ninguno)."""
    by_threshold = [category_metrics(rows, answers, taxonomy, t) for t in THRESHOLDS]
    passing = [m["t"] for m in by_threshold if all(category_criteria(m).values())]
    return {
        "umbrales": by_threshold,
        "t_auto": passing[0] if passing else None,
        "sin_respuesta": sum(a is None for a in answers),
    }


def choose_variant(results: dict[str, dict]) -> str | None:
    """De las variantes que pasan, la de más cobertura en su `T_auto` (luego más precisión; si empatan, el español)."""

    def at_t_auto(variant):
        result = results[variant]
        metrics = next(m for m in result["umbrales"] if m["t"] == result["t_auto"])
        return (metrics["cobertura"], metrics["precision"])

    passing = [v for v in VARIANTS if v in results and results[v]["t_auto"] is not None]
    return max(passing, key=at_t_auto) if passing else None


# --- rol B: juez -----------------------------------------------------------------------------------------------------


def jev_level(gain: float) -> int:
    """Nivel 0, 1 o 2 desde la ganancia esperada: el más cercano (½ y 1 son las ganancias de «a medias» y «sirve»).
    Jev dice «sirve» (nivel 2) con ganancia ≥ ¾, el punto medio entre las dos. `RELEVANT_GAIN` (½) es otro corte: el
    del MRR, que cuenta «a medias» como relevante; aquí el binario de las personas es «sirve» contra el resto."""
    return min(2, int(gain * 2 + 0.5))


def judge_kappas(pairs: list[dict], human: dict[str, int], judgments: dict[str, JevJudgment]) -> dict:
    """κ de Jev y del juez por concepto contra las personas, en los mismos pares (los que ambos, Jev y la persona,
    juzgaron)."""
    rows = [p for p in pairs if p["id"] in human and p["id"] in judgments]
    result = {
        "n": len(rows),
        "sin_juicio_jev": sum(p["id"] in human and p["id"] not in judgments for p in pairs),
        "kappa_jev": None,
        "kappa_ponderado_jev": None,
        "kappa_concepto": None,
        "kappa_ponderado_concepto": None,
    }
    if not rows:
        return result
    people = [human[p["id"]] for p in rows]
    jev = [jev_level(judgments[p["id"]].gain) for p in rows]
    concept = sheet_report(rows, human)
    return result | {
        "kappa_jev": round(sheets.cohen_kappa([int(h == 2) for h in people], [int(j == 2) for j in jev]), 3),
        "kappa_ponderado_jev": round(sheets.weighted_kappa(people, jev), 3),
        "kappa_concepto": concept["kappa"],
        "kappa_ponderado_concepto": concept["kappa_ponderado"],
    }


def judge_criteria(kappas: dict) -> dict[str, bool]:
    jev, concept = kappas["kappa_jev"], kappas["kappa_concepto"]
    return {
        "kappa_minimo": jev is not None and jev >= MIN_KAPPA,
        "mejor_que_concepto": jev is not None and concept is not None and jev > concept,
    }


# --- corrida ---------------------------------------------------------------------------------------------------------


def estimated_cost(input_tokens: int, price_per_million: float) -> float:
    return input_tokens * price_per_million / 1_000_000


def run_pilot(
    conn: Connection,
    client,
    taxonomy: Taxonomy,
    sheet_dir: Path | None = None,
    ids_dir: Path | None = None,
    proposal_path: Path | None = None,
    today: date | None = None,
) -> dict:
    """Corre los dos roles, escribe el reporte y la propuesta y devuelve las cifras. Supone `requirements` vacío.
    Guarda los juicios nuevos en `eval_judgments`; no hace commit."""
    sheet_dir, ids_dir = sheet_dir or sheets.sheet_dir(), ids_dir or sheets.EVAL_DIR
    proposal_path = proposal_path or PROPOSAL_FILE
    today = today or date.today()

    rows = load_category_rows(sheet_dir, ids_dir)
    variants = {}
    for variant in VARIANTS:
        questions = build_questions(taxonomy, variant)
        answers = client.ask_many([(row["state"], questions) for row in rows])
        variants[variant] = evaluate_variant(rows, answers, taxonomy)
    chosen = choose_variant(variants)
    categories = {
        "filas": len(rows),
        "grupos": dict(Counter(r["grupo"] for r in rows)),
        "variantes": variants,
        "variante": chosen,
        "t_auto": variants[chosen]["t_auto"] if chosen else None,
        "pasa": chosen is not None,
    }

    pairs, human = load_search_pairs(sheet_dir, ids_dir)
    kappas = judge_kappas(pairs, human, judge_pairs(conn, client, pairs))
    judge = kappas | {"criterios": judge_criteria(kappas)}
    judge["pasa"] = all(judge["criterios"].values())

    stats = client.stats
    usage = {
        "llamadas": stats.requests,
        "tokens": stats.input_tokens,
        "fallos": stats.failures,
        "tope": stats.stopped_by_cap,
        "precio": config.JEV_PRICE_PER_MTOK_INPUT,
        "costo": estimated_cost(stats.input_tokens, config.JEV_PRICE_PER_MTOK_INPUT),
    }
    proposal = {
        "categorias": categories["pasa"],
        "juez": judge["pasa"],
        "t_auto": categories["t_auto"] or DEFAULT_T_AUTO,
        "variante": chosen or VARIANTS[0],
        "model_version": client.model,
        "fecha": today.isoformat(),
    }
    sheets.write_json(proposal_path, proposal)
    report_path = sheet_dir / REPORT_NAME
    report_path.write_text(
        render_report(categories, judge, usage, client.model, today, proposal_path.name), encoding="utf-8"
    )
    return {
        "categorias": categories,
        "juez": judge,
        "uso": usage,
        "propuesta": proposal,
        "reporte": report_path,
        "archivo_propuesta": proposal_path,
    }


# --- reporte ---------------------------------------------------------------------------------------------------------


def _pct(value: float | None) -> str:
    return "—" if value is None else f"{value * 100:.0f} %"


def _num(value: float | None, decimals: int = 2) -> str:
    return "—" if value is None else f"{value:.{decimals}f}".replace(".", ",")


def _int(value: int) -> str:
    return f"{value:,}".replace(",", ".")


def _ok(passed: bool) -> str:
    return "cumple" if passed else "no cumple"


def render_report(categories: dict, judge: dict, usage: dict, model: str, today: date, proposal_name: str) -> str:
    groups = categories["grupos"]
    lines = [
        f"# Piloto de Jev ({today.isoformat()})",
        "",
        f"Modelo `{model}`. {_int(usage['llamadas'])} llamadas, {_int(usage['tokens'])} tokens de entrada; costo"
        f" estimado US$ {_num(usage['costo'], 4)} (a US$ {_num(usage['precio'], 3)} por millón de tokens de entrada,"
        " `JEV_PRICE_PER_MTOK_INPUT`; la salida no se cobra). Los pares ya juzgados salen de la caché y no se cobran"
        " de nuevo.",
    ]
    if usage["tope"]:
        lines += [
            "",
            "**Se llegó al tope de llamadas (`JEV_MAX_REQUESTS`): faltaron respuestas; las cifras no valen.**",
        ]
    lines += [
        "",
        "## Rol A: etiquetar categorías",
        "",
        f"Planilla A: {categories['filas']} categorías ({groups.get('sin_mapear', 0)} sin mapear,"
        f" {groups.get('juez', 0)} decididas por el juez, {groups.get('acuerdo', 0)} de control). Con cada umbral T,"
        " Jev mapea las categorías con confianza ≥ T que pasan la tabla de decisión (sin mezcla ni guardias en"
        " conflicto). Precisión: mapeadas que coinciden con la persona. Cobertura: sin mapear que Jev mapea. Control:"
        " mapeadas del grupo de control que coinciden con el concepto de control. Sensibles: categorías sensibles o +18"
        " (según la persona) que Jev mapea solo a un concepto que no lo es.",
    ]
    for variant, result in categories["variantes"].items():
        lines += [
            "",
            f"### Instrucciones en {VARIANT_NAMES[variant]} (variante «{variant}»)",
            "",
            "| T | Mapeadas | Precisión | Cobertura sin mapear | Acuerdo control | Sensibles mal mapeadas | Cumple |",
            "|---|---|---|---|---|---|---|",
        ]
        for m in result["umbrales"]:
            control = f"{_pct(m['control'])} (n={m['control_n']})"
            lines.append(
                f"| {_num(m['t'])} | {m['mapeadas']} | {_pct(m['precision'])} | {_pct(m['cobertura'])} | {control}"
                f" | {m['sensibles']} | {'sí' if all(category_criteria(m).values()) else 'no'} |"
            )
        lines.append("")
        if result["sin_respuesta"]:
            lines.append(f"Jev no respondió {result['sin_respuesta']} categorías (cuentan como no mapeadas).")
        lines.append(
            f"T_auto = {_num(result['t_auto'])}" if result["t_auto"] else "Ningún umbral cumple los cuatro criterios."
        )
    lines += ["", "### Criterios de adopción del rol A", ""]
    lines += _category_criteria_table(categories)
    lines.append("")
    if categories["pasa"]:
        lines.append(
            f"Pasa con la variante «{categories['variante']}» y T_auto = {_num(categories['t_auto'])}: se propone"
            " adoptar."
        )
    else:
        lines.append("No se propone adoptar el rol A: ninguna variante cumple los cuatro criterios en un mismo umbral.")

    criteria = judge["criterios"]
    lines += [
        "",
        "## Rol B: juez de la búsqueda",
        "",
        f"{judge['n']} pares juzgados por la persona y por Jev"
        + (f" ({judge['sin_juicio_jev']} quedaron sin juicio de Jev)" if judge["sin_juicio_jev"] else "")
        + ". Jev dice «sirve» con ganancia esperada ≥ 0,75; κ binario: «sirve» contra el resto.",
        "",
        "| Juez | κ binario | κ ponderado (3 niveles) |",
        "|---|---|---|",
        f"| Jev | {_num(judge['kappa_jev'], 3)} | {_num(judge['kappa_ponderado_jev'], 3)} |",
        f"| Juez por concepto | {_num(judge['kappa_concepto'], 3)} | {_num(judge['kappa_ponderado_concepto'], 3)} |",
        "",
        "| Criterio | Meta | Resultado |",
        "|---|---|---|",
        f"| κ Jev | ≥ {_num(MIN_KAPPA, 1)} | {_ok(criteria['kappa_minimo'])} |",
        f"| κ Jev > κ juez por concepto | mayor | {_ok(criteria['mejor_que_concepto'])} |",
        "",
        "Pasa: se propone adoptar a Jev como juez."
        if judge["pasa"]
        else "No se propone adoptar a Jev como juez: el juez por concepto sigue solo.",
        "",
        "## Propuesta",
        "",
        f"Queda en `rappi-ia/src/rappi_ia/eval/{proposal_name}`. No adopta nada por sí sola: para adoptar, renómbrala a"
        " `jev-adopcion.json` y súbela a git. Mientras no exista ese archivo, Jev queda apagado.",
        "",
    ]
    return "\n".join(lines)


def _category_criteria_table(categories: dict) -> list[str]:
    """Una columna por variante, con las cifras en su T_auto o, si no tiene, en el umbral que más criterios cumple."""
    shown = {}
    for variant, result in categories["variantes"].items():
        metrics = result["umbrales"]
        best = next((m for m in metrics if m["t"] == result["t_auto"]), None) or max(
            metrics, key=lambda m: (sum(category_criteria(m).values()), -m["t"])
        )
        shown[variant] = (best, category_criteria(best))
    header = "| Criterio | Meta | " + " | ".join(f"«{v}» (T = {_num(m['t'])})" for v, (m, _) in shown.items()) + " |"
    rows = [header, "|---|---|" + "---|" * len(shown)]
    for name, label, goal, value in (
        ("precision", "Precisión", f"≥ {_pct(MIN_PRECISION)}", lambda m: _pct(m["precision"])),
        ("cobertura", "Cobertura sin mapear", f"≥ {_pct(MIN_COVERAGE)}", lambda m: _pct(m["cobertura"])),
        ("control", "Acuerdo con el control", f"≥ {_pct(MIN_CONTROL)}", lambda m: _pct(m["control"])),
        ("sensibles", "Sensibles mal mapeadas", "0", lambda m: str(m["sensibles"])),
    ):
        cells = [f"{value(m)} ({_ok(ok[name])})" for m, ok in shown.values()]
        rows.append(f"| {label} | {goal} | " + " | ".join(cells) + " |")
    return rows
