-- Empty additive storage; existing products, variants, carts and orders are untouched.
CREATE TABLE "ProductBundle" (
  "id" SERIAL NOT NULL,
  "productId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "nameEn" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT false,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductBundle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductBundle_position_nonnegative" CHECK ("position" >= 0)
);
CREATE TABLE "ProductBundleComponent" (
  "id" SERIAL NOT NULL,
  "bundleId" INTEGER NOT NULL,
  "productId" INTEGER,
  "variantKey" INTEGER NOT NULL DEFAULT 0,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProductBundleComponent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductBundleComponent_quantity" CHECK ("quantity" BETWEEN 1 AND 30),
  CONSTRAINT "ProductBundleComponent_variant" CHECK ("variantKey" >= 0),
  CONSTRAINT "ProductBundleComponent_position" CHECK ("position" >= 0)
);
CREATE INDEX "ProductBundle_productId_active_position_id_idx" ON "ProductBundle"("productId", "active", "position", "id");
CREATE UNIQUE INDEX "ProductBundleComponent_bundleId_productId_variantKey_key" ON "ProductBundleComponent"("bundleId", "productId", "variantKey");
CREATE INDEX "ProductBundleComponent_bundleId_position_id_idx" ON "ProductBundleComponent"("bundleId", "position", "id");
CREATE INDEX "ProductBundleComponent_productId_idx" ON "ProductBundleComponent"("productId");
ALTER TABLE "ProductBundle" ADD CONSTRAINT "ProductBundle_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductBundleComponent" ADD CONSTRAINT "ProductBundleComponent_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "ProductBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductBundleComponent" ADD CONSTRAINT "ProductBundleComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
