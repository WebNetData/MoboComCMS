-- Additive: a new table for the staff work around waiting items. Nothing existing is changed.
CREATE TABLE "ModerationCase" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assigneeId" INTEGER,
    "claimedAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "decision" TEXT NOT NULL DEFAULT '',
    "decidedById" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ModerationCase_source_itemId_key" ON "ModerationCase"("source", "itemId");
CREATE INDEX "ModerationCase_status_claimedAt_idx" ON "ModerationCase"("status", "claimedAt");
CREATE INDEX "ModerationCase_status_decidedAt_idx" ON "ModerationCase"("status", "decidedAt");
