CREATE TABLE "ProductAttributeGroup" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "nameEn" TEXT NOT NULL DEFAULT '',
  "appliesTo" TEXT NOT NULL DEFAULT 'ANY',
  "fields" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductAttributeGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProductCategory" ADD COLUMN "parentId" INTEGER;
ALTER TABLE "ProductCategory" ADD COLUMN "attributeGroupId" INTEGER;
CREATE INDEX "ProductCategory_parentId_idx" ON "ProductCategory"("parentId");
CREATE INDEX "ProductCategory_attributeGroupId_idx" ON "ProductCategory"("attributeGroupId");
ALTER TABLE "Product" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'VIRTUAL';
ALTER TABLE "Product" ADD COLUMN "specifications" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Product" ADD COLUMN "faqs" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Product" ADD COLUMN "gallery" TEXT NOT NULL DEFAULT '[]';

CREATE TABLE "ProductVariant" (
  "id" SERIAL NOT NULL,
  "productId" INTEGER NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameEn" TEXT NOT NULL DEFAULT '',
  "attributes" TEXT NOT NULL DEFAULT '{}',
  "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "priceMinor" BIGINT NOT NULL DEFAULT 0,
  "stock" INTEGER NOT NULL DEFAULT -1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");
CREATE INDEX "ProductVariant_productId_active_idx" ON "ProductVariant"("productId", "active");

CREATE TABLE "ProductReview" (
  "id" SERIAL NOT NULL,
  "productId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "rating" INTEGER NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "body" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductReview_productId_userId_key" ON "ProductReview"("productId", "userId");
CREATE INDEX "ProductReview_productId_status_createdAt_idx" ON "ProductReview"("productId", "status", "createdAt");

CREATE TABLE "ProductQuestion" (
  "id" SERIAL NOT NULL,
  "productId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "answer" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductQuestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProductQuestion_productId_status_createdAt_idx" ON "ProductQuestion"("productId", "status", "createdAt");

CREATE TABLE "ProductDelivery" (
  "id" SERIAL NOT NULL,
  "orderId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "address" TEXT NOT NULL DEFAULT '',
  "trackingCode" TEXT NOT NULL DEFAULT '',
  "deliveryNote" TEXT NOT NULL DEFAULT '',
  "digitalDelivery" TEXT NOT NULL DEFAULT '',
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductDelivery_orderId_key" ON "ProductDelivery"("orderId");

ALTER TABLE "InventoryReservation" ADD COLUMN "variantId" INTEGER;
ALTER TABLE "InventoryReservation" ADD COLUMN "variantFinite" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_attributeGroupId_fkey" FOREIGN KEY ("attributeGroupId") REFERENCES "ProductAttributeGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductQuestion" ADD CONSTRAINT "ProductQuestion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductQuestion" ADD CONSTRAINT "ProductQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductDelivery" ADD CONSTRAINT "ProductDelivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
