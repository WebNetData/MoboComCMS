-- Existing coupons remain site-only; existing advertised product prices keep their prior shared-counter behavior.
ALTER TABLE "Promotion" ADD COLUMN "salesChannel" TEXT NOT NULL DEFAULT 'ONLINE';
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_salesChannel_check" CHECK ("salesChannel" IN ('ONLINE', 'COUNTER', 'BOTH'));
ALTER TABLE "Product" ADD COLUMN "saleChannel" TEXT NOT NULL DEFAULT 'BOTH';
ALTER TABLE "Product" ADD CONSTRAINT "Product_saleChannel_check" CHECK ("saleChannel" IN ('ONLINE', 'COUNTER', 'BOTH'));
