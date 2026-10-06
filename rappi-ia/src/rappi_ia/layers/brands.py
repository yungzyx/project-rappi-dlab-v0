"""Marcas canónicas: Rappi declara `trademark` en el 32 % de los productos y con muchas escrituras. Esta capa las junta,
enrolla las líneas bajo su marca («Coca-Cola Zero» → coca-cola) y deduce la marca del inicio del nombre cuando falta."""

import logging
import re
import tomllib
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

from psycopg import Connection

from ..text import normalize
from .runs import finish_layer_run, rules_version, start_layer_run

log = logging.getLogger(__name__)

RULES_FILE = Path(__file__).resolve().parents[1] / "concepts" / "brands.toml"
MIN_PARENT_ITEMS = 10  # una marca con al menos tantos productos puede ser el padre de sus líneas
MIN_PARENT_LENGTH = 4
MIN_INDEX_ITEMS = 5  # marcas declaradas en al menos tantos productos se buscan en los nombres sin marca
_CORPORATE_SUFFIX = re.compile(r"( s a| sa| ltda| spa| limitada| inc| llc| sac)$")


@dataclass(frozen=True)
class BrandRules:
    not_brands: frozenset[str]
    store_brands: frozenset[str]
    name_stop: frozenset[str]
    aliases: dict[str, str]
    families: frozenset[str] = frozenset()


@dataclass(frozen=True)
class NormBrand:
    spaced: str  # «coca cola»
    compact: str  # «cocacola»: la clave para juntar escrituras


def load_brand_rules(path: Path | None = None) -> tuple[str, BrandRules]:
    raw = tomllib.loads((path or RULES_FILE).read_text(encoding="utf-8"))
    rules = BrandRules(
        not_brands=frozenset(normalize(x) for x in raw["not_brands"]),
        store_brands=frozenset(normalize(x) for x in raw["store_brands"]),
        name_stop=frozenset(normalize(x) for x in raw["name_stop"]),
        aliases={normalize(a["alias"]): normalize(a["brand"]) for a in raw.get("alias", ())},
        families=frozenset(normalize(x) for x in raw.get("families", ())),
    )
    return raw["version"], rules


def norm_brand(raw: str | None, rules: BrandRules) -> NormBrand | None:
    spaced = _CORPORATE_SUFFIX.sub("", normalize(raw or ""))
    spaced = rules.aliases.get(spaced, spaced)
    compact = spaced.replace(" ", "")
    if len(compact) < 2 or spaced in rules.not_brands:
        return None
    return NormBrand(spaced, compact)


def roll_up(counts: dict[str, int], families: frozenset[str] = frozenset()) -> dict[str, str]:
    """{escritura: su marca padre}: el prefijo más largo (en palabras) que ya es una marca con ≥ MIN_PARENT_ITEMS
    productos, o una familia curada. «coca cola zero» → «coca cola»; sin padre, la escritura es su propia marca."""
    parent = {}
    for spaced in counts:
        words = spaced.split()
        best = spaced
        for k in range(len(words) - 1, 0, -1):
            prefix = " ".join(words[:k])
            if (counts.get(prefix, 0) >= MIN_PARENT_ITEMS or prefix in families) and len(prefix) >= MIN_PARENT_LENGTH:
                best = prefix
                break
        parent[spaced] = best
    return parent


def brand_index(counts: dict[str, int], rules: BrandRules) -> dict[tuple[str, ...], str]:
    """{palabras de una marca: su marca padre} de las marcas que se buscan al inicio de un nombre."""
    parent = roll_up(counts, rules.families)
    return {
        tuple(spaced.split()): parent[spaced]
        for spaced, n in counts.items()
        if n >= MIN_INDEX_ITEMS and len(spaced.replace(" ", "")) >= 3 and spaced not in rules.name_stop
    }


def infer_brand(name: str, index: dict[tuple[str, ...], str]) -> str | None:
    """La marca (padre) cuyo nombre abre `name`, la más larga si hay varias."""
    words = normalize(name).split()
    for size in range(min(max((len(k) for k in index), default=0), len(words)), 0, -1):
        if brand := index.get(tuple(words[:size])):
            return brand
    return None


def _slug(spaced: str) -> str:
    return spaced.replace(" ", "-")


