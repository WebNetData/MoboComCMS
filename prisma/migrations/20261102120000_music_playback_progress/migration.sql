ALTER TABLE "MusicListenHistory" ADD COLUMN "positionSeconds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MusicListenHistory" ADD COLUMN "durationSeconds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MusicListenHistory" ADD COLUMN "progressUpdatedAt" TIMESTAMP(3);
ALTER TABLE "MusicListenHistory" ADD COLUMN "completedAt" TIMESTAMP(3);
