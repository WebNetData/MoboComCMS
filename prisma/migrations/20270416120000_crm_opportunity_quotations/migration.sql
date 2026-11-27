CREATE TABLE "CrmOpportunityQuotation" (
  "quotationId" INTEGER PRIMARY KEY REFERENCES "StoreQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "opportunityId" INTEGER NOT NULL REFERENCES "CrmOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sharedAt" TIMESTAMP(3),
  "sharedById" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CrmOpportunityQuotation_share_check" CHECK ("sharedAt" IS NOT NULL OR "sharedById" IS NULL)
);
CREATE INDEX "CrmOpportunityQuotation_opportunityId_quotationId_idx" ON "CrmOpportunityQuotation" ("opportunityId", "quotationId");
CREATE INDEX "CrmOpportunityQuotation_sharedById_idx" ON "CrmOpportunityQuotation" ("sharedById");
