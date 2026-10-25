-- Kinds of title the owner manages (film, series, anime, documentary…). Each is one work (MOVIE) or has seasons and
-- episodes (SERIES). Existing titles get the film or series format from their kind (additive; nothing is removed).
CREATE TABLE "CinemaFormat" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL DEFAULT '',
    "plural" TEXT NOT NULL DEFAULT '',
    "structure" TEXT NOT NULL DEFAULT 'MOVIE',
    "icon" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CinemaFormat_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CinemaFormat_structure_check" CHECK ("structure" IN ('MOVIE', 'SERIES'))
);
CREATE UNIQUE INDEX "CinemaFormat_slug_key" ON "CinemaFormat"("slug");

INSERT INTO "CinemaFormat" ("slug", "name", "nameEn", "plural", "structure", "icon", "sortOrder") VALUES
    ('movie', 'فیلم سینمایی', 'Movie', 'فیلم‌ها', 'MOVIE', '🎬', 0),
    ('series', 'سریال', 'Series', 'سریال‌ها', 'SERIES', '📺', 1);

ALTER TABLE "CinemaTitle" ADD COLUMN "formatId" INTEGER;
UPDATE "CinemaTitle" AS t SET "formatId" = f."id"
    FROM "CinemaFormat" AS f
    WHERE f."slug" = CASE WHEN t."kind" = 'SERIES' THEN 'series' ELSE 'movie' END;
ALTER TABLE "CinemaTitle" ADD CONSTRAINT "CinemaTitle_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "CinemaFormat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CinemaTitle_formatId_status_publishedAt_idx" ON "CinemaTitle"("formatId", "status", "publishedAt");
