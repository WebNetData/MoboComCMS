-- Additive: a delivered code can be taken back (refunded or replaced). Existing codes keep NULL and are unchanged.
ALTER TABLE "ProductDigitalCode" ADD COLUMN "returnedAt" TIMESTAMP(3);
ALTER TABLE "ProductDigitalCode" ADD COLUMN "returnId" INTEGER;
ALTER TABLE "ProductDigitalCode" ADD COLUMN "returnNote" TEXT NOT NULL DEFAULT '';
