-- Additive: preserve all existing activity and order state.
ALTER TABLE "ForumProfile" ADD COLUMN "manualLevelId" TEXT;
ALTER TABLE "Order" ADD COLUMN "assigneeId" INTEGER;
ALTER TABLE "Order" ADD CONSTRAINT "Order_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Order_assigneeId_status_idx" ON "Order"("assigneeId", "status");
