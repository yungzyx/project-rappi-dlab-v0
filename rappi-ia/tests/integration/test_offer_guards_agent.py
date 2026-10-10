"""Las guardias de ofertas en el agente: `suggest_complement` (que usan /agent/ask y /recommendations) y los ganchos de
servicios nunca proponen alcohol, farmacia, bebé, salud, conceptos sensibles, sex shops ni tabaquerías."""

import pytest
from fastapi.testclient import TestClient
from rappi_scraper.storage.search import build_search_documents

from conftest import add_price, add_product, add_store
from rappi_ia.agent.compose import TemplateComposer
from rappi_ia.agent.rappi_agent import Context, RappiAgent
from rappi_ia.agent.tools import search_products, suggest_complement
from rappi_ia.agent.verticals import ranked_verticals
from rappi_ia.api import app as api
from rappi_ia.api.services import Services
from rappi_ia.concepts.pipeline import build_concepts
from rappi_ia.concepts.taxonomy import load_taxonomy
from rappi_ia.demo.seed import seed_demo
from rappi_ia.embeddings.base import HashEmbedder
from rappi_ia.embeddings.text_store import embed_search_documents
from rappi_ia.offers.guards import is_offerable, offerable_vertical


@pytest.fixture
def demo(db):
    """El catálogo de prueba (`seed_demo`): ahí están pizza y cerveza, y las aristas curadas de complements.toml."""
    seed_demo(db)
    embedder = HashEmbedder()
    embed_search_documents(db, embedder)
    return db, embedder


@pytest.fixture
def demo_client(demo):
    db, embedder = demo

    def conn_override():
        yield db

    api.app.dependency_overrides[api.get_conn] = conn_override
    api.app.dependency_overrides[api.get_services] = lambda: Services(
        RappiAgent(embedder, TemplateComposer()), embedder
    )
    yield TestClient(api.app)
    api.app.dependency_overrides.clear()


def stock(db, embedder, products):
    """Agrega (id, nombre, tienda, categoría de Rappi) a precio fijo y recalcula documentos, conceptos y embeddings."""
    for pid, name, store, category in products:
        add_product(db, pid, name, store, category)
        add_price(db, store, pid, 1990)
    db.commit()
    build_search_documents(db)
    build_concepts(db)
    embed_search_documents(db, embedder)


def test_complement_never_offers_alcohol(demo):
    db, embedder = demo
    # La semilla trae la arista curada pizza → cerveza (la más fuerte de la pizza) y cerveza a la venta.
    assert db.execute(
        "SELECT 1 FROM concept_edges WHERE from_concept = 'pizza' AND to_concept = 'cerveza' AND method = 'curado'"
    ).fetchone()

    suggestion = suggest_complement(db, ["pizza"], "restaurantes", embedder)

    assert suggestion is not None and suggestion.concept == "gaseosas"  # la siguiente arista de la pizza
    assert not any(p.age_restricted for p in suggestion.products)


def test_complement_never_offers_a_blocked_concept_or_vertical_from_any_source(demo):
    """Barrido: ninguna fuente de la taxonomía, desde ninguna pantalla, saca una oferta bloqueada."""
    db, embedder = demo
    taxonomy = load_taxonomy()
    suggested = 0
    for source in taxonomy.concepts:
        for current in (None, "restaurantes", "licores"):
            suggestion = suggest_complement(db, [source], current, embedder)
            if suggestion is None:
                continue
            suggested += 1
            assert is_offerable(taxonomy.concepts[suggestion.concept]), (source, suggestion.concept)
            assert offerable_vertical(suggestion.vertical), (source, suggestion.vertical)
            assert not any(p.age_restricted for p in suggestion.products), (source, suggestion.concept)
    assert suggested > 20  # el barrido no es vacío: el catálogo de prueba sí tiene complementos


def test_complement_never_lands_in_pharmacy(db):
    embedder = HashEmbedder()
    add_store(db, 2, "licores", "Botillería")
    add_store(db, 11, "farmacia", "Farmacia")
    stock(
        db,
        embedder,
        [
            (200, "Cerveza Escudo Lata 470 cc", 2, "Cervezas"),
            (300, "Papas fritas Lays Clásicas 180 g", 11, "Snacks salados"),
            (301, "Ramitas Evercrisp Queso 250 g", 11, "Snacks salados"),
        ],
    )
    # Los snacks (un concepto cualquiera) solo están en la farmacia: Mochi no los lleva ahí.
    assert ranked_verticals(db, ["snacks-salados"]) == ["farmacia"]
    assert suggest_complement(db, ["cerveza"], "licores", embedder) is None

    # Con snacks también en el súper, la farmacia sigue siendo la vertical típica, pero la oferta sale del súper.
    add_store(db, 1, "supermercado", "Súper")
    stock(db, embedder, [(302, "Papas Kryzpo Original 130 g", 1, "Snacks salados")])
    assert ranked_verticals(db, ["snacks-salados"])[0] == "farmacia"
    suggestion = suggest_complement(db, ["cerveza"], "licores", embedder)
    assert suggestion.concept == "snacks-salados" and suggestion.vertical == "supermercado"
    assert [p.entity_id for p in suggestion.products] == ["302"]


