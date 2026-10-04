"""Prueba el chat como lo usaría alguien: manda cada frase a /chat y resume la respuesta en una o dos líneas.

Uso (con la API corriendo):  make probar-chat            # todas las rondas de src/rappi_ia/eval/frases_usuarios
                             make probar-chat FRASES=archivo.txt
Las líneas que empiezan con # son comentarios; «frase|vertical» la manda desde esa vertical. No registra eventos (sin
user_id). Leer la salida buscando: productos que no tienen que ver, verticales raras, avisos que sobran, «Lo anoté» para
algo que sí existe. Ver docs/pruebas-de-usuario.md.
"""

import json
import os
import sys
import time
import urllib.request
from pathlib import Path

API = os.environ.get("API", "http://localhost:8000").rstrip("/")
DEFAULT = Path(__file__).resolve().parents[1] / "src" / "rappi_ia" / "eval" / "frases_usuarios"


def chat(text: str, vertical: str | None) -> tuple[dict, float]:
    body = {"message": text, "mode": "propuesta", **({"vertical": vertical} if vertical else {})}
    request = urllib.request.Request(f"{API}/chat", json.dumps(body).encode(), {"Content-Type": "application/json"})
    start = time.time()
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response), time.time() - start
    except Exception as exc:  # noqa: BLE001 — se reporta y se sigue con la próxima frase
        return {"error": f"{type(exc).__name__}: {exc}"}, time.time() - start


def summary(text: str, r: dict, seconds: float) -> str:
    if "error" in r:
        return f"✗ {text!r}: {r['error']}"
    names = "; ".join(f"{p['name'][:28]} [{p.get('concept')}] {p.get('price')}" for p in r.get("products", [])[:3])
    extra = []
    if r.get("suggestion"):
        extra.append(f"sugiere {r['suggestion']['concept']} de {r['suggestion']['vertical']}")
    if r.get("actions"):
        extra.append("botones: " + " / ".join(a["label"] for a in r["actions"][:3]))
    extra += [k for k in ("unmet", "age_notice") if r.get(k)]
    head = f"• {text!r} ({seconds:.1f}s) → {r.get('vertical') or '—'} {r.get('intent', {}).get('concepts', [])[:2]}"
    return f"{head} | {names} | {' · '.join(extra)}\n    «{r.get('text', '')[:180]}»"


def main(paths: list[str]) -> None:
    files = [Path(p) for p in paths] or sorted(DEFAULT.glob("*.txt"))
    for path in files:
        print(f"\n## {path.name}")
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                print(line)
                continue
            text, _, vertical = line.partition("|")
            print(summary(text.strip(), *chat(text.strip(), vertical.strip() or None)))


if __name__ == "__main__":
    main(sys.argv[1:])
