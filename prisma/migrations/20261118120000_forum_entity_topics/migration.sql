ALTER TABLE "ForumThread" ADD COLUMN "itemType" TEXT;
ALTER TABLE "ForumThread" ADD COLUMN "itemId" INTEGER;
ALTER TABLE "ForumThread" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'DISCUSSION';

CREATE INDEX "ForumThread_itemType_itemId_kind_status_listed_lastPostAt_idx"
ON "ForumThread"("itemType", "itemId", "kind", "status", "listed", "lastPostAt");