def test_complement_never_comes_from_a_sex_shop_or_a_smoking_shop_in_another_vertical(demo):
    """En el mall de prueba el smoking shop vende «Chicles de menta» (golosinas, un concepto corriente) y Express vende
    gomitas: la oferta de golosinas sale de Express aunque el mall sea donde más calza."""
    db, embedder = demo
    assert db.execute(
        "SELECT 1 FROM concept_edges WHERE from_concept = 'juguetes-infantiles' AND to_concept = 'golosinas'"
    ).fetchone()
    assert ranked_verticals(db, ["golosinas"])  # hay golosinas en el catálogo de prueba

    suggestion = suggest_complement(db, ["juguetes-infantiles"], "conveniencia", embedder)

    assert suggestion is not None and suggestion.concept == "golosinas"
    assert suggestion.vertical == "conveniencia"
    assert [p.name for p in suggestion.products] == ["Gomitas ácidas 150 g (prueba)"]
    # Sin la guardia, esa misma búsqueda en el mall trae las golosinas del smoking shop.
    unguarded = search_products(db, "mall", "Golosinas", ["golosinas"], embedder, k=4)
    assert [p.store for p in unguarded.products] == ["Smoking shop (prueba)"]
    guarded = search_products(db, "mall", "Golosinas", ["golosinas"], embedder, k=4, offer=True)
    assert guarded.products == []


def test_offer_searches_skip_a_pharmacy_listed_among_the_supermarkets(demo):
    db, embedder = demo
    args = (db, "supermercado", "cepillo dental", ["cuidado-oral"], embedder)

    assert [p.store for p in search_products(*args, k=4).products] == ["Farmacia de prueba en súper"]
    assert search_products(*args, k=4, offer=True).products == []


def test_a_product_flagged_for_adults_is_never_offered_whatever_its_concept(demo):
    """El catálogo de Rappi marca +18 a un producto aunque su concepto sea corriente (una gaseosa con alcohol)."""
    db, embedder = demo
    db.execute("UPDATE catalog_items SET age_restricted = true WHERE master_product_id IN (91003, 92001)")
    db.commit()

    suggestion = suggest_complement(db, ["pizza"], "restaurantes", embedder)

    assert suggestion is not None and suggestion.concept != "gaseosas"
    assert not any(p.age_restricted for p in suggestion.products)


def test_ask_cross_sell_respects_the_guards(demo_client):
    body = demo_client.post(
        "/agent/ask", json={"message": "pizza", "vertical": "restaurants", "user_id": "u1", "session_id": "s1"}
    ).json()

    assert body["products"]  # la respuesta sí trae pizzas
    assert body["suggestion"]["concept"] == "gaseosas"  # no cerveza
    assert not body["age_notice"]
    assert not any(p["age_restricted"] for p in body["suggestion"]["products"])


def test_recommendations_respect_the_guards(demo_client):
    event = {"type": "search", "session_id": "s1", "vertical": "restaurants", "concept_id": "pizza", "query": "pizza"}
    assert demo_client.post("/events", json={"user_id": "u1", "events": [event]}).json() == {"guardados": 1}

    rows = demo_client.get("/recommendations", params={"user_id": "u1", "vertical": "restaurants"}).json()["rows"]

    assert [row["concept"] for row in rows] == ["gaseosas"]
    assert not any(p["age_restricted"] for row in rows for p in row["products"])


def test_recommendations_never_name_an_unofferable_interest(demo, demo_client):
    """«Porque te interesa 🍺 cerveza» es Mochi nombrando alcohol (o salud) por su cuenta: esos intereses no son
    fuente de una recomendación, como en `_top_interest`. Uno ofrecible, aunque pese menos, sí."""
    db, _ = demo
    db.execute(  # vitaminas → jugos (jugos se ofrece y el súper de prueba vende jugo): sin la regla, sería una fila
        """INSERT INTO concept_edges (from_concept, to_concept, method, weight, data_source)
           VALUES ('vitaminas', 'jugos', 'curado', 0.9, 'curado')"""
    )
    db.commit()

    def search(concept: str) -> dict:
        return {"type": "search", "session_id": "s1", "vertical": "grocery", "concept_id": concept, "query": concept}

    events = [search("cerveza")] * 3 + [search("vitaminas")] * 2 + [search("pizza")]
    assert demo_client.post("/events", json={"user_id": "u1", "events": events}).json() == {"guardados": 6}
    body = demo_client.get("/recommendations", params={"user_id": "u1", "limit": 6}).json()
    assert body["interests"][:2] == ["cerveza", "vitaminas"]  # el perfil los guarda: solo no se ofrecen

    reasons = [row["reason"] for row in body["rows"]]
    assert reasons == ["Porque te interesa 🍕 pizza"]
    assert not any(p["age_restricted"] for row in body["rows"] for p in row["products"])


