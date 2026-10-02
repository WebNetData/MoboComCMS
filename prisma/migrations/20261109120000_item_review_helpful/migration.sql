CREATE TABLE "ItemReviewHelpful" (
  "reviewId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemReviewHelpful_pkey" PRIMARY KEY ("reviewId", "userId"),
  CONSTRAINT "ItemReviewHelpful_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ItemReview"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ItemReviewHelpful_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ItemReviewHelpful_userId_idx" ON "ItemReviewHelpful"("userId");
