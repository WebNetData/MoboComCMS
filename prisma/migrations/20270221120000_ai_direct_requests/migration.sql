ALTER TABLE "AiAssistantProposal" ADD COLUMN "requestKey" TEXT;
ALTER TABLE "AiAssistantProposal" ADD COLUMN "executionMode" TEXT NOT NULL DEFAULT 'REVIEW';
ALTER TABLE "AiAssistantProposal" ADD CONSTRAINT "AiAssistantProposal_executionMode_check" CHECK ("executionMode" IN ('REVIEW', 'DIRECT'));
CREATE UNIQUE INDEX "AiAssistantProposal_requestKey_key" ON "AiAssistantProposal"("requestKey");
