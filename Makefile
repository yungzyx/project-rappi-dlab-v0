.PHONY: help mvp mvp-check build

.DEFAULT_GOAL := help

help:  ## Muestra esta ayuda
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-10s %s\n", $$1, $$2}'

# Los subproyectos tienen sus propios Makefile (rappi-scraper/ y rappi-ia/: install, test, lint, serve…).
mvp:  ## Demo local con servidores de desarrollo (base real, API :8000, app :5174, panel :5175; LAN=1 abre a la red local); para un servidor, ver docs/despliegue.md
	@LAN="$(LAN)" scripts/mvp.sh

mvp-check:  ## Recorre la app con Chrome contra un catálogo de prueba inventado (rappi_ia_test, :8010, :5184 y el panel en :5185)
	@scripts/mvp-check.sh

# Dónde buscan la API las dos apps construidas: por defecto el mismo origen bajo /api (un proxy inverso la sirve).
VITE_API_URL ?= /api

build:  ## Construye la app y el panel para un servidor (VITE_API_URL=/api; VITE_DEMO=1 deja el interruptor de la demo; PANEL_BASE=/panel/) y revisa que dist/ no tenga rastros de desarrollo
	cd prototipo-app && npm ci && VITE_API_URL="$(VITE_API_URL)" npm run build
	cd dashboard-empresa && npm ci && VITE_API_URL="$(VITE_API_URL)" npm run build
	@scripts/check-dist.sh
