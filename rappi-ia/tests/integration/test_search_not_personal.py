"""La búsqueda no se personaliza: lo que se encuentra con una consulta no depende de lo que la persona hizo antes.
Solo las ofertas del agente (`/agent/offer`, `/agent/plans`) usan su historia. Las dos personas vienen de `people`."""

import pytest
from personal_helpers import GRILL, NEWBIE, SWEET, prepare_people

from rappi_ia.api import app as api

QUERIES = ("chocolate", "carne")


@pytest.fixture
def people(db, monkeypatch):
    yield from prepare_people(db, monkeypatch)


def test_search_route_takes_no_user():
    route = next(r for r in api.app.routes if getattr(r, "path", None) == "/search")
    params = {
        p.name for p in (*route.dependant.query_params, *route.dependant.path_params, *route.dependant.body_params)
    }
    assert "user_id" not in params and "profile" not in params


@pytest.mark.parametrize("query", QUERIES)
@pytest.mark.parametrize("extra", [{}, {"vertical": "supermercado"}, {"mode": "lexico"}])
def test_search_results_do_not_depend_on_history(people, query, extra):
    client = people.client

    def search(**who):
        reply = client.get("/search", params={"q": query, **extra, **who})
        assert reply.status_code == 200, reply.text
        return reply.json()

    anonymous = search()
    assert anonymous  # hay resultados con qué comparar
    # Aunque se le pase un usuario, la ruta lo ignora: ve lo mismo quien tiene historia que quien no.
    for user in (SWEET, GRILL, NEWBIE):
        assert search(user_id=user) == anonymous
    assert search() == anonymous  # y lo que ya hicieron (sus eventos y pedidos) no la movió


@pytest.mark.parametrize("message", QUERIES)
def test_ask_products_do_not_depend_on_history(people, message):
    client = people.client

    def ask(user):
        reply = client.post("/agent/ask", json={"message": message, "user_id": user, "session_id": f"s-ask-{user}"})
        assert reply.status_code == 200, reply.text
        return reply.json()["products"]

    anonymous = ask(None)
    assert anonymous
    for user in (SWEET, GRILL, NEWBIE):
        assert ask(user) == anonymous  # el texto puede cambiar; los productos no
