-- A clock timestamp is not a unique grant; fence old workers with a monotonic generation.
ALTER TABLE "ImportJob" ADD COLUMN "executionGeneration" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_execution_generation"
  CHECK ("executionGeneration" >= 0);
