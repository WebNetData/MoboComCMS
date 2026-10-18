-- Additive: preserve every existing decision as round one before reopening is enabled.
ALTER TABLE "ModerationCase" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ModerationCase" ADD CONSTRAINT "ModerationCase_round_check" CHECK ("round" > 0);
CREATE TABLE "ModerationDecision" (
  "id" SERIAL PRIMARY KEY,
  "caseId" INTEGER NOT NULL,
  "round" INTEGER NOT NULL,
  "decision" TEXT NOT NULL,
  "decidedById" INTEGER,
  "decidedAt" TIMESTAMP(3) NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "ModerationDecision_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ModerationDecision_round_check" CHECK ("round" > 0),
  CONSTRAINT "ModerationDecision_decision_check" CHECK ("decision" IN ('approve', 'reject'))
);
CREATE UNIQUE INDEX "ModerationDecision_caseId_round_key" ON "ModerationDecision"("caseId", "round");
CREATE INDEX "ModerationDecision_decidedAt_id_idx" ON "ModerationDecision"("decidedAt", "id");
INSERT INTO "ModerationDecision" ("caseId", "round", "decision", "decidedById", "decidedAt", "note")
SELECT "id", 1, "decision", "decidedById", "decidedAt", "note"
FROM "ModerationCase" WHERE "status" = 'DECIDED' AND "decision" IN ('approve', 'reject') AND "decidedAt" IS NOT NULL;
