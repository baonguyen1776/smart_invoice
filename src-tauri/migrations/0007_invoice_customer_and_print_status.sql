-- Migration 0007: Add customer metadata and print tracking to invoices
ALTER TABLE invoices ADD COLUMN customer_name TEXT DEFAULT NULL
    CHECK (customer_name IS NULL OR length(trim(customer_name)) > 0);
ALTER TABLE invoices ADD COLUMN customer_phone TEXT DEFAULT NULL
    CHECK (customer_phone IS NULL OR length(trim(customer_phone)) > 0);
ALTER TABLE invoices ADD COLUMN customer_address TEXT DEFAULT NULL
    CHECK (customer_address IS NULL OR length(trim(customer_address)) > 0);
ALTER TABLE invoices ADD COLUMN customer_note TEXT DEFAULT NULL
    CHECK (customer_note IS NULL OR length(trim(customer_note)) > 0);
ALTER TABLE invoices ADD COLUMN is_printed INTEGER NOT NULL DEFAULT 0
    CHECK (is_printed IN (0, 1));
ALTER TABLE invoices ADD COLUMN printed_at TEXT DEFAULT NULL;

CREATE INDEX invoices_customer_name_idx ON invoices(customer_name COLLATE NOCASE);
CREATE INDEX invoices_customer_phone_idx ON invoices(customer_phone);
CREATE INDEX invoices_is_printed_idx ON invoices(is_printed);
