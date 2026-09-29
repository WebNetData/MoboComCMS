-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "approval" TEXT NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "approvalNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sellerId" INTEGER;

-- AlterTable
ALTER TABLE "OrderLine" ADD COLUMN     "commissionMinor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "sellerId" INTEGER,
ADD COLUMN     "sellerStatus" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sellerTracking" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "Seller" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "legalName" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'PERSON',
    "nationalId" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "about" TEXT NOT NULL DEFAULT '',
    "logo" TEXT NOT NULL DEFAULT '',
    "banner" TEXT NOT NULL DEFAULT '',
    "iban" TEXT NOT NULL DEFAULT '',
    "ibanOwner" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusNote" TEXT NOT NULL DEFAULT '',
    "commissionPercent" INTEGER,
    "ratingSum" INTEGER NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Seller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerLedger" (
    "id" SERIAL NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "orderId" INTEGER,
    "orderLineId" INTEGER,
    "payoutId" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerPayout" (
    "id" SERIAL NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "iban" TEXT NOT NULL DEFAULT '',
    "ibanOwner" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "processedBy" INTEGER,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerReview" (
    "id" SERIAL NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "criteria" TEXT NOT NULL DEFAULT '{}',
    "body" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "reply" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Seller_userId_key" ON "Seller"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_slug_key" ON "Seller"("slug");

-- CreateIndex
CREATE INDEX "Seller_status_idx" ON "Seller"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SellerLedger_dedupeKey_key" ON "SellerLedger"("dedupeKey");

-- CreateIndex
CREATE INDEX "SellerLedger_sellerId_createdAt_idx" ON "SellerLedger"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "SellerLedger_orderId_idx" ON "SellerLedger"("orderId");

-- CreateIndex
CREATE INDEX "SellerPayout_sellerId_status_idx" ON "SellerPayout"("sellerId", "status");

-- CreateIndex
CREATE INDEX "SellerPayout_status_createdAt_idx" ON "SellerPayout"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SellerReview_sellerId_status_createdAt_idx" ON "SellerReview"("sellerId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SellerReview_orderId_sellerId_key" ON "SellerReview"("orderId", "sellerId");

-- CreateIndex
CREATE INDEX "Product_sellerId_idx" ON "Product"("sellerId");

-- CreateIndex
CREATE INDEX "OrderLine_sellerId_createdAt_idx" ON "OrderLine"("sellerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

