CREATE TABLE "MusicTrackReleaseNotification" (
    "trackId" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "lastUserId" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MusicTrackReleaseNotification_pkey" PRIMARY KEY ("trackId")
);

CREATE INDEX "MusicTrackReleaseNotification_completedAt_dueAt_idx" ON "MusicTrackReleaseNotification"("completedAt", "dueAt");

ALTER TABLE "MusicTrackReleaseNotification" ADD CONSTRAINT "MusicTrackReleaseNotification_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
