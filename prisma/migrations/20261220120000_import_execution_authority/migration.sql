-- Additive: preserve uploaded provenance, records, state, cursor and old readers.
ALTER TABLE "ImportJob" ADD COLUMN "executionActorId" INTEGER;
ALTER TABLE "ImportJob" ADD COLUMN "executionAuthorizedAt" TIMESTAMP(3);
ALTER TABLE "ImportJob" ADD COLUMN "executionMode" TEXT NOT NULL DEFAULT 'RUN';
UPDATE "ImportJob" SET "executionMode" = 'ROLLBACK' WHERE "status" = 'ROLLING_BACK';
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_execution_actor_pair"
  CHECK (("executionActorId" IS NULL AND "executionAuthorizedAt" IS NULL)
    OR ("executionActorId" IS NOT NULL AND "executionActorId" > 0 AND "executionAuthorizedAt" IS NOT NULL));
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_execution_mode"
  CHECK ("executionMode" IN ('RUN', 'ROLLBACK'));
