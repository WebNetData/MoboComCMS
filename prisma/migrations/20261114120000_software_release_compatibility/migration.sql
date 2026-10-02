ALTER TABLE "SoftwareRelease" ADD COLUMN "requirements" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SoftwareRelease" ADD COLUMN "screenshots" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "MediaLink" ADD COLUMN "platform" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MediaLink" ADD COLUMN "architecture" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MediaLink" ADD COLUMN "checksum" TEXT NOT NULL DEFAULT '';

CREATE TABLE "SoftwareReleaseTarget" (
    "id" SERIAL NOT NULL,
    "releaseId" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "architecture" TEXT NOT NULL DEFAULT '',
    "minVersion" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "SoftwareReleaseTarget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SoftwareReleaseTarget_releaseId_platform_architecture_key" ON "SoftwareReleaseTarget"("releaseId", "platform", "architecture");
CREATE INDEX "SoftwareReleaseTarget_platform_architecture_idx" ON "SoftwareReleaseTarget"("platform", "architecture");
ALTER TABLE "SoftwareReleaseTarget" ADD CONSTRAINT "SoftwareReleaseTarget_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SoftwareRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing versions inherit title-level details until an editor changes them.
UPDATE "SoftwareRelease" AS r SET "requirements" = s."requirements", "screenshots" = s."screenshots"
FROM "SoftwareTitle" AS s WHERE s."id" = r."softwareId";
INSERT INTO "SoftwareReleaseTarget" ("releaseId", "platform")
SELECT DISTINCT r."id", TRIM(p."platform")
FROM "SoftwareRelease" AS r
JOIN "SoftwareTitle" AS s ON s."id" = r."softwareId"
CROSS JOIN LATERAL REGEXP_SPLIT_TO_TABLE(s."platforms", '[,،|]') AS p("platform")
WHERE TRIM(p."platform") <> ''
ON CONFLICT ("releaseId", "platform", "architecture") DO NOTHING;
