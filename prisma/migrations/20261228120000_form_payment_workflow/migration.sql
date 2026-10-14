-- Forms that are paid for, and the work staff do on an answer.
-- Additive only: every stored answer keeps its meaning with the defaults (nothing to pay, no stage).
ALTER TABLE "FormSubmission" ADD COLUMN "amountMinor" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "FormSubmission" ADD COLUMN "currency" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FormSubmission" ADD COLUMN "pricing" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FormSubmission" ADD COLUMN "payStatus" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FormSubmission" ADD COLUMN "orderId" INTEGER;
ALTER TABLE "FormSubmission" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "FormSubmission" ADD COLUMN "stage" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FormSubmission" ADD COLUMN "assigneeId" INTEGER;
ALTER TABLE "FormSubmission" ADD COLUMN "reply" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FormSubmission" ADD COLUMN "secrets" TEXT NOT NULL DEFAULT '';
ALTER TABLE "FormSubmission" ADD COLUMN "secretsErasedAt" TIMESTAMP(3);
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_amount_check" CHECK ("amountMinor" >= 0);
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_pay_status_check" CHECK ("payStatus" IN ('', 'UNPAID', 'PAID') AND ("payStatus" = '' OR "amountMinor" > 0));
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_stage_check" CHECK ("stage" IN ('', 'OPEN', 'IN_PROGRESS', 'DONE', 'REJECTED'));
CREATE INDEX "FormSubmission_orderId_idx" ON "FormSubmission"("orderId");
CREATE INDEX "FormSubmission_formId_stage_idx" ON "FormSubmission"("formId", "stage");
