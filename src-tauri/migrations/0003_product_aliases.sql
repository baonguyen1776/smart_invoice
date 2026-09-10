CREATE TABLE product_aliases (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL,
    alias TEXT NOT NULL CHECK (length(trim(alias)) > 0 AND alias = trim(alias)),
    normalized_alias TEXT NOT NULL
        CHECK (length(trim(normalized_alias)) > 0 AND normalized_alias = trim(normalized_alias)),
    source_key TEXT CHECK (
        source_key IS NULL OR
        (length(trim(source_key)) > 0 AND source_key = trim(source_key))
    ),
    source_name_raw TEXT CHECK (
        source_name_raw IS NULL OR
        (length(trim(source_name_raw)) > 0 AND source_name_raw = trim(source_name_raw))
    ),
    unit_name TEXT CHECK (
        unit_name IS NULL OR
        (length(trim(unit_name)) > 0 AND unit_name = trim(unit_name))
    ),
    created_at TEXT NOT NULL,
    CHECK (source_name_raw IS NULL OR source_key IS NOT NULL),
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

-- Duplicate spellings are prevented within one Product and source scope.
-- The same alias may intentionally resolve to multiple Products so search can
-- surface ambiguity instead of silently choosing the wrong catalog item.
CREATE UNIQUE INDEX product_aliases_global_unique
    ON product_aliases(product_id, normalized_alias COLLATE UNICODE_LOWER)
    WHERE source_key IS NULL;
CREATE UNIQUE INDEX product_aliases_scoped_unique
    ON product_aliases(
        product_id,
        source_key COLLATE UNICODE_LOWER,
        normalized_alias COLLATE UNICODE_LOWER
    )
    WHERE source_key IS NOT NULL;

CREATE INDEX product_aliases_product_idx ON product_aliases(product_id);
CREATE INDEX product_aliases_global_lookup_idx
    ON product_aliases(normalized_alias COLLATE UNICODE_LOWER)
    WHERE source_key IS NULL;
CREATE INDEX product_aliases_scoped_lookup_idx
    ON product_aliases(
        source_key COLLATE UNICODE_LOWER,
        normalized_alias COLLATE UNICODE_LOWER
    )
    WHERE source_key IS NOT NULL;
