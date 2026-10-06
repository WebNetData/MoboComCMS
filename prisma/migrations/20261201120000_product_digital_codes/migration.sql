-- Additive: a pool of codes a virtual product delivers by itself on payment. Every existing product stays MANUAL.
ALTER TABLE "Product" ADD COLUMN "digitalMode" TEXT NOT NULL DEFAULT 'MANUAL';
CREATE TABLE "ProductDigitalCode" (
  "id" SERIAL NOT NULL,
  "productId" INTEGER NOT NULL,
  "variantId" INTEGER,
  "secret" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "orderId" INTEGER,
  "orderLine" INTEGER,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductDigitalCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductDigitalCode_productId_fingerprint_key" ON "ProductDigitalCode"("productId", "fingerprint");
CREATE INDEX "ProductDigitalCode_productId_variantId_orderId_idx" ON "ProductDigitalCode"("productId", "variantId", "orderId");
CREATE INDEX "ProductDigitalCode_orderId_idx" ON "ProductDigitalCode"("orderId");
ALTER TABLE "ProductDigitalCode" ADD CONSTRAINT "ProductDigitalCode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
