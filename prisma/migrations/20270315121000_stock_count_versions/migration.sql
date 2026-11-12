-- Ledger ids, rather than wall-clock timestamps, fence stock changes during a barcode count.
-- Existing open lines are safely stale until recounted when a movement exists for their item.
ALTER TABLE "StockCount" ADD COLUMN "movementCursor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StockCountLine" ADD COLUMN "movementCursor" INTEGER NOT NULL DEFAULT 0;
