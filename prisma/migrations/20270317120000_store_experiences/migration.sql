ALTER TABLE "Product" ADD COLUMN "condition" TEXT NOT NULL DEFAULT 'NEW';
ALTER TABLE "Product" ADD COLUMN "conditionGrade" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "conditionNotes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "healthReport" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD CONSTRAINT "Product_condition_check" CHECK ("condition" IN ('NEW','OPEN_BOX','USED','REFURBISHED'));
ALTER TABLE "Product" ADD CONSTRAINT "Product_condition_grade_check" CHECK ("conditionGrade" IN ('','A','B','C'));

CREATE TABLE "ProductDeviceCompatibility" (
 "id" SERIAL PRIMARY KEY, "productId" INTEGER NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "deviceModel" TEXT NOT NULL, "normalizedModel" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'COMPATIBLE' CHECK ("status" IN ('COMPATIBLE','INCOMPATIBLE','CONDITIONAL')),
 "note" TEXT NOT NULL DEFAULT '', "source" TEXT NOT NULL DEFAULT '', "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ProductDeviceCompatibility_productId_normalizedModel_key" ON "ProductDeviceCompatibility"("productId","normalizedModel");
CREATE INDEX "ProductDeviceCompatibility_normalizedModel_idx" ON "ProductDeviceCompatibility"("normalizedModel");

CREATE TABLE "StockPurchase" (
 "id" SERIAL PRIMARY KEY, "number" TEXT NOT NULL, "requestId" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "supplier" TEXT NOT NULL, "locationId" INTEGER NOT NULL REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','PARTIAL','RECEIVED','CANCELLED')),
 "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0), "currency" TEXT NOT NULL DEFAULT 'IRT',
 "totalCostMinor" BIGINT NOT NULL CHECK ("totalCostMinor" >= 0), "expectedAt" TIMESTAMP(3), "note" TEXT NOT NULL DEFAULT '', "actorId" INTEGER,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "StockPurchase_number_key" ON "StockPurchase"("number");
CREATE UNIQUE INDEX "StockPurchase_requestId_key" ON "StockPurchase"("requestId");
CREATE INDEX "StockPurchase_status_expectedAt_idx" ON "StockPurchase"("status","expectedAt");

CREATE TABLE "StockPurchaseLine" (
 "id" SERIAL PRIMARY KEY, "purchaseId" INTEGER NOT NULL REFERENCES "StockPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "productId" INTEGER NOT NULL REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "variantId" INTEGER REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "itemKey" TEXT NOT NULL, "name" TEXT NOT NULL,
 "quantity" INTEGER NOT NULL CHECK ("quantity" > 0 AND "quantity" <= 1000000),
 "receivedQuantity" INTEGER NOT NULL DEFAULT 0 CHECK ("receivedQuantity" >= 0 AND "receivedQuantity" <= "quantity"),
 "unitCostMinor" BIGINT NOT NULL CHECK ("unitCostMinor" >= 0)
);
CREATE UNIQUE INDEX "StockPurchaseLine_purchaseId_itemKey_key" ON "StockPurchaseLine"("purchaseId","itemKey");

CREATE TABLE "StockPurchaseReceipt" (
 "id" SERIAL PRIMARY KEY,
 "purchaseId" INTEGER NOT NULL REFERENCES "StockPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "receiptId" INTEGER NOT NULL REFERENCES "StockReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StockPurchaseReceipt_receiptId_key" ON "StockPurchaseReceipt"("receiptId");
CREATE INDEX "StockPurchaseReceipt_purchaseId_idx" ON "StockPurchaseReceipt"("purchaseId");
