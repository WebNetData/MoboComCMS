-- Additive: existing templates retain their URLs, data and unknown creator.
ALTER TABLE "PromptTemplate" ADD COLUMN "createdById" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 ADD COLUMN "reviewNote" TEXT NOT NULL DEFAULT '', ADD COLUMN "trashedStatus" TEXT NOT NULL DEFAULT '',
 ADD COLUMN "trashedAt" TIMESTAMP(3), ADD COLUMN "trashedById" INTEGER;
ALTER TABLE "PromptTemplate" DROP CONSTRAINT "PromptTemplate_status_check";
ALTER TABLE "PromptTemplate" ADD CONSTRAINT "PromptTemplate_status_check" CHECK (
 "status" IN ('DRAFT','PENDING','PUBLISHED','TRASHED') AND ("status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL));
ALTER TABLE "PromptTemplate" ADD CONSTRAINT "PromptTemplate_trash_state" CHECK (
 ("status" = 'TRASHED' AND "trashedStatus" IN ('DRAFT','PENDING','PUBLISHED') AND "trashedAt" IS NOT NULL AND "trashedById" IS NOT NULL)
 OR ("status" <> 'TRASHED' AND "trashedStatus" = '' AND "trashedAt" IS NULL AND "trashedById" IS NULL));
CREATE INDEX "PromptTemplate_createdById_status_idx" ON "PromptTemplate"("createdById","status");
