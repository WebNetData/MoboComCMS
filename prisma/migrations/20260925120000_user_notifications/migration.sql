CREATE TABLE "UserNotification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleFa" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL DEFAULT '',
    "bodyFa" TEXT NOT NULL DEFAULT '',
    "href" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserNotification_dedupeKey_key" ON "UserNotification"("dedupeKey");
CREATE INDEX "UserNotification_userId_createdAt_idx" ON "UserNotification"("userId", "createdAt");
CREATE INDEX "UserNotification_userId_readAt_idx" ON "UserNotification"("userId", "readAt");
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
