.PHONY: help install install-ml db-test migrate check-migrations deploy-migrate test lint format jev-categorias concepts knowledge embed eval synth analytics serve serve-lan warm probar-agente purge post-refresh layers layer-report contract

PY := .venv/bin/python
# Python ≥ 3.12 para crear el .venv. En un Mac nuevo `python3` es el 3.9 de macOS: se prefiere python3.13
# (Homebrew: `brew install python@3.13`, que solo instala `python3.13`).
PYTHON ?= $(shell command -v python3.13 || command -v python3)
PG_BIN := $(shell brew --prefix 2>/dev/null)/opt/postgresql@17/bin

help:  ## Muestra esta ayuda
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-14s %s\n", $$1, $$2}'

install:  ## Crea .venv con rappi-scraper (esquema) + API + dev (sin modelos)
	$(PYTHON) -m venv .venv
	$(PY) -m pip install -q --upgrade pip
	$(PY) -m pip install -q -c requirements.lock.txt -e ../rappi-scraper -e ".[api,dev]"
	@test -f .env || cp .env.example .env

install-ml:  ## Agrega el modelo local de texto (e5, con torch) y Claude opcional (~1 GB de paquetes)
	$(PY) -m pip install -q -c requirements.lock.txt -e ".[ml,llm]"

db-test:  ## Crea la base de tests propia (rappi_ia_test)
	-$(PG_BIN)/createdb rappi_ia_test

migrate:  ## Aplica migraciones pendientes (viven en rappi-scraper)
	$(PY) -m rappi_ia migrate

deploy-migrate:  ## Paso del despliegue: respalda si hay migraciones pendientes, migra, tarjetas y permisos (DB_API_ROLE)
	$(PY) -m rappi_ia deploy-migrate

# Sin «##»: no sale en `make help` (la guardia de serve, serve-lan y make mvp; no se corre a mano). MIGRATE=1 la fuerza.
check-migrations:
	$(PY) -m rappi_ia check-migrations

test:  ## Tests (unitarios + integración contra rappi_ia_test)
	scripts/with-test-db-lock.sh $(PY) -m pytest

lint:  ## Revisa estilo y errores comunes
	$(PY) -m ruff check src tests
	$(PY) -m ruff format --check src tests

format:  ## Formatea el código
	$(PY) -m ruff check --fix src tests
	$(PY) -m ruff format src tests

contract:  ## Reescribe las respuestas de ejemplo de la API que usan la app (prototipo-app/src/api/fixtures) y el panel (uso del MVP)
	@$(PY) -c 'import os, sys, rappi_ia; os.environ.get("DATABASE_URL_TEST") or sys.exit("Falta DATABASE_URL_TEST: `make contract` no puede escribir los ejemplos")'
	RAPPI_CONTRACT_WRITE=1 scripts/with-test-db-lock.sh $(PY) -m pytest tests/integration/test_contract.py

jev-categorias:  ## Jev etiqueta las categorías nuevas (opcional: sin clave o sin adopción no hace nada; ver docs/jev.md)
	$(PY) -m rappi_ia map-categories --jev --solo-nuevas

concepts:  ## Capa 2: conceptos por producto y plato (con kNN si hay extra ml)
	$(PY) -m rappi_ia concepts

knowledge:  ## Tarjetas del juego en la base, con sus ligas a conceptos (después de concepts)
	$(PY) -m rappi_ia knowledge

embed:  ## Embeddings de texto (incrementales) + índices HNSW por vertical
	$(PY) -m rappi_ia embed-text

# La tarea semanal (rappi-scraper/scripts/refresh-semanal.sh) pasa EVAL_ARGS= para no tocar eval/thresholds.json
EVAL_ARGS ?= --guardar-tau

# --jev-auto suma a Jev como tercer juez solo con clave y adopción (docs/jev.md); si no, evalúa igual que siempre
eval:  ## Evalúa la búsqueda (léxico vs vectorial vs híbrido) y calibra τ
	$(PY) -m rappi_ia eval-search $(EVAL_ARGS) --jev-auto

synth:  ## Usuarios y eventos SIMULADOS para el panel (reemplaza los anteriores)
	$(PY) -m rappi_ia synth

analytics:  ## Resumen de métricas del panel
	$(PY) -m rappi_ia analytics

