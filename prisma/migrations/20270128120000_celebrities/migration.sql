-- «چهره‌ها»: one page per person across cinema and music. Additive; the entries are built from CinemaPerson and
-- MusicArtist by the application (same exact name joins once, unless the owner keeps them apart).
CREATE TABLE "Celebrity" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL DEFAULT '',
    "cinemaPersonId" INTEGER,
    "musicArtistId" INTEGER,
    "keepApart" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Celebrity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Celebrity_slug_key" ON "Celebrity"("slug");
CREATE UNIQUE INDEX "Celebrity_cinemaPersonId_key" ON "Celebrity"("cinemaPersonId");
CREATE UNIQUE INDEX "Celebrity_musicArtistId_key" ON "Celebrity"("musicArtistId");
CREATE INDEX "Celebrity_normalizedName_idx" ON "Celebrity"("normalizedName");

ALTER TABLE "Celebrity" ADD CONSTRAINT "Celebrity_cinemaPersonId_fkey" FOREIGN KEY ("cinemaPersonId") REFERENCES "CinemaPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Celebrity" ADD CONSTRAINT "Celebrity_musicArtistId_fkey" FOREIGN KEY ("musicArtistId") REFERENCES "MusicArtist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
