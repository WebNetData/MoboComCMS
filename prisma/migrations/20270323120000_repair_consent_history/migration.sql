ALTER TABLE "FormSubmission" ADD COLUMN "repairVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "estimateRevision" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "repairDueAt" TIMESTAMP(3);
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_repair_revision_check" CHECK ("repairVersion" >= 0 AND "estimateRevision" >= 0);

CREATE TABLE "RepairEstimate" (
  "id" SERIAL PRIMARY KEY, "submissionId" INTEGER NOT NULL, "version" INTEGER NOT NULL,
  "amountMinor" BIGINT NOT NULL, "currency" TEXT NOT NULL DEFAULT 'IRT', "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "contactHash" TEXT NOT NULL, "receiptHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
  "decidedAt" TIMESTAMP(3), "supersededAt" TIMESTAMP(3),
  CONSTRAINT "RepairEstimate_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FormSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RepairEstimate_money_check" CHECK ("amountMinor" > 0 AND "amountMinor" <= 999999999999 AND "currency" = 'IRT'),
  CONSTRAINT "RepairEstimate_snapshot_check" CHECK ("version" > 0 AND length("description") BETWEEN 3 AND 1500 AND length("contactHash") = 64 AND length("receiptHash") = 64 AND "expiresAt" > "createdAt"),
  CONSTRAINT "RepairEstimate_decision_check" CHECK (("status" = 'PENDING' AND "decidedAt" IS NULL) OR ("status" IN ('APPROVED','REJECTED') AND "decidedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX "RepairEstimate_submissionId_version_key" ON "RepairEstimate"("submissionId", "version");
CREATE TABLE "RepairEvent" (
  "id" SERIAL PRIMARY KEY, "submissionId" INTEGER NOT NULL, "kind" TEXT NOT NULL, "label" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT '', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RepairEvent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RepairEvent_public_check" CHECK ("kind" IN ('STAGE','REPLY','DUE','ESTIMATE','APPROVED','REJECTED','CONTACT') AND length("label") BETWEEN 1 AND 120 AND length("detail") <= 2000)
);
CREATE INDEX "RepairEvent_submissionId_id_idx" ON "RepairEvent"("submissionId", "id");

CREATE FUNCTION "repair_estimate_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."submissionId", NEW."version", NEW."amountMinor", NEW."currency", NEW."description", NEW."contactHash", NEW."receiptHash", NEW."createdAt", NEW."expiresAt") IS DISTINCT FROM
     (OLD."submissionId", OLD."version", OLD."amountMinor", OLD."currency", OLD."description", OLD."contactHash", OLD."receiptHash", OLD."createdAt", OLD."expiresAt") THEN
    RAISE EXCEPTION 'repair estimate content is immutable' USING ERRCODE = '23514';
  END IF;
  IF (OLD."status" <> 'PENDING' AND (NEW."status", NEW."decidedAt") IS DISTINCT FROM (OLD."status", OLD."decidedAt")) OR
     (OLD."supersededAt" IS NOT NULL AND NEW."supersededAt" IS DISTINCT FROM OLD."supersededAt") THEN
    RAISE EXCEPTION 'repair consent decision is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "RepairEstimate_immutable" BEFORE UPDATE ON "RepairEstimate" FOR EACH ROW EXECUTE FUNCTION "repair_estimate_immutable"();
