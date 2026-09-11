-- Existing invoices retain their original totals with a zero discount.
ALTER TABLE invoice_items ADD COLUMN discount_basis_points INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(discount_basis_points) = 'integer' AND discount_basis_points BETWEEN 0 AND 10000);
