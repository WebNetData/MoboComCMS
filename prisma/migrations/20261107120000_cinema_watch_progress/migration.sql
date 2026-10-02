CREATE TABLE "CinemaWatchProgress" (
  "userId" INTEGER NOT NULL,
  "ownerType" TEXT NOT NULL,
  "ownerId" INTEGER NOT NULL,
  "positionSeconds" INTEGER NOT NULL DEFAULT 0,
  "durationSeconds" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "CinemaWatchProgress_pkey" PRIMARY KEY ("userId", "ownerType", "ownerId"),
  CONSTRAINT "CinemaWatchProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CinemaWatchProgress_userId_updatedAt_idx" ON "CinemaWatchProgress"("userId", "updatedAt");
