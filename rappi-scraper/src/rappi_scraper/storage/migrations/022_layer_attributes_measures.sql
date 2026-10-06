-- Capa de perfiles, etapa 1 (docs/superpowers/specs/2026-10-06-capa-perfiles-design.md): linaje de corridas,
-- atributos de ítem y medidas normalizadas. `capa` es el esquema estable para herramientas externas (vistas).
CREATE SCHEMA IF NOT EXISTS capa;

CREATE TABLE layer_runs (
    run_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    layer         text NOT NULL CHECK (layer IN ('attributes', 'measures', 'brands', 'canonical', 'relations', 'segments')),
    rules_version text NOT NULL,
    started_at    timestamptz NOT NULL DEFAULT now(),
    finished_at   timestamptz,
    status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
    counts        jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX layer_runs_layer_idx ON layer_runs (layer, started_at DESC);

CREATE TABLE attribute_defs (
    attribute_id  text PRIMARY KEY,
    name          text NOT NULL,
    family        text NOT NULL,
    applies_to    text NOT NULL CHECK (applies_to IN ('catalog_item', 'menu_item', 'both')),
    value_type    text NOT NULL CHECK (value_type IN ('flag', 'text')),
    description   text NOT NULL DEFAULT '',
    rules_version text NOT NULL
);

CREATE TABLE item_attributes (
    entity_type   text NOT NULL CHECK (entity_type IN ('catalog_item', 'menu_item')),
    entity_id     text NOT NULL,
    attribute_id  text NOT NULL REFERENCES attribute_defs (attribute_id) ON DELETE CASCADE,
    value         text,
    source        text NOT NULL CHECK (source IN ('rappi', 'regla', 'derivado', 'aprendido', 'curado')),
    confidence    real NOT NULL,
    evidence      text,
    rules_version text NOT NULL,
    run_id        bigint REFERENCES layer_runs (run_id) ON DELETE SET NULL,
    PRIMARY KEY (entity_type, entity_id, attribute_id)
);
CREATE INDEX item_attributes_attribute_idx ON item_attributes (attribute_id, entity_type);

CREATE TABLE item_measures (
    entity_type   text NOT NULL CHECK (entity_type IN ('catalog_item', 'menu_item')),
    entity_id     text NOT NULL,
    quantity      double precision,
    unit          text CHECK (unit IN ('g', 'ml', 'und', 'cm')),
    pack          integer NOT NULL DEFAULT 1 CHECK (pack >= 1),
    total         double precision,
    size_label    text,
    source        text NOT NULL CHECK (source IN ('rappi', 'regla')),
    evidence      text,
    run_id        bigint REFERENCES layer_runs (run_id) ON DELETE SET NULL,
    PRIMARY KEY (entity_type, entity_id)
);

COMMENT ON TABLE layer_runs IS 'Linaje: cada corrida de cada capa derivada (qué reglas, cuántas filas, cuándo).';
COMMENT ON TABLE attribute_defs IS 'Vocabulario de atributos de ítem (sin gluten, vegano, familiar…), sembrado desde attributes.toml.';
COMMENT ON TABLE item_attributes IS 'Atributos de cada producto o plato, con fuente (rappi, regla, derivado), confianza y evidencia.';
COMMENT ON TABLE item_measures IS 'Tamaño normalizado de cada ítem: cantidad por unidad, unidad base (g, ml, und), pack y total.';
