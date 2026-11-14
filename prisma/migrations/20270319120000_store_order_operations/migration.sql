-- Additive order operations. Existing money rows and historical stock remain unchanged.
ALTER TABLE "StockLocation" ADD COLUMN "isQuarantine" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_quarantine_not_online" CHECK (NOT "isQuarantine" OR NOT "sellsOnline");
ALTER TABLE "ReturnRequest" ADD COLUMN "replacementOrderId" INTEGER;
ALTER TABLE "ReturnRequest" ADD COLUMN "inspectionStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "ReturnRequest" ADD COLUMN "inspectionLines" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_replacementOrderId_fkey" FOREIGN KEY ("replacementOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ReturnRequest_replacementOrderId_key" ON "ReturnRequest"("replacementOrderId");
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_inspection_status" CHECK ("inspectionStatus" IN ('NOT_REQUIRED', 'PENDING', 'DISPOSED'));
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_inspection_lines" CHECK (jsonb_typeof("inspectionLines"::jsonb) = 'array');

CREATE TABLE "OrderDeliveryChange" (
  "id" SERIAL PRIMARY KEY,
  "orderId" INTEGER NOT NULL REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "openOrderKey" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "oldAddress" TEXT NOT NULL,
  "newAddress" TEXT NOT NULL,
  "originalDeliveryUpdatedAt" TIMESTAMP(3) NOT NULL,
  "fromFeeMinor" BIGINT NOT NULL,
  "newFeeMinor" BIGINT NOT NULL,
  "currency" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "reviewNote" TEXT NOT NULL DEFAULT '',
  "requestedById" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "decidedById" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderDeliveryChange_status" CHECK ("status" IN ('REQUESTED','APPROVED','REJECTED','WITHDRAWN')),
  CONSTRAINT "OrderDeliveryChange_open_claim" CHECK (("status" = 'REQUESTED' AND "openOrderKey" = "orderId" AND "openOrderKey" IS NOT NULL) OR ("status" <> 'REQUESTED' AND "openOrderKey" IS NULL)),
  CONSTRAINT "OrderDeliveryChange_fees" CHECK ("fromFeeMinor" >= 0 AND "newFeeMinor" >= 0),
  CONSTRAINT "OrderDeliveryChange_addresses" CHECK (jsonb_typeof("oldAddress"::jsonb) = 'object' AND jsonb_typeof("newAddress"::jsonb) = 'object')
);
CREATE UNIQUE INDEX "OrderDeliveryChange_openOrderKey_key" ON "OrderDeliveryChange"("openOrderKey");
CREATE INDEX "OrderDeliveryChange_orderId_requestedAt_idx" ON "OrderDeliveryChange"("orderId","requestedAt");

CREATE TABLE "OrderPackingCheck" (
  "orderId" INTEGER PRIMARY KEY REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "snapshot" TEXT NOT NULL,
  "checks" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "completedById" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderPackingCheck_snapshot" CHECK ("snapshot" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "OrderPackingCheck_checks" CHECK (jsonb_typeof("checks"::jsonb) = 'array')
);
