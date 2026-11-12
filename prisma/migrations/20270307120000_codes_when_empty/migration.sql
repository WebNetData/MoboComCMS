-- What a code product does when its shelf is empty (owner 2026-11-12): STOP selling (as before), or keep selling and
-- hand the order to a specialist. Additive; every product keeps STOP.
ALTER TABLE "Product" ADD COLUMN "codesWhenEmpty" TEXT NOT NULL DEFAULT 'STOP';
ALTER TABLE "Product" ADD CONSTRAINT "Product_codesWhenEmpty_check" CHECK ("codesWhenEmpty" IN ('STOP', 'STAFF'));
