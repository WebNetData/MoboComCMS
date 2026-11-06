CREATE TABLE "AiAssistantProposal" (
  "id" SERIAL PRIMARY KEY,
  "createdById" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "batchId" TEXT NOT NULL, "instruction" TEXT NOT NULL, "tool" TEXT NOT NULL,
  "reason" TEXT NOT NULL, "arguments" TEXT NOT NULL, "preview" TEXT NOT NULL,
  "snapshot" TEXT NOT NULL DEFAULT '{}', "status" TEXT NOT NULL DEFAULT 'PROPOSED',
  "result" TEXT NOT NULL DEFAULT '{}', "model" TEXT NOT NULL DEFAULT '',
  "expiresAt" TIMESTAMP(3) NOT NULL, "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiAssistantProposal_status_check" CHECK ("status" IN ('PROPOSED','APPLIED','REJECTED'))
);
CREATE INDEX "AiAssistantProposal_createdById_createdAt_idx" ON "AiAssistantProposal"("createdById", "createdAt");
CREATE INDEX "AiAssistantProposal_status_expiresAt_idx" ON "AiAssistantProposal"("status", "expiresAt");
