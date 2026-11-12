-- Stock locations (warehouse/shop), per-location quantities, the movement ledger, goods receiving and stock counts.
-- Product/ProductVariant.stock stay the site's sellable count; for tracked items they are recomputed from the
-- locations that sell online, minus Product.onlineReserve. Existing finite stock is moved into one default location.

ALTER TABLE "Product" ADD COLUMN "onlineReserve" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD CONSTRAINT "Product_onlineReserve_check" CHECK ("onlineReserve" >= 0 AND "onlineReserve" <= 1000000);
ALTER TABLE "InventoryReservation" ADD COLUMN "allocation" TEXT NOT NULL DEFAULT '';

CREATE TABLE "StockLocation" (
 "id" SERIAL PRIMARY KEY,
 "name" TEXT NOT NULL,
 "kind" TEXT NOT NULL DEFAULT 'WAREHOUSE',
 "sellsOnline" BOOLEAN NOT NULL DEFAULT true,
 "isDefault" BOOLEAN NOT NULL DEFAULT false,
 "active" BOOLEAN NOT NULL DEFAULT true,
 "sortOrder" INTEGER NOT NULL DEFAULT 0,
 "address" TEXT NOT NULL DEFAULT '',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "StockLocation_kind_check" CHECK ("kind" IN ('WAREHOUSE', 'SHOP')),
 CONSTRAINT "StockLocation_default_active_check" CHECK (NOT "isDefault" OR "active")
);
CREATE UNIQUE INDEX "StockLocation_one_default" ON "StockLocation"("isDefault") WHERE "isDefault";

ALTER TABLE "StoreRegisterSession" ADD COLUMN "locationId" INTEGER REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "LocationStock" (
 "id" SERIAL PRIMARY KEY,
 "locationId" INTEGER NOT NULL REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "productId" INTEGER NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "variantId" INTEGER REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "itemKey" TEXT NOT NULL,
 "quantity" INTEGER NOT NULL DEFAULT 0,
 "bin" TEXT NOT NULL DEFAULT '',
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "LocationStock_quantity_check" CHECK ("quantity" >= 0)
);
CREATE UNIQUE INDEX "LocationStock_locationId_itemKey_key" ON "LocationStock"("locationId", "itemKey");
CREATE INDEX "LocationStock_productId_idx" ON "LocationStock"("productId");

CREATE TABLE "StockMovement" (
 "id" SERIAL PRIMARY KEY,
 "locationId" INTEGER NOT NULL REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "productId" INTEGER NOT NULL,
 "variantId" INTEGER,
 "delta" INTEGER NOT NULL,
 "balance" INTEGER NOT NULL,
 "reason" TEXT NOT NULL,
 "orderId" INTEGER,
 "refType" TEXT NOT NULL DEFAULT '',
 "refId" INTEGER,
 "actorId" INTEGER,
 "note" TEXT NOT NULL DEFAULT '',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "StockMovement_balance_check" CHECK ("balance" >= 0),
 CONSTRAINT "StockMovement_reason_check" CHECK ("reason" IN ('INIT', 'HOLD', 'RELEASE', 'RESTOCK', 'TRANSFER', 'RECEIPT', 'COUNT', 'ADJUST'))
);
CREATE INDEX "StockMovement_locationId_createdAt_idx" ON "StockMovement"("locationId", "createdAt");
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");
CREATE INDEX "StockMovement_refType_refId_idx" ON "StockMovement"("refType", "refId");

CREATE TABLE "StockReceipt" (
 "id" SERIAL PRIMARY KEY,
 "number" TEXT NOT NULL,
 "requestId" TEXT NOT NULL,
 "locationId" INTEGER NOT NULL REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "supplier" TEXT NOT NULL DEFAULT '',
 "reference" TEXT NOT NULL DEFAULT '',
 "note" TEXT NOT NULL DEFAULT '',
 "currency" TEXT NOT NULL DEFAULT 'IRT',
 "totalCostMinor" BIGINT NOT NULL DEFAULT 0,
 "actorId" INTEGER,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "StockReceipt_total_check" CHECK ("totalCostMinor" >= 0)
);
CREATE UNIQUE INDEX "StockReceipt_number_key" ON "StockReceipt"("number");
CREATE UNIQUE INDEX "StockReceipt_requestId_key" ON "StockReceipt"("requestId");

