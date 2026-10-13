-- Orders that need something from the buyer, and services whose foreign amount the buyer types.
-- Additive only: every existing product, cart line and order line keeps working with the defaults.
ALTER TABLE "Product" ADD COLUMN "orderFields" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Product" ADD COLUMN "openAmount" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "openCurrencies" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "openMinMinor" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "openMaxMinor" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD CONSTRAINT "Product_open_amount_check" CHECK ("openMinMinor" >= 0 AND "openMaxMinor" >= 0 AND ("openMaxMinor" = 0 OR "openMaxMinor" >= "openMinMinor"));

ALTER TABLE "CartLine" ADD COLUMN "inputs" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CartLine" ADD COLUMN "openAmountMinor" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "CartLine" ADD COLUMN "openCurrency" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CartLine" ADD CONSTRAINT "CartLine_open_amount_check" CHECK ("openAmountMinor" >= 0);

ALTER TABLE "OrderLine" ADD COLUMN "inputs" TEXT NOT NULL DEFAULT '';
ALTER TABLE "OrderLine" ADD COLUMN "openAmountMinor" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "OrderLine" ADD COLUMN "openCurrency" TEXT NOT NULL DEFAULT '';
ALTER TABLE "OrderLine" ADD COLUMN "openRate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "OrderLine" ADD COLUMN "inputsErasedAt" TIMESTAMP(3);
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_open_amount_check" CHECK ("openAmountMinor" >= 0);
