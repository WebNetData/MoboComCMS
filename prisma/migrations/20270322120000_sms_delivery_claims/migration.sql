-- Preserve historical SMS rows and add durable intent claims.
ALTER TABLE "SmsLog" ADD COLUMN "dedupeKey" TEXT;
ALTER TABLE "SmsLog" ADD COLUMN "contentHash" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX "SmsLog_dedupeKey_key" ON "SmsLog"("dedupeKey");
