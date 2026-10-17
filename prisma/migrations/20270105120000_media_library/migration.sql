-- Metadata only. Existing blobs, content URLs, imports and identity rows are preserved.
CREATE TABLE "MediaFolder" (
 "id" SERIAL PRIMARY KEY, "name" TEXT NOT NULL, "key" TEXT NOT NULL UNIQUE,
 "parentId" INTEGER REFERENCES "MediaFolder"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
 "createdById" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "revision" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MediaFolder_name" CHECK (length(btrim("name")) BETWEEN 1 AND 120),
 CONSTRAINT "MediaFolder_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id")
);
CREATE INDEX "MediaFolder_parentId_idx" ON "MediaFolder"("parentId");
CREATE TABLE "MediaAsset" (
 "id" TEXT PRIMARY KEY, "storage" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL,
 "mime" TEXT NOT NULL DEFAULT 'application/octet-stream', "kind" TEXT NOT NULL DEFAULT 'file',
 "bytes" BIGINT NOT NULL DEFAULT 0, "width" INTEGER NOT NULL DEFAULT 0, "height" INTEGER NOT NULL DEFAULT 0,
 "alt" TEXT NOT NULL DEFAULT '', "caption" TEXT NOT NULL DEFAULT '', "tags" TEXT NOT NULL DEFAULT '[]',
 "folderId" INTEGER REFERENCES "MediaFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "createdById" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "archivedAt" TIMESTAMP(3), "revision" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MediaAsset_storage_key_key" UNIQUE("storage", "key"),
 CONSTRAINT "MediaAsset_storage" CHECK ("storage" IN ('covers','downloads')),
 CONSTRAINT "MediaAsset_kind" CHECK ("kind" IN ('image','audio','video','document','archive','file')),
 CONSTRAINT "MediaAsset_size" CHECK ("bytes" >= 0 AND "width" >= 0 AND "height" >= 0)
);
CREATE INDEX "MediaAsset_folderId_archivedAt_createdAt_idx" ON "MediaAsset"("folderId","archivedAt","createdAt");
CREATE INDEX "MediaAsset_kind_archivedAt_idx" ON "MediaAsset"("kind","archivedAt");
CREATE TABLE "MediaTransfer" (
 "id" TEXT PRIMARY KEY, "sourceHash" TEXT NOT NULL UNIQUE, "sourceUrl" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "section" TEXT NOT NULL DEFAULT 'posts', "name" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'QUEUED',
 "actorId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE, "authAt" TIMESTAMP(3),
 "folderId" INTEGER REFERENCES "MediaFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "assetId" TEXT REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "jobId" INTEGER UNIQUE REFERENCES "BackgroundJob"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "generation" INTEGER NOT NULL DEFAULT 0,
 "leaseToken" TEXT NOT NULL DEFAULT '', "lockedUntil" TIMESTAMP(3), "receivedBytes" BIGINT NOT NULL DEFAULT 0,
 "totalBytes" BIGINT, "attempts" INTEGER NOT NULL DEFAULT 0, "lastError" TEXT NOT NULL DEFAULT '',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "MediaTransfer_kind" CHECK ("kind" IN ('image','file')),
 CONSTRAINT "MediaTransfer_status" CHECK ("status" IN ('QUEUED','RUNNING','READY','FAILED','PAUSED','CANCELLED')),
 CONSTRAINT "MediaTransfer_size" CHECK ("receivedBytes" >= 0 AND ("totalBytes" IS NULL OR "totalBytes" >= 0))
);
CREATE INDEX "MediaTransfer_status_runAt_idx" ON "MediaTransfer"("status","runAt");
CREATE INDEX "MediaTransfer_actorId_createdAt_idx" ON "MediaTransfer"("actorId","createdAt");
