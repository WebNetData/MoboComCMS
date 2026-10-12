CREATE TABLE "BusinessProfile" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'EXTERNAL',
  "domain" TEXT,
  "website" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "sellerId" INTEGER,
  "representativeId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BusinessProfile_status_check" CHECK ("status" IN ('DRAFT', 'PUBLISHED')),
  CONSTRAINT "BusinessProfile_identity_check" CHECK (
    ("kind" = 'EXTERNAL' AND "domain" IS NOT NULL AND "website" <> '' AND "sellerId" IS NULL) OR
    ("kind" = 'SELLER' AND "sellerId" IS NOT NULL AND "domain" IS NULL AND "website" = '' AND "representativeId" IS NULL) OR
    ("kind" = 'SITE' AND "sellerId" IS NULL AND "domain" IS NULL AND "website" = '')
  )
);
CREATE UNIQUE INDEX "BusinessProfile_slug_key" ON "BusinessProfile"("slug");
CREATE UNIQUE INDEX "BusinessProfile_domain_key" ON "BusinessProfile"("domain");
CREATE UNIQUE INDEX "BusinessProfile_sellerId_key" ON "BusinessProfile"("sellerId");
CREATE UNIQUE INDEX "BusinessProfile_one_site_key" ON "BusinessProfile"("kind") WHERE "kind" = 'SITE';
CREATE INDEX "BusinessProfile_status_category_createdAt_idx" ON "BusinessProfile"("status", "category", "createdAt");
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_representativeId_fkey" FOREIGN KEY ("representativeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ItemReview" ADD COLUMN "experiencedOn" TIMESTAMP(3), ADD COLUMN "businessReply" TEXT NOT NULL DEFAULT '', ADD COLUMN "businessReplyBy" INTEGER, ADD COLUMN "businessReplyAt" TIMESTAMP(3);
ALTER TABLE "ItemReview" ADD CONSTRAINT "ItemReview_businessReplyBy_fkey" FOREIGN KEY ("businessReplyBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
