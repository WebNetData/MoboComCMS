ALTER TABLE "ProductReview" ADD COLUMN "criteria" TEXT NOT NULL DEFAULT '{}';

ALTER TABLE "ProductQuestion" DROP CONSTRAINT "ProductQuestion_userId_fkey";
ALTER TABLE "ProductQuestion" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "ProductQuestion" ADD COLUMN "guestName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProductQuestion" ADD CONSTRAINT "ProductQuestion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
