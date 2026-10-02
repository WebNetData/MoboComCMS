CREATE TABLE "UserMusicPlaylist" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserMusicPlaylist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserMusicPlaylistTrack" (
  "playlistId" INTEGER NOT NULL,
  "trackId" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserMusicPlaylistTrack_pkey" PRIMARY KEY ("playlistId","trackId")
);

CREATE INDEX "UserMusicPlaylist_userId_updatedAt_idx" ON "UserMusicPlaylist"("userId","updatedAt");
CREATE INDEX "UserMusicPlaylistTrack_playlistId_position_idx" ON "UserMusicPlaylistTrack"("playlistId","position");
CREATE INDEX "UserMusicPlaylistTrack_trackId_idx" ON "UserMusicPlaylistTrack"("trackId");
ALTER TABLE "UserMusicPlaylist" ADD CONSTRAINT "UserMusicPlaylist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserMusicPlaylistTrack" ADD CONSTRAINT "UserMusicPlaylistTrack_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "UserMusicPlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserMusicPlaylistTrack" ADD CONSTRAINT "UserMusicPlaylistTrack_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
