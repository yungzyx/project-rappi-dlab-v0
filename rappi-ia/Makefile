.PHONY: help install install-ml db-test migrate test lint format concepts embed eval synth analytics serve

PY := .venv/bin/python
PG_BIN := $(shell brew --prefix 2>/dev/null)/opt/postgresql@17/bin

help:  ## Muestra esta ayuda
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-12s %s\n", $$1, $$2}'

install:  ## Crea .venv con rappi-scraper (esquema) + API + dev (sin modelos)
	python3 -m venv .venv
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

eval:  ## Evalúa la búsqueda (léxico vs vectorial vs híbrido) y calibra τ
	$(PY) -m rappi_ia eval-search --guardar-tau

synth:  ## Usuarios y eventos SIMULADOS para el panel (reemplaza los anteriores)
	$(PY) -m rappi_ia synth

analytics:  ## Resumen de métricas del panel
	$(PY) -m rappi_ia analytics

serve:  ## API en http://localhost:8000 (docs en /docs)
	$(PY) -m uvicorn rappi_ia.api.app:app --host 0.0.0.0 --port 8000