# Con el peso ya descargado, la API no consulta huggingface.co al cargarlos (~20 peticiones por arranque).
# Mira el modelo por defecto: con otro en .env que no está en caché, la API arranca sin esa capacidad (/health lo
# dice en «faltantes»); `make serve HF_OFFLINE=` lo descarga la primera vez.
HF_CACHE := $(or $(HF_HUB_CACHE),$(HOME)/.cache/huggingface/hub)
HF_MODELS := intfloat--multilingual-e5-base
HF_OFFLINE := $(shell for m in $(HF_MODELS); do test -d "$(HF_CACHE)/models--$$m" || exit 0; done; echo HF_HUB_OFFLINE=1)

# serve y serve-lan migran antes: tras un `git pull`, el código puede necesitar una migración nueva (sin la 019, todo
# lo que muestra productos respondía 500). Antes de migrar, check-migrations se niega a aplicar a la base real las
# migraciones de una rama sin fusionar (se registran por nombre de archivo: una editada después no se vuelve a aplicar).
# Después de migrar cargan las tarjetas del juego (knowledge, idempotente): sin ellas una ronda no tiene datos.
# Con API_ENV=production (en el entorno o en .env, como lo lee la API) no hacen nada de eso: migrar es un paso del
# despliegue (`make deploy-migrate`, que respalda antes) y, mientras falte, /health da 503.
DOTENV ?= .env
API_ENV ?= $(shell sed -n 's/^API_ENV=//p' $(DOTENV) 2>/dev/null | tr -d "\"'" | tail -n 1)
SERVE_PREP := $(if $(filter production,$(API_ENV)),,check-migrations migrate knowledge)

serve: $(SERVE_PREP)  ## API en http://localhost:8000, solo este Mac (docs en /docs)
	$(HF_OFFLINE) $(PY) -m uvicorn rappi_ia.api.app:app --no-access-log --host 127.0.0.1 --port 8000

serve-lan: $(SERVE_PREP)  ## API abierta a la red local (para el iPhone). Sin autenticación: solo en una red de confianza
	$(HF_OFFLINE) API_ALLOW_LAN=1 $(PY) -m uvicorn rappi_ia.api.app:app --no-access-log --host 0.0.0.0 --port 8000

# Las frases del guion (docs/demo.md) sin user_id: no se registran. Frío, «una hamburguesa» tarda 2 a 5 s; caliente, 0,3 s.
API ?= http://localhost:8000
DEMO_PHRASES := "una hamburguesa" "vino tinto" "algo para el carrete" "tengo fiebre" \
	"me voy de vacaciones a la playa" "se me quedaron las llaves en la oficina"
ANALYTICS := kpis weekly opportunities trends funnel cohorts rhythm at-risk suggestions services multi-vertical \
	affinity assortment

warm:  ## Calienta la API antes de una demo (con la API ya corriendo; repetirlo tras un rato sin uso)
	@for q in $(DEMO_PHRASES); do \
	  curl -s -o /dev/null -w "  %{time_total}s  $$q\n" -X POST $(API)/agent/ask -H 'Content-Type: application/json' \
	    -d "{\"message\": \"$$q\"}" || exit 1; done
	@for m in $(ANALYTICS); do for s in synthetic prototype; do \
	  curl -s -o /dev/null $(API)/analytics/$$m?source=$$s; done; done
	@curl -s -o /dev/null $(API)/analytics/catalog && echo "Lista: API caliente."

FRASES ?=
probar-agente:  ## Prueba al agente con las frases de usuarios (con la API corriendo; ver docs/pruebas-de-usuario.md)
	@$(PY) scripts/probar_agente.py $(FRASES)

purge:  ## Borra el texto de consultas con más de 90 días (docs/diseno-ia.md §2) y a las personas del prototipo sin actividad en 180
	$(PY) -m rappi_ia purge

layers:  ## Capa de perfiles: medidas, marcas, atributos y grafo (crece con las etapas del plan)
	$(PY) -m rappi_ia measures
	$(PY) -m rappi_ia brands
	$(PY) -m rappi_ia canonical
	$(PY) -m rappi_ia attributes
	$(PY) -m rappi_ia relations
	$(PY) -m rappi_ia segments --source synthetic
	$(PY) -m rappi_ia segments --source prototype

layer-report:  ## Reporte de calidad de las capas de perfiles (data/eval/capas.md)
	$(PY) -m rappi_ia layer-report

# purge va primero, para que la retención de 90 días se cumpla aunque falle un paso posterior, y otra vez al final
# para los eventos simulados que synth acaba de generar.
post-refresh: migrate purge  ## Todo lo que sigue a un `rappi refresh` (sin imágenes)
	$(MAKE) jev-categorias concepts knowledge embed eval synth layers
	$(MAKE) purge
	@echo "Listo: conceptos, tarjetas del juego, embeddings, evaluación y datos simulados al día."
