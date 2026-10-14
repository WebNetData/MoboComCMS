-- Automation rules, the events they start from and the record of each run. New tables only.
CREATE TABLE "AutomationRule" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trigger" TEXT NOT NULL,
    "wait" INTEGER NOT NULL DEFAULT 0,
    "conditions" TEXT NOT NULL DEFAULT '[]',
    "logic" TEXT NOT NULL DEFAULT 'all',
    "actions" TEXT NOT NULL DEFAULT '[]',
    "cooldownHours" INTEGER NOT NULL DEFAULT 0,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AutomationRule_logic_check" CHECK ("logic" IN ('all', 'any')),
    CONSTRAINT "AutomationRule_numbers_check" CHECK ("wait" >= 0 AND "cooldownHours" >= 0 AND "runCount" >= 0)
);
CREATE INDEX "AutomationRule_enabled_trigger_idx" ON "AutomationRule"("enabled", "trigger");

CREATE TABLE "AutomationEvent" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "userId" INTEGER,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "AutomationEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AutomationEvent_processedAt_id_idx" ON "AutomationEvent"("processedAt", "id");

CREATE TABLE "AutomationRun" (
    "id" SERIAL NOT NULL,
    "ruleId" INTEGER NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AutomationRun_status_check" CHECK ("status" IN ('DONE', 'PARTIAL', 'FAILED'))
);
CREATE INDEX "AutomationRun_ruleId_subjectKey_createdAt_idx" ON "AutomationRun"("ruleId", "subjectKey", "createdAt");
CREATE INDEX "AutomationRun_createdAt_idx" ON "AutomationRun"("createdAt");
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
