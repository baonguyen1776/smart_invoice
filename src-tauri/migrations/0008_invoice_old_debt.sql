-- Existing invoices retain their totals and have no old debt.
ALTER TABLE invoices ADD COLUMN old_debt INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(old_debt) = 'integer' AND old_debt BETWEEN 0 AND 9007199254740991);

CREATE TRIGGER invoices_final_total_insert BEFORE INSERT ON invoices
WHEN NEW.total > 9007199254740991 - NEW.old_debt
BEGIN SELECT RAISE(ABORT, 'Invoice final total exceeds the safe integer range'); END;

CREATE TRIGGER invoices_final_total_update BEFORE UPDATE OF total, old_debt ON invoices
WHEN NEW.total > 9007199254740991 - NEW.old_debt
BEGIN SELECT RAISE(ABORT, 'Invoice final total exceeds the safe integer range'); END;
