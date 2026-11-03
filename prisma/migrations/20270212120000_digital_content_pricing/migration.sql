-- Additive: retain existing product/group/VIP prices, purchases and orders.
ALTER TABLE "Product" ADD COLUMN "vipPricing" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PaidItem" ADD COLUMN "pricingRules" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ProductGroupPrice" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'PRICE';
ALTER TABLE "ProductGroupPrice" DROP CONSTRAINT "ProductGroupPrice_positive";
ALTER TABLE "ProductGroupPrice" ADD CONSTRAINT "ProductGroupPrice_mode_check" CHECK ("mode" IN ('PRICE','PERCENT','AMOUNT','FREE'));
ALTER TABLE "ProductGroupPrice" ADD CONSTRAINT "ProductGroupPrice_value_check" CHECK (
  ("mode" = 'PRICE' AND "priceMinor" >= 0) OR
  ("mode" = 'AMOUNT' AND "priceMinor" > 0) OR
  ("mode" = 'PERCENT' AND "priceMinor" BETWEEN 1 AND 10000) OR
  ("mode" = 'FREE' AND "priceMinor" = 0)
);
CREATE TABLE "ProductFile" (
  "id" SERIAL PRIMARY KEY,
  "productId" INTEGER NOT NULL REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "label" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL CHECK ("sizeBytes" > 0),
  "sha256" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ProductFile_storageKey_key" ON "ProductFile"("storageKey");
CREATE INDEX "ProductFile_productId_active_idx" ON "ProductFile"("productId", "active");
CREATE INDEX "Product_kind_digitalMode_active_idx" ON "Product"("kind", "digitalMode", "active");
