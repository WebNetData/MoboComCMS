CREATE TABLE "StudioPublicationNotification" (
    "itemType" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "lastUserId" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "StudioPublicationNotification_pkey" PRIMARY KEY ("itemType", "itemId")
);

CREATE INDEX "StudioPublicationNotification_completedAt_dueAt_idx" ON "StudioPublicationNotification"("completedAt", "dueAt");
