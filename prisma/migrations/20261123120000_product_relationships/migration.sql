-- Additive, empty editorial reference storage; no historical product data is rewritten.
CREATE TABLE "ProductRelationship" (
  "id" SERIAL NOT NULL,
  "productId" INTEGER NOT NULL,
  "targetId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProductRelationship_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductRelationship_no_self" CHECK ("productId" <> "targetId"),
  CONSTRAINT "ProductRelationship_kind" CHECK ("kind" IN ('RELATED', 'COMPLEMENTARY', 'COMPATIBLE')),
  CONSTRAINT "ProductRelationship_position_nonnegative" CHECK ("position" >= 0)
);
CREATE UNIQUE INDEX "ProductRelationship_productId_kind_targetId_key" ON "ProductRelationship"("productId", "kind", "targetId");
CREATE INDEX "ProductRelationship_productId_kind_position_id_idx" ON "ProductRelationship"("productId", "kind", "position", "id");
CREATE INDEX "ProductRelationship_targetId_idx" ON "ProductRelationship"("targetId");
ALTER TABLE "ProductRelationship" ADD CONSTRAINT "ProductRelationship_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductRelationship" ADD CONSTRAINT "ProductRelationship_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
