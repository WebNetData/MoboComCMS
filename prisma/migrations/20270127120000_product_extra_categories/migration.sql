-- A product may be listed under further categories beside its main one (Product."categoryId" stays the main one,
-- used for its path and attributes). Additive: no existing row changes.
CREATE TABLE "ProductCategoryAssignment" (
    "productId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    CONSTRAINT "ProductCategoryAssignment_pkey" PRIMARY KEY ("productId", "categoryId")
);

CREATE INDEX "ProductCategoryAssignment_categoryId_idx" ON "ProductCategoryAssignment"("categoryId");

ALTER TABLE "ProductCategoryAssignment" ADD CONSTRAINT "ProductCategoryAssignment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductCategoryAssignment" ADD CONSTRAINT "ProductCategoryAssignment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
