CREATE TABLE "Studio" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "logo" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Studio_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Studio_normalizedName_key" ON "Studio"("normalizedName");

ALTER TABLE "GameTitle" ADD COLUMN "developerStudioId" INTEGER;
ALTER TABLE "GameTitle" ADD COLUMN "publisherStudioId" INTEGER;
ALTER TABLE "SoftwareTitle" ADD COLUMN "publisher" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SoftwareTitle" ADD COLUMN "developerStudioId" INTEGER;
ALTER TABLE "SoftwareTitle" ADD COLUMN "publisherStudioId" INTEGER;

CREATE INDEX "GameTitle_developerStudioId_idx" ON "GameTitle"("developerStudioId");
CREATE INDEX "GameTitle_publisherStudioId_idx" ON "GameTitle"("publisherStudioId");
CREATE INDEX "SoftwareTitle_developerStudioId_idx" ON "SoftwareTitle"("developerStudioId");
CREATE INDEX "SoftwareTitle_publisherStudioId_idx" ON "SoftwareTitle"("publisherStudioId");
ALTER TABLE "GameTitle" ADD CONSTRAINT "GameTitle_developerStudioId_fkey" FOREIGN KEY ("developerStudioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GameTitle" ADD CONSTRAINT "GameTitle_publisherStudioId_fkey" FOREIGN KEY ("publisherStudioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SoftwareTitle" ADD CONSTRAINT "SoftwareTitle_developerStudioId_fkey" FOREIGN KEY ("developerStudioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SoftwareTitle" ADD CONSTRAINT "SoftwareTitle_publisherStudioId_fkey" FOREIGN KEY ("publisherStudioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Merge identical names across both catalogues and both roles without changing
-- the legacy display strings or any existing URLs.
INSERT INTO "Studio" ("name", "normalizedName")
SELECT MIN(TRIM("name")), LOWER(TRIM("name"))
FROM (
  SELECT "developer" AS "name" FROM "GameTitle"
  UNION ALL SELECT "publisher" FROM "GameTitle"
  UNION ALL SELECT "developer" FROM "SoftwareTitle"
  UNION ALL SELECT "publisher" FROM "SoftwareTitle"
) AS names
WHERE TRIM("name") <> ''
GROUP BY LOWER(TRIM("name"))
ON CONFLICT ("normalizedName") DO NOTHING;

UPDATE "GameTitle" AS g SET "developerStudioId" = s."id" FROM "Studio" AS s WHERE s."normalizedName" = LOWER(TRIM(g."developer"));
UPDATE "GameTitle" AS g SET "publisherStudioId" = s."id" FROM "Studio" AS s WHERE s."normalizedName" = LOWER(TRIM(g."publisher"));
UPDATE "SoftwareTitle" AS a SET "developerStudioId" = s."id" FROM "Studio" AS s WHERE s."normalizedName" = LOWER(TRIM(a."developer"));
UPDATE "SoftwareTitle" AS a SET "publisherStudioId" = s."id" FROM "Studio" AS s WHERE s."normalizedName" = LOWER(TRIM(a."publisher"));
