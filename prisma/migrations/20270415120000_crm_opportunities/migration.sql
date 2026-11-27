CREATE TABLE "CrmOpportunity" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "assigneeId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdById" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "formSubmissionId" INTEGER REFERENCES "FormSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "ticketId" INTEGER REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "title" TEXT NOT NULL,
  "stage" TEXT NOT NULL DEFAULT 'NEW',
  "amountMinor" BIGINT NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'IRT',
  "targetDay" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmOpportunity_one_source" CHECK ("formSubmissionId" IS NULL OR "ticketId" IS NULL),
  CONSTRAINT "CrmOpportunity_stage_check" CHECK (
    ("stage" IN ('NEW', 'QUALIFIED', 'PROPOSAL') AND "closedAt" IS NULL)
    OR ("stage" IN ('WON', 'LOST') AND "closedAt" IS NOT NULL)
  ),
  CONSTRAINT "CrmOpportunity_amount_check" CHECK ("amountMinor" >= 0 AND "currency" IN ('IRT', 'IRR', 'USD', 'EUR'))
);

CREATE TABLE "CrmOpportunityTransition" (
  "id" SERIAL PRIMARY KEY,
  "opportunityId" INTEGER NOT NULL REFERENCES "CrmOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "actorId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "fromStage" TEXT,
  "toStage" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CrmOpportunityTransition_stage_check" CHECK (
    ("fromStage" IS NULL AND "toStage" = 'NEW')
    OR ("fromStage" IN ('NEW', 'QUALIFIED', 'PROPOSAL') AND "toStage" IN ('NEW', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST') AND "fromStage" <> "toStage")
  ),
  CONSTRAINT "CrmOpportunityTransition_loss_reason" CHECK ("toStage" <> 'LOST' OR char_length(btrim("reason")) BETWEEN 5 AND 300)
);

ALTER TABLE "CrmFollowUp" ADD COLUMN "opportunityId" INTEGER
  REFERENCES "CrmOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CrmOpportunity_formSubmissionId_key" ON "CrmOpportunity"("formSubmissionId");
CREATE UNIQUE INDEX "CrmOpportunity_ticketId_key" ON "CrmOpportunity"("ticketId");
CREATE INDEX "CrmOpportunity_userId_updatedAt_id_idx" ON "CrmOpportunity"("userId", "updatedAt", "id");
CREATE INDEX "CrmOpportunity_assigneeId_stage_updatedAt_id_idx" ON "CrmOpportunity"("assigneeId", "stage", "updatedAt", "id");
CREATE INDEX "CrmOpportunity_stage_stageChangedAt_idx" ON "CrmOpportunity"("stage", "stageChangedAt");
CREATE INDEX "CrmOpportunityTransition_opportunityId_id_idx" ON "CrmOpportunityTransition"("opportunityId", "id");
CREATE INDEX "CrmOpportunityTransition_actorId_idx" ON "CrmOpportunityTransition"("actorId");
CREATE INDEX "CrmFollowUp_opportunityId_status_idx" ON "CrmFollowUp"("opportunityId", "status");
