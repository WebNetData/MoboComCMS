-- Existing automation events also hold minimal processed idempotency receipts.
-- Null preserves repeated legacy events and their existing retention policy.
ALTER TABLE "AutomationEvent" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "AutomationEvent_dedupeKey_key" ON "AutomationEvent"("dedupeKey");
CREATE INDEX "AutomationEvent_userId_name_createdAt_idx" ON "AutomationEvent"("userId", "name", "createdAt");
