-- Additive: existing reviews keep their stars and text; they start without a badge and without dimension scores.
ALTER TABLE "ItemReview" ADD COLUMN "verified" TEXT NOT NULL DEFAULT '';
CREATE TABLE "ItemReviewScore" (
  "reviewId" INTEGER NOT NULL,
  "key" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  CONSTRAINT "ItemReviewScore_pkey" PRIMARY KEY ("reviewId", "key"),
  CONSTRAINT "ItemReviewScore_score" CHECK ("score" BETWEEN 1 AND 5)
);
ALTER TABLE "ItemReviewScore" ADD CONSTRAINT "ItemReviewScore_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ItemReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
