-- Add business targets to the existing reports store without changing old post/comment rows.
ALTER TABLE "CommunityReport"
  ADD COLUMN "businessId" INTEGER,
  ADD COLUMN "itemReviewId" INTEGER,
  ADD COLUMN "sellerReviewId" INTEGER,
  ADD COLUMN "businessReviewDigest" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "decisionNote" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "reviewedById" INTEGER,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD CONSTRAINT "CommunityReport_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "BusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunityReport_itemReviewId_fkey" FOREIGN KEY ("itemReviewId") REFERENCES "ItemReview"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunityReport_sellerReviewId_fkey" FOREIGN KEY ("sellerReviewId") REFERENCES "SellerReview"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunityReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CommunityReport_business_target_check" CHECK (
    ("businessId" IS NULL AND "itemReviewId" IS NULL AND "sellerReviewId" IS NULL)
    OR ("businessId" IS NOT NULL AND "postId" IS NULL AND "commentId" IS NULL AND
      (("itemReviewId" IS NOT NULL AND "sellerReviewId" IS NULL) OR ("itemReviewId" IS NULL AND "sellerReviewId" IS NOT NULL))
      AND "businessReviewDigest" ~ '^[0-9a-f]{64}$' AND "status" IN ('OPEN','RESOLVED','DISMISSED'))
  );
CREATE INDEX "CommunityReport_businessId_status_id_idx" ON "CommunityReport"("businessId", "status", "id");
CREATE UNIQUE INDEX "CommunityReport_open_business_item_key" ON "CommunityReport"("reporterId","businessId","itemReviewId") WHERE "businessId" IS NOT NULL AND "itemReviewId" IS NOT NULL AND "status" = 'OPEN';
CREATE UNIQUE INDEX "CommunityReport_open_business_seller_key" ON "CommunityReport"("reporterId","businessId","sellerReviewId") WHERE "businessId" IS NOT NULL AND "sellerReviewId" IS NOT NULL AND "status" = 'OPEN';

CREATE TABLE "BusinessPurchaseProof" (
  "id" SERIAL NOT NULL PRIMARY KEY,
  "businessId" INTEGER NOT NULL REFERENCES "BusinessProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "reviewId" INTEGER NOT NULL REFERENCES "ItemReview"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "reviewerId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewDigest" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "decisionNote" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "BusinessPurchaseProof_status_check" CHECK ("status" IN ('PENDING','APPROVED','REJECTED','WITHDRAWN')),
  CONSTRAINT "BusinessPurchaseProof_independent_check" CHECK ("reviewerId" IS NULL OR "reviewerId" <> "userId"),
  CONSTRAINT "BusinessPurchaseProof_file_check" CHECK ("size" > 0 AND "size" <= 5242880 AND "mimeType" IN ('image/png','image/jpeg','image/webp') AND "filename" ~ '^[0-9a-f-]{36}\.(png|jpg|webp)$' AND "sha256" ~ '^[0-9a-f]{64}$' AND "reviewDigest" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "BusinessPurchaseProof_filename_key" ON "BusinessPurchaseProof"("filename");
CREATE UNIQUE INDEX "BusinessPurchaseProof_pending_review_key" ON "BusinessPurchaseProof"("reviewId") WHERE "status" = 'PENDING';
CREATE INDEX "BusinessPurchaseProof_status_id_idx" ON "BusinessPurchaseProof"("status","id");
CREATE INDEX "BusinessPurchaseProof_userId_id_idx" ON "BusinessPurchaseProof"("userId","id");
CREATE INDEX "BusinessPurchaseProof_reviewId_status_idx" ON "BusinessPurchaseProof"("reviewId","status");
