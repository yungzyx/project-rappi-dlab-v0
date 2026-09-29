.PHONY: help install install-ml db-test migrate test lint format concepts embed eval synth analytics serve serve-lan images purge post-refresh

PY := .venv/bin/python
# Python ≥ 3.12 para crear el .venv. En un Mac nuevo `python3` es el 3.9 de macOS: se prefiere python3.13
# (Homebrew: `brew install python@3.13`, que solo instala `python3.13`).
PYTHON ?= $(shell command -v python3.13 || command -v python3)
PG_BIN := $(shell brew --prefix 2>/dev/null)/opt/postgresql@17/bin

help:  ## Muestra esta ayuda
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-12s %s\n", $$1, $$2}'

install:  ## Crea .venv con rappi-scraper (esquema) + API + dev (sin modelos)
	$(PYTHON) -m venv .venv
	$(PY) -m pip install -q --upgrade pip
	$(PY) -m pip install -q -e ../rappi-scraper -e ".[api,dev]"
	@test -f .env || cp .env.example .env

install-ml:  ## Agrega modelos locales: e5 y CLIP (torch), Whisper y Claude opcional (~1 GB de paquetes)
	$(PY) -m pip install -q -e ".[ml,audio,llm]"

db-test:  ## Crea la base de tests propia (rappi_ia_test)
	-$(PG_BIN)/createdb rappi_ia_test

migrate:  ## Aplica migraciones pendientes (viven en rappi-scraper)
	$(PY) -m rappi_ia migrate

test:  ## Tests (unitarios + integración contra rappi_ia_test)
	$(PY) -m pytest

lint:  ## Revisa estilo y errores comunes
	$(PY) -m ruff check src tests
	$(PY) -m ruff format --check src tests

format:  ## Formatea el código
	$(PY) -m ruff check --fix src tests
	$(PY) -m ruff format src tests

concepts:  ## Capa 2: conceptos por producto y plato (con kNN si hay extra ml)
	$(PY) -m rappi_ia concepts

embed:  ## Embeddings de texto (incrementales) + índices HNSW por vertical
	$(PY) -m rappi_ia embed-text

# La tarea semanal (rappi-scraper/scripts/refresh-semanal.sh) pasa EVAL_ARGS= para no tocar eval/thresholds.json
EVAL_ARGS ?= --guardar-tau

eval:  ## Evalúa la búsqueda (léxico vs vectorial vs híbrido) y calibra τ
	$(PY) -m rappi_ia eval-search $(EVAL_ARGS)

synth:  ## Usuarios y eventos SIMULADOS para el panel (reemplaza los anteriores)
	$(PY) -m rappi_ia synth

analytics:  ## Resumen de métricas del panel
	$(PY) -m rappi_ia analytics

# Con los pesos ya descargados, la API no consulta huggingface.co al cargarlos (~20 peticiones por arranque).
HF_CACHE := $(or $(HF_HUB_CACHE),$(HOME)/.cache/huggingface/hub)
HF_MODELS := intfloat--multilingual-e5-base sentence-transformers--clip-ViT-B-32 \
	sentence-transformers--clip-ViT-B-32-multilingual-v1 Systran--faster-whisper-small
HF_OFFLINE := $(shell for m in $(HF_MODELS); do test -d "$(HF_CACHE)/models--$$m" || exit 0; done; echo HF_HUB_OFFLINE=1)

serve:  ## API en http://localhost:8000, solo este Mac (docs en /docs)
	$(HF_OFFLINE) $(PY) -m uvicorn rappi_ia.api.app:app --host 127.0.0.1 --port 8000

serve-lan:  ## API abierta a la red local (para el iPhone). Sin autenticación: solo en una red de confianza
	$(HF_OFFLINE) API_ALLOW_LAN=1 $(PY) -m uvicorn rappi_ia.api.app:app --host 0.0.0.0 --port 8000

images:  ## Fotos del catálogo con CLIP (miles de descargas: correr con el scraper detenido)
	$(PY) -m rappi_ia embed-images

purge:  ## Borra el texto de consultas con más de 90 días (retención de docs/diseno-ia.md §2)
	$(PY) -m rappi_ia purge

post-refresh: migrate concepts embed eval synth purge  ## Todo lo que sigue a un `rappi refresh` (sin imágenes)
	@echo "Listo: conceptos, embeddings, evaluación y datos simulados al día."
