-- Existing release identities, dates, publication and licensed data are kept.
ALTER TABLE "RepoRelease" ADD COLUMN "storageState" TEXT NOT NULL DEFAULT 'READY';
ALTER TABLE "RepoRelease" ADD COLUMN "uploadTokenHash" TEXT;
ALTER TABLE "RepoRelease" ADD CONSTRAINT "RepoRelease_storage_state_check" CHECK (
  ("storageState" = 'READY' AND "uploadTokenHash" IS NULL)
  OR ("storageState" = 'STAGING' AND "published" = FALSE AND "uploadTokenHash" IS NOT NULL AND "uploadTokenHash" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX "RepoRelease_fileId_idx" ON "RepoRelease"("fileId");
