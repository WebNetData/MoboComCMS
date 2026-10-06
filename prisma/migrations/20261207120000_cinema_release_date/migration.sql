-- Additive: the day a film opens. Existing titles keep NULL and stay off the release calendar.
ALTER TABLE "CinemaTitle" ADD COLUMN "releaseDate" TIMESTAMP(3);
CREATE INDEX "CinemaTitle_kind_status_releaseDate_idx" ON "CinemaTitle"("kind", "status", "releaseDate");
