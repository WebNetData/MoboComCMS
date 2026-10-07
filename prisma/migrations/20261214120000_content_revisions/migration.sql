-- Additive: versions of edited items. An item that existed before gets its first version (what it was)
-- the first time it is edited after this migration.
CREATE TABLE "ContentRevision" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" TEXT NOT NULL,
    "changed" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'edit',
    "actorId" INTEGER,
    "actorEmail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContentRevision_entityType_entityId_version_key" ON "ContentRevision"("entityType", "entityId", "version");
CREATE INDEX "ContentRevision_entityType_entityId_createdAt_idx" ON "ContentRevision"("entityType", "entityId", "createdAt");
