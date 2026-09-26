.PHONY: help install db migrate test test-unit test-integration lint format status report

PY := .venv/bin/python
# postgresql@17 de Homebrew no agrega sus comandos al PATH
PG_BIN := $(shell brew --prefix 2>/dev/null)/opt/postgresql@17/bin

help:  ## Muestra esta ayuda
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-17s %s\n", $$1, $$2}'

install:  ## Crea .venv e instala el proyecto con dependencias de desarrollo
	python3 -m venv .venv
	$(PY) -m pip install -q --upgrade pip
	$(PY) -m pip install -q -e ".[dev]"
	@test -f .env || cp .env.example .env

db:  ## Instala y levanta Postgres 17 + pgvector (Homebrew) y crea las bases
	brew install postgresql@17 pgvector
	brew services start postgresql@17
	-$(PG_BIN)/createdb rappi
	-$(PG_BIN)/createdb rappi_test

migrate:  ## Aplica migraciones pendientes
	$(PY) -m rappi_scraper migrate

test:  ## Corre todos los tests
	$(PY) -m pytest

test-unit:  ## Solo tests unitarios (sin base de datos)
	$(PY) -m pytest tests/unit

test-integration:  ## Solo tests contra la base rappi_test
	$(PY) -m pytest tests/integration

lint:  ## Revisa estilo y errores comunes
	$(PY) -m ruff check src tests
	$(PY) -m ruff format --check src tests

format:  ## Formatea el código
	$(PY) -m ruff check --fix src tests
	$(PY) -m ruff format src tests

status:  ## Estado de las corridas y resumen por vertical
	$(PY) -m rappi_scraper status

report:  ## Reporte de calidad de la última corrida de tiendas
	$(PY) -m rappi_scraper report
