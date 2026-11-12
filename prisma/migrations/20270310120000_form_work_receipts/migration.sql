-- Work at the counter (owner 2026-11-12, mobile repair): an answer entered by staff for a customer in the shop, the
-- pickup code asked before the device is handed back, and the link to the customer's copy of the receipt. Additive.
ALTER TABLE "FormSubmission" ADD COLUMN "source" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FormSubmission" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "FormSubmission" ADD COLUMN "pickupCode" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FormSubmission" ADD COLUMN "receiptToken" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FormSubmission" ADD COLUMN "receivedAt" TIMESTAMP(3);
-- A form may name its own work steps (settings.workflow): a stage is empty or a step key like RECEIVED.
ALTER TABLE "FormSubmission" DROP CONSTRAINT IF EXISTS "FormSubmission_stage_check";
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_stage_check" CHECK ("stage" = '' OR "stage" ~ '^[A-Z][A-Z0-9_]{1,23}$');
CREATE INDEX "FormSubmission_receiptToken_idx" ON "FormSubmission"("receiptToken");
