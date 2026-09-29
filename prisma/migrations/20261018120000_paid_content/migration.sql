-- CreateTable
CREATE TABLE "PaidItem" (
    "id" SERIAL NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "priceMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "vipAccess" TEXT NOT NULL DEFAULT 'FREE',
    "memberPriceMinor" BIGINT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sales" INTEGER NOT NULL DEFAULT 0,
    "revenueMinor" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaidItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPurchase" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "orderId" INTEGER,
    "paidMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "source" TEXT NOT NULL DEFAULT 'PURCHASE',
    "note" TEXT NOT NULL DEFAULT '',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaidItem_ownerType_ownerId_key" ON "PaidItem"("ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPurchase_userId_ownerType_ownerId_key" ON "ContentPurchase"("userId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "ContentPurchase_ownerType_ownerId_idx" ON "ContentPurchase"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "ContentPurchase_orderId_idx" ON "ContentPurchase"("orderId");
