-- VIP membership, member-only access / pricing, music, film & series, games.

ALTER TABLE "Post" ADD COLUMN "access" TEXT NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "Product" ADD COLUMN "access" TEXT NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "Product" ADD COLUMN "memberPriceMinor" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN "vipGiftDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProductVariant" ADD COLUMN "memberPriceMinor" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Plan" ADD COLUMN "access" TEXT NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "Plan" ADD COLUMN "memberPriceMinor" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Plan" ADD COLUMN "vipGiftDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Promotion" ADD COLUMN "membersOnly" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "MembershipPlan" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameEn" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "descriptionEn" TEXT NOT NULL DEFAULT '',
  "days" INTEGER NOT NULL,
  "priceMinor" BIGINT NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "perks" TEXT NOT NULL DEFAULT '[]',
  "highlight" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MembershipPlan_slug_key" ON "MembershipPlan"("slug");

CREATE TABLE "UserMembership" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "planId" INTEGER,
  "source" TEXT NOT NULL DEFAULT 'PURCHASE',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "orderId" INTEGER,
  "dedupeKey" TEXT,
  "note" TEXT NOT NULL DEFAULT '',
  "revokedAt" TIMESTAMP(3),
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserMembership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserMembership_dedupeKey_key" ON "UserMembership"("dedupeKey");
CREATE INDEX "UserMembership_userId_endsAt_idx" ON "UserMembership"("userId", "endsAt");
CREATE INDEX "UserMembership_orderId_idx" ON "UserMembership"("orderId");

CREATE TABLE "MusicArtist" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameEn" TEXT NOT NULL DEFAULT '',
  "bio" TEXT NOT NULL DEFAULT '',
  "image" TEXT NOT NULL DEFAULT '',
  "cover" TEXT NOT NULL DEFAULT '',
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MusicArtist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MusicArtist_slug_key" ON "MusicArtist"("slug");

CREATE TABLE "MusicAlbum" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "titleEn" TEXT NOT NULL DEFAULT '',
  "artistId" INTEGER NOT NULL,
  "cover" TEXT NOT NULL DEFAULT '',
  "year" INTEGER,
  "genre" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "access" TEXT NOT NULL DEFAULT 'PUBLIC',
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "views" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MusicAlbum_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MusicAlbum_slug_key" ON "MusicAlbum"("slug");
CREATE INDEX "MusicAlbum_artistId_idx" ON "MusicAlbum"("artistId");
CREATE INDEX "MusicAlbum_status_publishedAt_idx" ON "MusicAlbum"("status", "publishedAt");
ALTER TABLE "MusicAlbum" ADD CONSTRAINT "MusicAlbum_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "MusicArtist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MusicTrack" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "titleEn" TEXT NOT NULL DEFAULT '',
  "artistId" INTEGER NOT NULL,
  "albumId" INTEGER,
  "trackNo" INTEGER NOT NULL DEFAULT 0,
  "cover" TEXT NOT NULL DEFAULT '',
  "audioUrl" TEXT NOT NULL DEFAULT '',
  "audioHqUrl" TEXT NOT NULL DEFAULT '',
  "duration" INTEGER NOT NULL DEFAULT 0,
  "genre" TEXT NOT NULL DEFAULT '',
  "lyrics" TEXT NOT NULL DEFAULT '',
  "access" TEXT NOT NULL DEFAULT 'PUBLIC',
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "plays" INTEGER NOT NULL DEFAULT 0,
  "downloads" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MusicTrack_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MusicTrack_slug_key" ON "MusicTrack"("slug");
CREATE INDEX "MusicTrack_artistId_idx" ON "MusicTrack"("artistId");
CREATE INDEX "MusicTrack_albumId_trackNo_idx" ON "MusicTrack"("albumId", "trackNo");
CREATE INDEX "MusicTrack_status_publishedAt_idx" ON "MusicTrack"("status", "publishedAt");
ALTER TABLE "MusicTrack" ADD CONSTRAINT "MusicTrack_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "MusicArtist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusicTrack" ADD CONSTRAINT "MusicTrack_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "MusicAlbum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MusicPlaylist" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "titleEn" TEXT NOT NULL DEFAULT '',
  "cover" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "trackIds" TEXT NOT NULL DEFAULT '[]',
  "access" TEXT NOT NULL DEFAULT 'PUBLIC',
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MusicPlaylist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MusicPlaylist_slug_key" ON "MusicPlaylist"("slug");

