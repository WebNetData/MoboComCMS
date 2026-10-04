-- Additive observation storage. Existing catalog/financial records are unchanged.
-- Baselines are captured separately in bounded work, never fabricated as past prices.
CREATE TABLE "ProductPricePoint" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "variantId" INTEGER NOT NULL DEFAULT 0,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductPricePoint_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductPricePoint_amount_positive" CHECK ("amountMinor" > 0),
    CONSTRAINT "ProductPricePoint_variant_nonnegative" CHECK ("variantId" >= 0)
);

CREATE INDEX "ProductPricePoint_productId_variantId_recordedAt_id_idx"
ON "ProductPricePoint"("productId", "variantId", "recordedAt", "id");

ALTER TABLE "ProductPricePoint" ADD CONSTRAINT "ProductPricePoint_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
