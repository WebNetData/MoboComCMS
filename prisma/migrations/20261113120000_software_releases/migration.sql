CREATE TABLE "SoftwareRelease" (
    "id" SERIAL NOT NULL,
    "softwareId" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'STABLE',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "changelog" TEXT NOT NULL DEFAULT '',
    "size" TEXT NOT NULL DEFAULT '',
    "checksum" TEXT NOT NULL DEFAULT '',
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftwareRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SoftwareReleaseNotification" (
    "releaseId" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "lastUserId" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SoftwareReleaseNotification_pkey" PRIMARY KEY ("releaseId")
);

CREATE UNIQUE INDEX "SoftwareRelease_softwareId_version_channel_key" ON "SoftwareRelease"("softwareId", "version", "channel");
CREATE INDEX "SoftwareRelease_softwareId_status_releasedAt_idx" ON "SoftwareRelease"("softwareId", "status", "releasedAt");
CREATE INDEX "SoftwareReleaseNotification_completedAt_dueAt_idx" ON "SoftwareReleaseNotification"("completedAt", "dueAt");
ALTER TABLE "SoftwareRelease" ADD CONSTRAINT "SoftwareRelease_softwareId_fkey" FOREIGN KEY ("softwareId") REFERENCES "SoftwareTitle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SoftwareReleaseNotification" ADD CONSTRAINT "SoftwareReleaseNotification_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SoftwareRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve current catalogue versions as history. Historical releases do not
-- create follower notices, including old records without a release date.
INSERT INTO "SoftwareRelease" ("softwareId", "version", "channel", "status", "changelog", "size", "releasedAt", "createdAt", "updatedAt")
SELECT "id", "version", 'STABLE', 'PUBLISHED', "changelog", "size", COALESCE("releasedAt", "publishedAt"), "createdAt", "updatedAt"
FROM "SoftwareTitle" WHERE TRIM("version") <> '';

-- Only already scheduled future versions enter the notification queue.
INSERT INTO "SoftwareReleaseNotification" ("releaseId", "dueAt")
SELECT "id", "releasedAt" FROM "SoftwareRelease" WHERE "releasedAt" > CURRENT_TIMESTAMP;