def build_brands(conn: Connection) -> dict:
    """Recalcula `product_brands`, `brand_aliases` e `item_brands` (idempotente; borra en cascada el producto canónico,
    que se recalcula después)."""
    version, rules = load_brand_rules()
    run = start_layer_run(conn, "brands", rules_version(version, RULES_FILE, Path(__file__)))
    products = conn.execute(
        "SELECT master_product_id::text, name, coalesce(trademark, '') FROM catalog_items"
    ).fetchall()
    raw_of: dict[str, Counter] = defaultdict(Counter)  # escritura normalizada → escrituras originales
    for _id, _name, trademark in products:
        if nb := norm_brand(trademark, rules):
            raw_of[nb.spaced][trademark.strip()] += 1
    counts = {spaced: sum(c.values()) for spaced, c in raw_of.items()}
    parent = roll_up(counts, rules.families)

    # Una marca por clave compacta del padre: gana como slug y nombre la escritura más frecuente.
    group_spaced: dict[str, Counter] = defaultdict(Counter)
    for spaced, n in counts.items():
        group_spaced[parent[spaced].replace(" ", "")][parent[spaced]] += n
    slug_of = {compact: _slug(c.most_common(1)[0][0]) for compact, c in group_spaced.items()}

    def key_of(spaced: str) -> str:
        return slug_of[parent[spaced].replace(" ", "")]

    brands: dict[str, dict] = {}
    for compact, c in group_spaced.items():
        top_spaced = c.most_common(1)[0][0]
        names = Counter()
        for spaced in counts:
            if parent[spaced].replace(" ", "") == compact:
                names.update(raw_of[spaced])
        family = top_spaced in rules.families and top_spaced not in counts
        brands[slug_of[compact]] = {
            "name": top_spaced.title() if family else names.most_common(1)[0][0],
            "kind": "marca",
            "store": top_spaced in rules.store_brands,
            "curated": top_spaced in rules.aliases.values(),
            "items": sum(c.values()),
        }
    index = {
        words: slug_of[parent_spaced.replace(" ", "")] for words, parent_spaced in brand_index(counts, rules).items()
    }

    item_rows = []
    inferred = 0
    for item_id, name, trademark in products:
        if nb := norm_brand(trademark, rules):
            item_rows.append(("catalog_item", item_id, key_of(nb.spaced), "rappi", run))
        elif key := infer_brand(name, index):
            item_rows.append(("catalog_item", item_id, key, "regla", run))
            inferred += 1
    # Los platos toman la cadena del local como marca.
    chains = conn.execute(
        """SELECT mi.item_id::text, b.name FROM menu_items mi JOIN stores s USING (store_id)
           JOIN brands b ON b.brand_id = s.brand_id"""
    ).fetchall()
    chain_counts = Counter()
    chain_norm = {}
    for item_id, chain in chains:
        if nb := norm_brand(chain, rules):
            chain_norm[item_id] = (nb, chain.strip())
            chain_counts[nb.spaced] += 1
    taken = {b.replace("-", ""): b for b in brands}
    for item_id, (nb, chain) in chain_norm.items():
        key = taken.get(nb.compact)
        if key is None:
            key = taken[nb.compact] = _slug(nb.spaced)
            brands[key] = {"name": chain, "kind": "cadena", "store": False, "curated": False, "items": 0}
        brands[key]["items"] += 1
        item_rows.append(("menu_item", item_id, key, "cadena", run))

    conn.execute("DELETE FROM product_brands")  # en cascada: aliases, item_brands y producto canónico
    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO product_brands (brand_key, name, kind, is_store_brand, curated, items)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            [(k, b["name"], b["kind"], b["store"], b["curated"], b["items"]) for k, b in brands.items()],
        )
        cur.executemany(
            "INSERT INTO brand_aliases (alias, brand_key, source, items) VALUES (%s, %s, %s, %s)",
            [(s, key_of(s), "curado" if s in rules.aliases.values() or s in rules.aliases else "rappi", n)
             for s, n in counts.items()],
        )  # fmt: skip
    with conn.cursor().copy("COPY item_brands (entity_type, entity_id, brand_key, source, run_id) FROM STDIN") as copy:
        for row in item_rows:
            copy.write_row(row)
    for table in ("product_brands", "brand_aliases", "item_brands"):
        conn.execute(f"ANALYZE {table}")
    counts_out = {
        "marcas": len(brands),
        "alias": len(counts),
        "productos": sum(1 for r in item_rows if r[0] == "catalog_item"),
        "deducidas_del_nombre": inferred,
        "platos": sum(1 for r in item_rows if r[0] == "menu_item"),
        "propias": sum(1 for b in brands.values() if b["store"]),
    }
    finish_layer_run(conn, run, counts_out)
    log.info("Marcas: %s", counts_out)
    return counts_out
