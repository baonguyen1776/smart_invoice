-- Migration 0005: Allow negative-quantity return/deduction lines and negative invoice totals.
-- Preserve existing data and foreign key integrity.

-- Step 1: Create invoices_new with widened total CHECK constraint and copy existing data.
CREATE TABLE invoices_new (
    id TEXT PRIMARY KEY NOT NULL,
    invoice_number INTEGER NOT NULL UNIQUE
        CHECK (invoice_number BETWEEN 1 AND 9007199254740991),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'completed')),
    total INTEGER NOT NULL DEFAULT 0
        CHECK (total BETWEEN -9007199254740991 AND 9007199254740991),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    CHECK (
        (status = 'draft' AND completed_at IS NULL) OR
        (status = 'completed' AND completed_at IS NOT NULL)
    )
);

INSERT INTO invoices_new (
    id, invoice_number, status, total, created_at, updated_at, completed_at
)
SELECT
    id, invoice_number, status, total, created_at, updated_at, completed_at
FROM invoices;

-- Step 2: Create invoice_items_new with widened quantity and subtotal CHECK constraints and copy existing data.
CREATE TABLE invoice_items_new (
    id TEXT PRIMARY KEY NOT NULL,
    invoice_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    product_name TEXT NOT NULL CHECK (length(trim(product_name)) > 0),
    product_sku TEXT CHECK (product_sku IS NULL OR length(trim(product_sku)) > 0),
    product_brand TEXT CHECK (product_brand IS NULL OR length(trim(product_brand)) > 0),
    unit_name TEXT NOT NULL CHECK (length(trim(unit_name)) > 0),
    unit_price INTEGER NOT NULL CHECK (unit_price BETWEEN 0 AND 9007199254740991),
    quantity INTEGER NOT NULL CHECK (
        (quantity BETWEEN -9007199254740991 AND -1) OR
        (quantity BETWEEN 1 AND 9007199254740991)
    ),
    subtotal INTEGER NOT NULL CHECK (subtotal BETWEEN -9007199254740991 AND 9007199254740991),
    discount_basis_points INTEGER NOT NULL DEFAULT 0 CHECK (
        typeof(discount_basis_points) = 'integer' AND discount_basis_points BETWEEN 0 AND 10000
    ),
    created_at TEXT NOT NULL,
    CHECK (subtotal = unit_price * quantity),
    FOREIGN KEY (invoice_id) REFERENCES invoices_new(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT
);

INSERT INTO invoice_items_new (
    id, invoice_id, product_id, unit_id, product_name, product_sku,
    product_brand, unit_name, unit_price, quantity, subtotal,
    discount_basis_points, created_at
)
SELECT
    id, invoice_id, product_id, unit_id, product_name, product_sku,
    product_brand, unit_name, unit_price, quantity, subtotal,
    discount_basis_points, created_at
FROM invoice_items;

-- Step 3: Drop child table invoice_items first so dropping invoices does not cascade-delete items.
DROP TABLE invoice_items;
DROP TABLE invoices;

-- Step 4: Rename new tables to production names.
ALTER TABLE invoices_new RENAME TO invoices;
ALTER TABLE invoice_items_new RENAME TO invoice_items;

-- Step 5: Recreate indexes on both tables.
CREATE INDEX invoices_status_idx ON invoices(status);
CREATE INDEX invoices_created_at_idx ON invoices(created_at);
CREATE INDEX invoice_items_invoice_idx ON invoice_items(invoice_id);
CREATE INDEX invoice_items_product_idx ON invoice_items(product_id);
CREATE INDEX invoice_items_unit_idx ON invoice_items(unit_id);

-- Step 6: Recreate integer integrity triggers from 0002.
DROP TRIGGER IF EXISTS invoices_integer_insert;
DROP TRIGGER IF EXISTS invoices_integer_update;
DROP TRIGGER IF EXISTS invoice_items_integer_insert;
DROP TRIGGER IF EXISTS invoice_items_integer_update;

CREATE TRIGGER invoices_integer_insert BEFORE INSERT ON invoices
WHEN typeof(NEW.invoice_number) <> 'integer' OR typeof(NEW.total) <> 'integer'
BEGIN
    SELECT RAISE(ABORT, 'Money and quantities must be integers');
END;

CREATE TRIGGER invoices_integer_update BEFORE UPDATE ON invoices
WHEN typeof(NEW.invoice_number) <> 'integer' OR typeof(NEW.total) <> 'integer'
BEGIN
    SELECT RAISE(ABORT, 'Money and quantities must be integers');
END;

CREATE TRIGGER invoice_items_integer_insert BEFORE INSERT ON invoice_items
WHEN typeof(NEW.unit_price) <> 'integer' OR typeof(NEW.quantity) <> 'integer' OR typeof(NEW.subtotal) <> 'integer'
BEGIN
    SELECT RAISE(ABORT, 'Money and quantities must be integers');
END;

CREATE TRIGGER invoice_items_integer_update BEFORE UPDATE ON invoice_items
WHEN typeof(NEW.unit_price) <> 'integer' OR typeof(NEW.quantity) <> 'integer' OR typeof(NEW.subtotal) <> 'integer'
BEGIN
    SELECT RAISE(ABORT, 'Money and quantities must be integers');
END;
