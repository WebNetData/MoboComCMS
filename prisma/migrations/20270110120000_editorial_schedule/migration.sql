ALTER TABLE "UserCollection" ADD COLUMN "publishAt" TIMESTAMP(3);
ALTER TABLE "UserCollection" ADD COLUMN "scheduledById" INTEGER;
ALTER TABLE "UserCollection" ADD COLUMN "scheduleAuthorizedAt" TIMESTAMP(3);
ALTER TABLE "UserCollection" ADD COLUMN "scheduleError" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UserCollection" ADD CONSTRAINT "UserCollection_scheduledById_fkey"
  FOREIGN KEY ("scheduledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "UserCollection_staffAuthored_publishAt_idx" ON "UserCollection"("staffAuthored", "publishAt");