CREATE TABLE "StockReceiptLine" (
 "id" SERIAL PRIMARY KEY,
 "receiptId" INTEGER NOT NULL REFERENCES "StockReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "productId" INTEGER NOT NULL,
 "variantId" INTEGER,
 "name" TEXT NOT NULL,
 "quantity" INTEGER NOT NULL,
 "unitCostMinor" BIGINT,
 CONSTRAINT "StockReceiptLine_values_check" CHECK ("quantity" > 0 AND ("unitCostMinor" IS NULL OR "unitCostMinor" >= 0))
);
CREATE INDEX "StockReceiptLine_receiptId_idx" ON "StockReceiptLine"("receiptId");

CREATE TABLE "StockCount" (
 "id" SERIAL PRIMARY KEY,
 "locationId" INTEGER NOT NULL REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "status" TEXT NOT NULL DEFAULT 'OPEN',
 "note" TEXT NOT NULL DEFAULT '',
 "actorId" INTEGER,
 "postedById" INTEGER,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "postedAt" TIMESTAMP(3),
 CONSTRAINT "StockCount_status_check" CHECK (("status" = 'OPEN' AND "postedAt" IS NULL) OR ("status" = 'POSTED' AND "postedAt" IS NOT NULL) OR "status" = 'CANCELLED')
);
CREATE INDEX "StockCount_locationId_status_idx" ON "StockCount"("locationId", "status");
CREATE UNIQUE INDEX "StockCount_one_open_per_location" ON "StockCount"("locationId") WHERE "status" = 'OPEN';

CREATE TABLE "StockCountLine" (
 "id" SERIAL PRIMARY KEY,
 "countId" INTEGER NOT NULL REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "productId" INTEGER NOT NULL,
 "variantId" INTEGER,
 "itemKey" TEXT NOT NULL,
 "name" TEXT NOT NULL,
 "counted" INTEGER NOT NULL,
 "expected" INTEGER,
 "delta" INTEGER,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "StockCountLine_counted_check" CHECK ("counted" >= 0)
);
CREATE UNIQUE INDEX "StockCountLine_countId_itemKey_key" ON "StockCountLine"("countId", "itemKey");

-- Backfill: one default warehouse that sells online holds today's finite own-store stock (code pools, unlimited stock and marketplace sellers stay untracked).
INSERT INTO "StockLocation" ("name", "kind", "sellsOnline", "isDefault", "sortOrder", "updatedAt") VALUES ('انبار اصلی', 'WAREHOUSE', true, true, 0, CURRENT_TIMESTAMP);

INSERT INTO "LocationStock" ("locationId", "productId", "variantId", "itemKey", "quantity", "updatedAt")
SELECT l."id", p."id", NULL, p."id" || ':0', p."stock", CURRENT_TIMESTAMP
FROM "Product" p CROSS JOIN (SELECT "id" FROM "StockLocation" WHERE "isDefault") l
WHERE p."stock" >= 0 AND p."digitalMode" <> 'CODES' AND p."sellerId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p."id" AND v."stock" >= 0);

INSERT INTO "LocationStock" ("locationId", "productId", "variantId", "itemKey", "quantity", "updatedAt")
SELECT l."id", v."productId", v."id", v."productId" || ':' || v."id", v."stock", CURRENT_TIMESTAMP
FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId" CROSS JOIN (SELECT "id" FROM "StockLocation" WHERE "isDefault") l
WHERE v."stock" >= 0 AND p."digitalMode" <> 'CODES' AND p."sellerId" IS NULL;

INSERT INTO "StockMovement" ("locationId", "productId", "variantId", "delta", "balance", "reason", "note")
SELECT "locationId", "productId", "variantId", "quantity", "quantity", 'INIT', 'موجودی پیش از راه‌اندازی انبارها'
FROM "LocationStock";
