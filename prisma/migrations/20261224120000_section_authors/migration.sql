-- Section authors: who created an item, and a delete request that waits for a manager.
-- Additive only: no existing row changes; existing media items have no recorded creator.
ALTER TABLE "MusicArtist" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "MusicAlbum" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "MusicTrack" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "CinemaTitle" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "SoftwareTitle" ADD COLUMN "createdById" INTEGER;
ALTER TABLE "Post" ADD COLUMN "trashedStatus" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Post" ADD COLUMN "trashedAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN "trashedById" INTEGER;
ALTER TABLE "MusicAlbum" ADD COLUMN "trashedStatus" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MusicAlbum" ADD COLUMN "trashedAt" TIMESTAMP(3);
ALTER TABLE "MusicAlbum" ADD COLUMN "trashedById" INTEGER;
ALTER TABLE "MusicTrack" ADD COLUMN "trashedStatus" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MusicTrack" ADD COLUMN "trashedAt" TIMESTAMP(3);
ALTER TABLE "MusicTrack" ADD COLUMN "trashedById" INTEGER;
ALTER TABLE "CinemaTitle" ADD COLUMN "trashedStatus" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CinemaTitle" ADD COLUMN "trashedAt" TIMESTAMP(3);
ALTER TABLE "CinemaTitle" ADD COLUMN "trashedById" INTEGER;
ALTER TABLE "SoftwareTitle" ADD COLUMN "trashedStatus" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SoftwareTitle" ADD COLUMN "trashedAt" TIMESTAMP(3);
ALTER TABLE "SoftwareTitle" ADD COLUMN "trashedById" INTEGER;
CREATE INDEX "MusicArtist_createdById_idx" ON "MusicArtist"("createdById");
CREATE INDEX "MusicAlbum_createdById_idx" ON "MusicAlbum"("createdById");
CREATE INDEX "MusicTrack_createdById_idx" ON "MusicTrack"("createdById");
CREATE INDEX "CinemaTitle_createdById_idx" ON "CinemaTitle"("createdById");
CREATE INDEX "SoftwareTitle_createdById_idx" ON "SoftwareTitle"("createdById");
-- A trashed row always says what it was and when it was asked; a row that is not trashed carries neither.
ALTER TABLE "Post" ADD CONSTRAINT "Post_trash_state" CHECK (("status" = 'TRASHED') = ("trashedAt" IS NOT NULL) AND ("status" = 'TRASHED') = ("trashedStatus" <> '') AND "trashedStatus" <> 'TRASHED');
ALTER TABLE "MusicAlbum" ADD CONSTRAINT "MusicAlbum_trash_state" CHECK (("status" = 'TRASHED') = ("trashedAt" IS NOT NULL) AND ("status" = 'TRASHED') = ("trashedStatus" <> '') AND "trashedStatus" <> 'TRASHED');
ALTER TABLE "MusicTrack" ADD CONSTRAINT "MusicTrack_trash_state" CHECK (("status" = 'TRASHED') = ("trashedAt" IS NOT NULL) AND ("status" = 'TRASHED') = ("trashedStatus" <> '') AND "trashedStatus" <> 'TRASHED');
ALTER TABLE "CinemaTitle" ADD CONSTRAINT "CinemaTitle_trash_state" CHECK (("status" = 'TRASHED') = ("trashedAt" IS NOT NULL) AND ("status" = 'TRASHED') = ("trashedStatus" <> '') AND "trashedStatus" <> 'TRASHED');
ALTER TABLE "SoftwareTitle" ADD CONSTRAINT "SoftwareTitle_trash_state" CHECK (("status" = 'TRASHED') = ("trashedAt" IS NOT NULL) AND ("status" = 'TRASHED') = ("trashedStatus" <> '') AND "trashedStatus" <> 'TRASHED');
