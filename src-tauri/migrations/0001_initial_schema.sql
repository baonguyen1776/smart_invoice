CREATE TABLE products (
    id TEXT PRIMARY KEY NOT NULL,
    sku TEXT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    brand TEXT CHECK (brand IS NULL OR length(trim(brand)) > 0),
    category TEXT CHECK (category IS NULL OR length(trim(category)) > 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (sku IS NULL OR length(trim(sku)) > 0)
);

CREATE UNIQUE INDEX products_sku_unique
    ON products(sku COLLATE NOCASE)
    WHERE sku IS NOT NULL;
CREATE INDEX products_is_active_idx ON products(is_active);
CREATE INDEX products_name_idx ON products(name COLLATE NOCASE);
CREATE INDEX products_brand_idx ON products(brand COLLATE NOCASE);
CREATE INDEX products_category_idx ON products(category COLLATE NOCASE);

CREATE TABLE units (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    price INTEGER NOT NULL CHECK (price BETWEEN 0 AND 9007199254740991),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX units_product_name_unique
    ON units(product_id, name COLLATE NOCASE);
CREATE INDEX units_product_activity_idx ON units(product_id, is_active);

CREATE TABLE invoices (
    id TEXT PRIMARY KEY NOT NULL,
    invoice_number INTEGER NOT NULL UNIQUE
        CHECK (invoice_number BETWEEN 1 AND 9007199254740991),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'completed')),
    total INTEGER NOT NULL DEFAULT 0
        CHECK (total BETWEEN 0 AND 9007199254740991),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    CHECK (
        (status = 'draft' AND completed_at IS NULL) OR
        (status = 'completed' AND completed_at IS NOT NULL)
    )
);

CREATE INDEX invoices_status_idx ON invoices(status);
CREATE INDEX invoices_created_at_idx ON invoices(created_at);

CREATE TABLE invoice_items (
    id TEXT PRIMARY KEY NOT NULL,
    invoice_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    product_name TEXT NOT NULL CHECK (length(trim(product_name)) > 0),
    product_sku TEXT CHECK (product_sku IS NULL OR length(trim(product_sku)) > 0),
    product_brand TEXT CHECK (product_brand IS NULL OR length(trim(product_brand)) > 0),
    unit_name TEXT NOT NULL CHECK (length(trim(unit_name)) > 0),
    unit_price INTEGER NOT NULL CHECK (unit_price BETWEEN 0 AND 9007199254740991),
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 9007199254740991),
    subtotal INTEGER NOT NULL CHECK (subtotal BETWEEN 0 AND 9007199254740991),
    created_at TEXT NOT NULL,
    CHECK (subtotal = unit_price * quantity),
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT
);

CREATE INDEX invoice_items_invoice_idx ON invoice_items(invoice_id);
CREATE INDEX invoice_items_product_idx ON invoice_items(product_id);
CREATE INDEX invoice_items_unit_idx ON invoice_items(unit_id);