CREATE TABLE "CinemaTitle" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'MOVIE',
  "title" TEXT NOT NULL,
  "titleEn" TEXT NOT NULL DEFAULT '',
  "originalTitle" TEXT NOT NULL DEFAULT '',
  "poster" TEXT NOT NULL DEFAULT '',
  "backdrop" TEXT NOT NULL DEFAULT '',
  "year" INTEGER,
  "endYear" INTEGER,
  "imdbRating" DOUBLE PRECISION,
  "imdbId" TEXT NOT NULL DEFAULT '',
  "runtime" INTEGER NOT NULL DEFAULT 0,
  "ageRating" TEXT NOT NULL DEFAULT '',
  "countries" TEXT NOT NULL DEFAULT '',
  "languages" TEXT NOT NULL DEFAULT '',
  "genres" TEXT NOT NULL DEFAULT '',
  "director" TEXT NOT NULL DEFAULT '',
  "cast" TEXT NOT NULL DEFAULT '[]',
  "summary" TEXT NOT NULL DEFAULT '',
  "summaryEn" TEXT NOT NULL DEFAULT '',
  "trailerUrl" TEXT NOT NULL DEFAULT '',
  "quality" TEXT NOT NULL DEFAULT '',
  "dubbed" BOOLEAN NOT NULL DEFAULT false,
  "subtitle" BOOLEAN NOT NULL DEFAULT false,
  "seriesStatus" TEXT NOT NULL DEFAULT '',
  "access" TEXT NOT NULL DEFAULT 'PUBLIC',
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "views" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CinemaTitle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CinemaTitle_slug_key" ON "CinemaTitle"("slug");
CREATE INDEX "CinemaTitle_kind_status_publishedAt_idx" ON "CinemaTitle"("kind", "status", "publishedAt");

CREATE TABLE "CinemaSeason" (
  "id" SERIAL NOT NULL,
  "titleId" INTEGER NOT NULL,
  "number" INTEGER NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "poster" TEXT NOT NULL DEFAULT '',
  CONSTRAINT "CinemaSeason_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CinemaSeason_titleId_number_key" ON "CinemaSeason"("titleId", "number");
ALTER TABLE "CinemaSeason" ADD CONSTRAINT "CinemaSeason_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "CinemaTitle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CinemaEpisode" (
  "id" SERIAL NOT NULL,
  "seasonId" INTEGER NOT NULL,
  "number" INTEGER NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "titleEn" TEXT NOT NULL DEFAULT '',
  "summary" TEXT NOT NULL DEFAULT '',
  "still" TEXT NOT NULL DEFAULT '',
  "runtime" INTEGER NOT NULL DEFAULT 0,
  "airDate" TIMESTAMP(3),
  "access" TEXT NOT NULL DEFAULT 'PUBLIC',
  CONSTRAINT "CinemaEpisode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CinemaEpisode_seasonId_number_key" ON "CinemaEpisode"("seasonId", "number");
ALTER TABLE "CinemaEpisode" ADD CONSTRAINT "CinemaEpisode_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "CinemaSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GameTitle" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "titleEn" TEXT NOT NULL DEFAULT '',
  "cover" TEXT NOT NULL DEFAULT '',
  "backdrop" TEXT NOT NULL DEFAULT '',
  "platforms" TEXT NOT NULL DEFAULT '',
  "genres" TEXT NOT NULL DEFAULT '',
  "developer" TEXT NOT NULL DEFAULT '',
  "publisher" TEXT NOT NULL DEFAULT '',
  "releaseDate" TIMESTAMP(3),
  "score" INTEGER,
  "userScore" DOUBLE PRECISION,
  "ageRating" TEXT NOT NULL DEFAULT '',
  "trailerUrl" TEXT NOT NULL DEFAULT '',
  "screenshots" TEXT NOT NULL DEFAULT '[]',
  "summary" TEXT NOT NULL DEFAULT '',
  "content" TEXT NOT NULL DEFAULT '',
  "pros" TEXT NOT NULL DEFAULT '[]',
  "cons" TEXT NOT NULL DEFAULT '[]',
  "requirements" TEXT NOT NULL DEFAULT '{}',
  "access" TEXT NOT NULL DEFAULT 'PUBLIC',
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "views" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameTitle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GameTitle_slug_key" ON "GameTitle"("slug");
CREATE INDEX "GameTitle_status_publishedAt_idx" ON "GameTitle"("status", "publishedAt");

CREATE TABLE "MediaLink" (
  "id" SERIAL NOT NULL,
  "ownerType" TEXT NOT NULL,
  "ownerId" INTEGER NOT NULL,
  "label" TEXT NOT NULL DEFAULT '',
  "kind" TEXT NOT NULL DEFAULT 'DOWNLOAD',
  "quality" TEXT NOT NULL DEFAULT '',
  "size" TEXT NOT NULL DEFAULT '',
  "audio" TEXT NOT NULL DEFAULT '',
  "subtitle" BOOLEAN NOT NULL DEFAULT false,
  "url" TEXT NOT NULL,
  "access" TEXT NOT NULL DEFAULT 'PUBLIC',
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaLink_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MediaLink_ownerType_ownerId_idx" ON "MediaLink"("ownerType", "ownerId");
