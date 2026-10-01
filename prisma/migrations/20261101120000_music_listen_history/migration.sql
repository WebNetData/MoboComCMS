CREATE TABLE "MusicListenHistory" (
    "userId" INTEGER NOT NULL,
    "trackId" INTEGER NOT NULL,
    "playCount" INTEGER NOT NULL DEFAULT 1,
    "firstPlayedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastPlayedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MusicListenHistory_pkey" PRIMARY KEY ("userId","trackId")
);

CREATE INDEX "MusicListenHistory_userId_lastPlayedAt_idx" ON "MusicListenHistory"("userId", "lastPlayedAt");

ALTER TABLE "MusicListenHistory" ADD CONSTRAINT "MusicListenHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MusicListenHistory" ADD CONSTRAINT "MusicListenHistory_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
