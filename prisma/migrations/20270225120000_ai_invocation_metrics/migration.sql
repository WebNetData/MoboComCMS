CREATE TABLE "AiInvocation" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "transport" TEXT NOT NULL DEFAULT 'api',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "outcome" TEXT NOT NULL DEFAULT '',
    "errorKind" TEXT NOT NULL DEFAULT '',
    "errorStatus" INTEGER,
    CONSTRAINT "AiInvocation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiInvocation_status_check" CHECK ("status" IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
    CONSTRAINT "AiInvocation_kind_check" CHECK ("kind" IN ('text', 'image')),
    CONSTRAINT "AiInvocation_transport_check" CHECK ("transport" IN ('api', 'personal')),
    CONSTRAINT "AiInvocation_counts_check" CHECK ("attempts" >= 0 AND ("durationMs" IS NULL OR "durationMs" >= 0) AND ("inputTokens" IS NULL OR "inputTokens" >= 0) AND ("outputTokens" IS NULL OR "outputTokens" >= 0) AND ("totalTokens" IS NULL OR "totalTokens" >= 0))
);
CREATE INDEX "AiInvocation_startedAt_idx" ON "AiInvocation"("startedAt");
CREATE INDEX "AiInvocation_purpose_startedAt_idx" ON "AiInvocation"("purpose", "startedAt");
CREATE INDEX "AiInvocation_status_startedAt_idx" ON "AiInvocation"("status", "startedAt");
