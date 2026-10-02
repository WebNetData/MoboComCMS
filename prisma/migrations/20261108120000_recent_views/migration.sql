CREATE TABLE "UserRecentView" (
  "userId" INTEGER NOT NULL,
  "itemType" TEXT NOT NULL,
  "itemId" INTEGER NOT NULL,
  "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserRecentView_pkey" PRIMARY KEY ("userId", "itemType", "itemId"),
  CONSTRAINT "UserRecentView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "UserRecentView_userId_lastViewedAt_idx" ON "UserRecentView"("userId", "lastViewedAt");
