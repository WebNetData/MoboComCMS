-- Retain old profiles and addresses as aliases; never delete their identity or imported matching keys.
ALTER TABLE "MusicArtist" ADD COLUMN "mergedIntoId" INTEGER;
ALTER TABLE "MusicArtist" ADD CONSTRAINT "MusicArtist_merge_self" CHECK ("mergedIntoId" IS NULL OR "mergedIntoId" <> "id");
ALTER TABLE "MusicArtist" ADD CONSTRAINT "MusicArtist_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "MusicArtist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CinemaPerson" ADD COLUMN "mergedIntoId" INTEGER;
ALTER TABLE "CinemaPerson" ADD CONSTRAINT "CinemaPerson_merge_self" CHECK ("mergedIntoId" IS NULL OR "mergedIntoId" <> "id");
ALTER TABLE "CinemaPerson" ADD CONSTRAINT "CinemaPerson_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "CinemaPerson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
