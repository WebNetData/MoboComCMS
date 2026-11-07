-- Additive private engineering receipts; no changes to content or financial rows.
CREATE TABLE "AiEngineeringRun" (
 "id" TEXT NOT NULL, "createdById" INTEGER, "requestKey" TEXT NOT NULL, "authAt" DOUBLE PRECISION,
 "instruction" TEXT NOT NULL, "mode" TEXT NOT NULL DEFAULT 'DEVELOP', "status" TEXT NOT NULL DEFAULT 'QUEUED',
 "revision" INTEGER NOT NULL DEFAULT 0, "snapshot" TEXT NOT NULL, "report" TEXT NOT NULL DEFAULT '',
 "result" TEXT NOT NULL DEFAULT '{}', "steps" INTEGER NOT NULL DEFAULT 0, "inputChars" INTEGER NOT NULL DEFAULT 0,
 "outputBudget" INTEGER NOT NULL DEFAULT 0, "model" TEXT NOT NULL DEFAULT '', "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3),
 "expiresAt" TIMESTAMP(3) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AiEngineeringRun_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AiEngineeringRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AiEngineeringRun_requestKey_key" ON "AiEngineeringRun"("requestKey");
CREATE INDEX "AiEngineeringRun_createdById_createdAt_idx" ON "AiEngineeringRun"("createdById", "createdAt");
CREATE INDEX "AiEngineeringRun_status_leaseUntil_idx" ON "AiEngineeringRun"("status", "leaseUntil");
