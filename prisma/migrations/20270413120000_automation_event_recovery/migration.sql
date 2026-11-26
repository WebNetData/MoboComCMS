ALTER TABLE "AutomationEvent"
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "effectStartedAt" TIMESTAMP(3),
  ADD COLUMN "needsReviewAt" TIMESTAMP(3),
  ADD COLUMN "processingError" TEXT NOT NULL DEFAULT '';

CREATE INDEX "AutomationEvent_recovery_idx"
  ON "AutomationEvent"("needsReviewAt", "leaseExpiresAt", "id");