def test_a_service_hook_never_suggests_health_or_pharmacy_products(demo):
    """RappiTravel engancha protector solar (dermocosmética, del grupo salud) con una farmacia: no se propone."""
    db, embedder = demo
    agent = RappiAgent(embedder, TemplateComposer())

    beach = agent.reply(db, "me voy de vacaciones a la playa", Context())

    assert beach["service"] == "rappitravel"
    assert beach.get("suggestion", {}).get("concept") != "dermocosmetica"
    assert beach.get("suggestion", {}).get("vertical") != "farmacia"


def test_a_service_hook_never_lands_in_pharmacy(db):
    """Un concepto corriente (una mochila de viaje) que solo vende una farmacia no se propone; si otra vertical lo
    vende, la oferta sale de ahí aunque la farmacia calce primero."""
    embedder = HashEmbedder()
    agent = RappiAgent(embedder, TemplateComposer())
    add_store(db, 11, "farmacia", "Farmacia")
    stock(db, embedder, [(902, "Mochila de viaje 40 litros", 11, "Maletas de viaje")])
    assert ranked_verticals(db, ["accesorios-moda"]) == ["farmacia"]

    assert "suggestion" not in agent.reply(db, "busco un hotel en puerto varas", Context())

    add_store(db, 12, "mall", "Tienda")
    stock(db, embedder, [(903, "Mochila de viaje 30 litros", 12, "Maletas de viaje")])
    assert ranked_verticals(db, ["accesorios-moda"])[0] == "farmacia"
    suggestion = agent.reply(db, "busco un hotel en puerto varas", Context())["suggestion"]
    assert suggestion["vertical"] == "mall" and [p["entity_id"] for p in suggestion["products"]] == ["903"]


def test_complement_never_lands_in_licores(db):
    """«Ni Licores»: una gaseosa que solo vende una botillería no se propone desde Licores; si otra vertical la
    vende, la oferta sale de ahí aunque Licores calce primero."""
    embedder = HashEmbedder()
    add_store(db, 3, "restaurantes", "Pizzería")
    add_store(db, 2, "licores", "Botillería (prueba)")
    stock(
        db,
        embedder,
        [(210, "Gaseosa cola 1,5 L (prueba)", 2, "Gaseosas"), (211, "Gaseosa lima 1,5 L (prueba)", 2, "Gaseosas")],
    )
    assert ranked_verticals(db, ["gaseosas"]) == ["licores"]
    assert suggest_complement(db, ["pizza"], "restaurantes", embedder) is None

    add_store(db, 1, "supermercado", "Súper (prueba)")
    stock(db, embedder, [(212, "Gaseosa naranja 1,5 L (prueba)", 1, "Gaseosas")])
    assert ranked_verticals(db, ["gaseosas"])[0] == "licores"
    suggestion = suggest_complement(db, ["pizza"], "restaurantes", embedder)
    assert suggestion.concept == "gaseosas" and suggestion.vertical == "supermercado"
    assert [p.entity_id for p in suggestion.products] == ["212"]


def test_a_soda_sold_only_by_a_licores_store_in_the_seed_is_not_suggested(demo):
    db, embedder = demo
    sodas = "SELECT master_product_id FROM catalog_items WHERE name ILIKE 'Gaseosa%'"
    skus = f"SELECT sku FROM store_products WHERE master_product_id IN ({sodas})"
    db.execute(f"DELETE FROM price_snapshots WHERE sku IN ({skus})")  # noqa: S608 (consultas fijas)
    db.execute(f"DELETE FROM store_products WHERE master_product_id IN ({sodas})")  # noqa: S608
    db.commit()
    stock(db, embedder, [(94901, "Gaseosa cola 1,5 L botillería (prueba)", 9401, "Gaseosas")])
    assert ranked_verticals(db, ["gaseosas"]) == ["licores"]

    suggestion = suggest_complement(db, ["pizza"], "restaurantes", embedder)  # pasa a la arista siguiente, si hay
    assert suggestion is None or (suggestion.concept != "gaseosas" and suggestion.vertical != "licores")
