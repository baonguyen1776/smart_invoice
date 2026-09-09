-- Preserve 0001 and reject incompatible existing data instead of rounding it.
CREATE TEMP TABLE numeric_migration_guard (invalid_count INTEGER CHECK (invalid_count = 0));
INSERT INTO numeric_migration_guard
SELECT (SELECT count(*) FROM units WHERE typeof(price) <> 'integer')
     + (SELECT count(*) FROM invoices WHERE typeof(invoice_number) <> 'integer' OR typeof(total) <> 'integer')
     + (SELECT count(*) FROM invoice_items WHERE typeof(unit_price) <> 'integer' OR typeof(quantity) <> 'integer' OR typeof(subtotal) <> 'integer');
DROP TABLE numeric_migration_guard;

-- Registered on every managed connection. External writers must register it too.
DROP INDEX products_sku_unique;
CREATE UNIQUE INDEX products_sku_unique ON products(sku COLLATE UNICODE_LOWER) WHERE sku IS NOT NULL;
DROP INDEX units_product_name_unique;
CREATE UNIQUE INDEX units_product_name_unique ON units(product_id, name COLLATE UNICODE_LOWER);

CREATE TRIGGER units_integer_insert BEFORE INSERT ON units
WHEN typeof(NEW.price) <> 'integer'
BEGIN
    SELECT RAISE(ABORT, 'Money and quantities must be integers');
END;

CREATE TRIGGER units_integer_update BEFORE UPDATE ON units
WHEN typeof(NEW.price) <> 'integer'
BEGIN
    SELECT RAISE(ABORT, 'Money and quantities must be integers');
END;

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
