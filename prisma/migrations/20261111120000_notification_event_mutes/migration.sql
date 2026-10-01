CREATE TABLE "UserNotificationMute" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotificationMute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserNotificationMute_userId_kind_channel_key" ON "UserNotificationMute"("userId", "kind", "channel");
CREATE INDEX "UserNotificationMute_userId_idx" ON "UserNotificationMute"("userId");
ALTER TABLE "UserNotificationMute" ADD CONSTRAINT "UserNotificationMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
