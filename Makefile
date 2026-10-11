.PHONY: help mvp mvp-check

.DEFAULT_GOAL := help

help:  ## Muestra esta ayuda
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-10s %s\n", $$1, $$2}'

# Los subproyectos tienen sus propios Makefile (rappi-scraper/ y rappi-ia/: install, test, lint, serve…).
mvp:  ## Levanta el MVP: base real → API :8000 → app :5174 → panel :5175 (LAN=1 abre la API y la app a la red local)
	@LAN="$(LAN)" scripts/mvp.sh

mvp-check:  ## Recorre la app con Chrome contra un catálogo de prueba inventado (rappi_ia_test, :8010, :5184 y el panel en :5185)
	@scripts/mvp-check.sh
