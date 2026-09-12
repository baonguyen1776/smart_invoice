-- Migration 0006: Add optional free-text note to invoice_items
ALTER TABLE invoice_items ADD COLUMN note TEXT DEFAULT NULL
    CHECK (note IS NULL OR length(trim(note)) > 0);
