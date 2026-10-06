-- Additive: announces a newly aired episode to the members who follow its series. Existing episodes get no row,
-- so nothing already aired is announced after the update.
CREATE TABLE "CinemaEpisodeAirNotification" (
  "id" SERIAL NOT NULL,
  "titleId" INTEGER NOT NULL,
  "season" INTEGER NOT NULL,
  "episode" INTEGER NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "lastUserId" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "CinemaEpisodeAirNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CinemaEpisodeAirNotification_titleId_season_episode_key" ON "CinemaEpisodeAirNotification"("titleId", "season", "episode");
CREATE INDEX "CinemaEpisodeAirNotification_completedAt_dueAt_idx" ON "CinemaEpisodeAirNotification"("completedAt", "dueAt");
ALTER TABLE "CinemaEpisodeAirNotification" ADD CONSTRAINT "CinemaEpisodeAirNotification_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "CinemaTitle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
