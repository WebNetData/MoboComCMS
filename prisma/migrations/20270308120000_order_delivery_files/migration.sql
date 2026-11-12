-- Files a specialist hands the buyer of a virtual order with its delivery (owner 2026-11-12): a text file, an archive,
-- anything. Private blobs (media private-files); the buyer downloads them once the order is delivered. Additive.
CREATE TABLE "OrderDeliveryFile" (
  "id" SERIAL PRIMARY KEY,
  "orderId" INTEGER NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "label" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL CHECK ("sizeBytes" > 0),
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "OrderDeliveryFile_storageKey_key" ON "OrderDeliveryFile"("storageKey");
CREATE INDEX "OrderDeliveryFile_orderId_idx" ON "OrderDeliveryFile"("orderId");
